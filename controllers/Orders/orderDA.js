// Data access for orders: runs the queries in sql.js and returns plain rows.
// Functions that take `tx` run inside the caller's transaction (placing and cancelling orders).
const { customQuery, multiQuery, inTransaction } = require('../../utils/dbFunctions');
const sql = require('./sql');

const run = (tx) => (tx ? tx.run : customQuery);

exports.withTransaction = inTransaction;

// Current price and stock for the given product ids (prices from the browser are never trusted).
exports.getPriceLines = async (productIds, tx) => {
    const inputs = Object.fromEntries(productIds.map((id, i) => [`P${i}`, id]));
    return await run(tx)(sql.GET_PRICE_LINES(productIds.length), inputs);
};

exports.nextOrderNo = async (tx) => {
    const [{ N }] = await run(tx)(sql.NEXT_ORDER_NO());
    return N;
};

exports.insertOrder = async (tx, o) => {
    const [{ OrderId }] = await run(tx)(sql.INSERT_ORDER(), {
        OrderNo: o.orderNo,
        CustomerId: o.customerId,
        FulfilmentType: o.fulfilment,
        PaymentMethod: o.paymentMethod,
        ShipName: o.address?.Name || null,
        ShipMobile: o.address?.Mobile || null,
        ShipLine1: o.address?.Line1 || null,
        ShipLine2: o.address?.Line2 || null,
        ShipLandmark: o.address?.Landmark || null,
        ShipCity: o.address?.City || null,
        ShipState: o.address?.State || null,
        ShipPincode: o.address?.Pincode || null,
        ZoneId: o.zoneId || null,
        Subtotal: o.totals.Subtotal,
        MrpTotal: o.totals.MrpTotal,
        Shipping: o.totals.ShippingCharge,
        Grand: o.totals.GrandTotal,
        Note: o.note,
    });
    return OrderId;
};

exports.insertOrderItem = async (tx, orderId, i) => {
    return await run(tx)(sql.INSERT_ORDER_ITEM(), {
        OrderId: orderId,
        ProductId: i.ProductId,
        Title: i.Title,
        Mrp: i.Mrp,
        PricingMode: i.PricingMode,
        UnitPrice: i.UnitPrice,
        GstPercent: i.GstPercent,
        HsnCode: i.HsnCode,
        Qty: i.Qty,
    });
};

exports.insertOrderHistory = async (tx, { orderId, status, note, customerId }) => {
    return await run(tx)(sql.INSERT_ORDER_HISTORY(), { OrderId: orderId, Status: status, Note: note, CustomerId: customerId });
};

exports.clearCart = async (tx, customerId) => {
    return await run(tx)(sql.CLEAR_CART(), { CustomerId: customerId });
};

exports.getOrdersByCustomer = async (customerId) => {
    return await customQuery(sql.GET_ORDERS_BY_CUSTOMER(), { CustomerId: customerId });
};

exports.getOrderThumbnails = async (customerId) => {
    return await customQuery(sql.GET_ORDER_THUMBNAILS(), { CustomerId: customerId });
};

exports.getOrderByNo = async (customerId, orderNo) => {
    const [[order], items, history, [invoice]] = await multiQuery(sql.GET_ORDER_BY_NO(), { OrderNo: orderNo, CustomerId: customerId });
    return { order, items, history, invoice };
};

exports.lockOrderByNo = async (tx, customerId, orderNo) => {
    const [row] = await run(tx)(sql.LOCK_ORDER_BY_NO(), { OrderNo: orderNo, CustomerId: customerId });
    return row || null;
};

exports.getOrderItems = async (tx, orderId) => {
    return await run(tx)(sql.GET_ORDER_ITEMS(), { OrderId: orderId });
};

exports.markOrderCancelled = async (tx, orderId, reason) => {
    return await run(tx)(sql.MARK_ORDER_CANCELLED(), { OrderId: orderId, Reason: reason });
};

exports.getInvoice = async (customerId, orderNo) => {
    const [[invoice], lines] = await multiQuery(sql.GET_INVOICE(), { OrderNo: orderNo, CustomerId: customerId });
    return { invoice, lines };
};

exports.trackOrder = async (orderNo, mobile) => {
    const [row] = await customQuery(sql.TRACK_ORDER(), { OrderNo: orderNo, Mobile: mobile });
    return row || null;
};

exports.trackHistory = async (orderId) => {
    return await customQuery(sql.TRACK_HISTORY(), { OrderId: orderId });
};
