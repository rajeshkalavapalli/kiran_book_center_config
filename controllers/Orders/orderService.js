// Business rules for checkout and orders: pricing from the database, delivery zones, stock reservation,
// first-order sign-up, cancelling, invoices and public tracking.
// No SQL and no req/res here: the database goes through orderDA.js, the HTTP side is orderHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const { fail, text, money } = require('../../utils/access');
const { issueToken } = require('../../utils/auth');
const { allSettings, isOn, zoneFor, deliveryCharge, moveStock, audit, isPincode, STATES } = require('../../utils/shop');
const { validateNew, createCustomer, publicCustomer } = require('../Auth/authService');
const { cleanAddress, saveAddress } = require('../Account/accountService');
const orderDA = require('./orderDA');

const CUSTOMER_CAN_CANCEL = ['PLACED', 'CONFIRMED'];
const MAX_CART_LINES = 100;
const TRACK_LIMIT = { windowMs: 10 * 60 * 1000, max: 8 };
const recentTracks = new Map();
const NO_DELIVERY = "Sorry, we don't deliver to this area right now. Choose pickup or another address.";

/* ---------------- helpers ---------------- */

const cleanNo = (orderNo) => String(orderNo || '').trim().toUpperCase();
const maxQtyFrom = (s) => Number(s['order.maxQtyPerItem']) || 50;

// Combines duplicate lines, caps quantities, checks stock and prices everything from the database.
const priceCart = async (cart, maxQty, tx) => {
    const merged = new Map();
    (Array.isArray(cart) ? cart : []).slice(0, MAX_CART_LINES).forEach((l) => {
        const id = String(l?.ProductId || '').toLowerCase();
        const qty = Math.trunc(Number(l?.Qty));
        if (/^[0-9a-f-]{36}$/.test(id) && qty >= 1) merged.set(id, (merged.get(id) || 0) + qty);
    });
    if (!merged.size) throw fail(400, 'Your bag is empty.');
    const ids = [...merged.keys()];
    const rows = await orderDA.getPriceLines(ids, tx);
    return ids.map((id) => {
        const p = rows.find((r) => r.ProductId.toLowerCase() === id);
        if (!p || !p.IsActive) throw fail(409, 'An item in your bag is no longer available. Please remove it.');
        const qty = merged.get(id);
        if (qty > maxQty) throw fail(400, `You can order up to ${maxQty} copies of "${p.Title}". For more, send a bulk enquiry.`);
        if (p.StockQty < qty) throw fail(409, p.StockQty ? `Only ${p.StockQty} left of "${p.Title}". Please lower the quantity.` : `"${p.Title}" just went out of stock. Please remove it from your bag.`);
        return { ...p, Qty: qty, UnitPrice: Number(p.SellingPrice), LineTotal: money(Number(p.SellingPrice) * qty) };
    });
};

const totals = (items, shipping) => {
    const Subtotal = money(items.reduce((n, i) => n + i.LineTotal, 0));
    const MrpTotal = money(items.reduce((n, i) => n + Number(i.Mrp) * i.Qty, 0));
    return { Subtotal, MrpTotal, ShippingCharge: shipping, GrandTotal: money(Subtotal + shipping) };
};

// Payment, pickup and address checks before an order is placed.
const checkOrderRequest = (s, signedIn, body) => {
    const fulfilment = body.fulfilment === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
    const method = body.paymentMethod;
    if (method === 'COD' && !isOn(s, 'payment.codEnabled')) throw fail(400, 'Cash on delivery is not available right now.');
    if (method === 'UPI_LATER' && !isOn(s, 'payment.upiLaterEnabled')) throw fail(400, 'Pay later via UPI is not available right now.');
    if (!['COD', 'UPI_LATER'].includes(method)) throw fail(400, "Choose how you'd like to pay.");
    if (fulfilment === 'PICKUP' && !isOn(s, 'order.pickupEnabled')) throw fail(400, 'Pickup from the shop is not available right now.');
    const address = fulfilment === 'DELIVERY' ? cleanAddress(body.address) : null;
    if (!signedIn) {
        const problem = validateNew(body.newCustomer || {});
        if (problem) throw fail(400, problem);
    }
    return { fulfilment, method, address };
};

// At most 8 tracking tries per 10 minutes from one address.
const checkTrackLimit = (ip) => {
    const now = Date.now();
    const hits = (recentTracks.get(ip) || []).filter((t) => now - t < TRACK_LIMIT.windowMs);
    if (hits.length >= TRACK_LIMIT.max) throw fail(429, 'Too many tries. Please wait a few minutes and try again.');
    recentTracks.set(ip, [...hits, now]);
};

/* ---------------- service functions (called by orderHandler.js) ---------------- */

// Checkout total for the bag (public): prices, delivery charge for the address or pickup.
exports.getCheckoutQuote = async (cart, fulfilment, address) => {
    try {
        const s = await allSettings();
        const items = await priceCart(cart, maxQtyFrom(s));
        const subtotal = items.reduce((n, i) => n + i.LineTotal, 0);
        let zone = null;
        let needsAddress = false;
        if (fulfilment === 'PICKUP') {
            if (!isOn(s, 'order.pickupEnabled')) throw fail(400, 'Pickup from the shop is not available right now.');
        } else if (isPincode(address?.Pincode) && STATES.includes(address?.State)) {
            zone = await zoneFor({ pincode: address.Pincode, state: address.State });
            if (!zone) throw fail(400, NO_DELIVERY);
        } else needsAddress = true;
        const shipping = fulfilment === 'PICKUP' ? 0 : deliveryCharge(zone, subtotal);
        return {
            ...totals(items, shipping),
            zone: zone ? { Code: zone.Code, Name: zone.Name, Charge: Number(zone.Charge), FreeAbove: zone.FreeAbove == null ? null : Number(zone.FreeAbove), EtaDays: zone.EtaDays } : null,
            needsAddress,
            items: items.map((i) => ({ ProductId: i.ProductId, Title: i.Title, Qty: i.Qty, UnitPrice: i.UnitPrice, LineTotal: i.LineTotal, StockQty: i.StockQty })),
        };
    } catch (err) {
        if (!err.status) console.log('error in orderService.getCheckoutQuote', err);
        throw err;
    }
};

/**
 * Places an order.
 * orderData: { cart, fulfilment, address, paymentMethod, note, saveAddress, newCustomer? }
 * A first-time buyer sends newCustomer {name, mobile, email, password}: the account is created in the
 * same transaction and a session token comes back with the order.
 */
exports.placeOrder = async (signedInCustomer, orderData) => {
    try {
        const s = await allSettings();
        const { fulfilment, method, address } = checkOrderRequest(s, signedInCustomer, orderData);

        const placed = await orderDA.withTransaction(async (tx) => {
            let customerId = signedInCustomer?.customerId;
            let created = null;
            if (!customerId) {
                created = await createCustomer(orderData.newCustomer, tx);
                customerId = created.CustomerId;
            }
            const items = await priceCart(orderData.cart, maxQtyFrom(s), tx);
            const subtotal = items.reduce((n, i) => n + i.LineTotal, 0);
            const zone = address ? await zoneFor({ pincode: address.Pincode, state: address.State }, tx) : null;
            if (address && !zone) throw fail(400, NO_DELIVERY);
            const t = totals(items, address ? deliveryCharge(zone, subtotal) : 0);

            const orderNo = `KBC-${String(await orderDA.nextOrderNo(tx)).padStart(6, '0')}`;
            const orderId = await orderDA.insertOrder(tx, { orderNo, customerId, fulfilment, paymentMethod: method, address, zoneId: zone?.ZoneId, totals: t, note: text(orderData.note, 500) });
            for (const i of items) {
                await orderDA.insertOrderItem(tx, orderId, i);
                // Stock is reserved now; it returns if the order is cancelled.
                await moveStock(tx, { productId: i.ProductId, change: -i.Qty, reason: 'ORDER', refId: orderId, note: orderNo });
            }
            await orderDA.insertOrderHistory(tx, { orderId, status: 'PLACED', note: fulfilment === 'PICKUP' ? 'Pickup from the shop.' : `Delivery: ${zone.Name}.`, customerId });
            if (address && (orderData.saveAddress || created)) await saveAddress(customerId, address, tx);
            await orderDA.clearCart(tx, customerId);
            return { orderNo, customerId, created };
        });

        await audit({ actorId: placed.customerId, action: 'ORDER_PLACED', entityType: 'Order', entityId: placed.orderNo });
        const order = await exports.getOrderByNo(placed.customerId, placed.orderNo);
        const result = placed.created ? { order, customer: publicCustomer(placed.created), ...issueToken(placed.customerId) } : { order };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.placeOrder', err);
        throw err;
    }
};

// All orders of the signed-in customer, with up to 3 item thumbnails each.
exports.getOrders = async (customerId) => {
    try {
        const [orders, thumbs] = await Promise.all([orderDA.getOrdersByCustomer(customerId), orderDA.getOrderThumbnails(customerId)]);
        const result = orders.map((o) => ({
            ...o,
            Items: thumbs.filter((t) => t.OrderNo === o.OrderNo).map((t) => ({ ProductId: t.ProductId, Title: t.Title, ProductType: t.ProductType, Images: t.Image ? [t.Image] : [] })),
        }));
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.getOrders', err);
        throw err;
    }
};

// One order with its items, history and invoice number (if issued).
exports.getOrderByNo = async (customerId, orderNo) => {
    try {
        const { order, items, history, invoice } = await orderDA.getOrderByNo(customerId, cleanNo(orderNo));
        if (!order) throw fail(404, "We couldn't find that order on your account.");
        const result = { ...order, Items: items.map(({ Image, ...i }) => ({ ...i, Images: Image ? [Image] : [] })), History: history, Invoice: invoice || null };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.getOrderByNo', err);
        throw err;
    }
};

// The customer cancels an order (only before it is packed). Stock goes back on the shelf.
exports.cancelOrder = async (customerId, orderNo, reason) => {
    try {
        const no = cleanNo(orderNo);
        const why = text(reason, 300);
        await orderDA.withTransaction(async (tx) => {
            const o = await orderDA.lockOrderByNo(tx, customerId, no);
            if (!o) throw fail(404, 'Order not found.');
            if (!CUSTOMER_CAN_CANCEL.includes(o.Status)) throw fail(409, "This order is already packed, so it can't be cancelled online. Please call or WhatsApp the shop.");
            const items = await orderDA.getOrderItems(tx, o.OrderId);
            for (const i of items) await moveStock(tx, { productId: i.ProductId, change: i.Qty, reason: 'CANCEL', refId: o.OrderId, note: o.OrderNo });
            await orderDA.markOrderCancelled(tx, o.OrderId, why);
            await orderDA.insertOrderHistory(tx, { orderId: o.OrderId, status: 'CANCELLED', note: why ? `Cancelled by you: ${why}` : 'Cancelled by you.', customerId });
        });
        await audit({ actorId: customerId, action: 'ORDER_CANCELLED', entityType: 'Order', entityId: no });
        const result = await exports.getOrderByNo(customerId, no);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.cancelOrder', err);
        throw err;
    }
};

// The GST invoice of an order (exists once the order ships or is handed over).
exports.getInvoice = async (customerId, orderNo) => {
    try {
        const { invoice, lines } = await orderDA.getInvoice(customerId, cleanNo(orderNo));
        if (!invoice) throw fail(404, 'The invoice is issued when your order ships or is handed over.');
        const result = { ...invoice, Lines: lines };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.getInvoice', err);
        throw err;
    }
};

// Public tracking by order number + the mobile used on the order (rate-limited per IP).
exports.trackOrder = async (ip, orderNo, mobile) => {
    try {
        checkTrackLimit(ip);
        const no = cleanNo(orderNo);
        const m = String(mobile || '').trim();
        if (!no || !/^\d{10}$/.test(m)) throw fail(400, 'Enter your order number and the 10-digit mobile number used on the order.');
        const o = await orderDA.trackOrder(no, m);
        if (!o) throw fail(404, 'No order matches that order number and mobile number.');
        const history = await orderDA.trackHistory(o.OrderId);
        const { OrderId, ...rest } = o;
        const result = { ...rest, History: history };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in orderService.trackOrder', err);
        throw err;
    }
};
