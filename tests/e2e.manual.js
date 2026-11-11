// End-to-end check of the customer API against the real database (uses .env).
//   node tests/e2e.manual.js
// Creates a temporary category, products (with a photo), customer, orders and a request (all "ZZ TEST"),
// runs every shop flow through the HTTP API, then deletes everything it created.
// Development database only.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const app = require('../app');
const db = require('../db');
const { customQuery } = require('../utils/dbFunctions');
const fileStore = require('../utils/fileStore');

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok) });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF_URL = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')}`;

(async () => {
    await db.poolPromise;
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api`;
    let token = null;
    const api = async (method, p, body, tok = token) => {
        const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
        const type = res.headers.get('content-type') || '';
        return { status: res.status, body: type.includes('json') ? await res.json() : null, type };
    };

    const tag = crypto.randomBytes(3).toString('hex');
    const ids = { categoryId: null, products: [], customerId: null, imageKey: null, attachmentKeys: [] };
    const seqBefore = await customQuery('SELECT (SELECT CAST(current_value AS INT) FROM sys.sequences WHERE name = \'OrderNoSeq\') AS O, (SELECT CAST(current_value AS INT) FROM sys.sequences WHERE name = \'RequestNoSeq\') AS R');
    const mobile = `7${String(crypto.randomInt(100000000, 999999999))}`;
    const password = `Pass-${tag}-word`;

    try {
        /* ---------- set up catalogue rows (as the owner would through the admin API) ---------- */
        [{ CategoryId: ids.categoryId }] = await customQuery(`INSERT INTO dbo.Categories (Name, Slug, SortOrder) OUTPUT inserted.CategoryId VALUES (@N, @S, 999)`, { N: `ZZ TEST ${tag}`, S: `zz-test-${tag}` });
        for (const [title, mrp, mode, disc, net, stock, type] of [[`ZZ TEST Guide ${tag}`, 300, 'DISCOUNT', 10, null, 5, 'BOOK'], [`ZZ TEST Textbook ${tag}`, 120, 'NET', null, 120, 2, 'BOOK'], [`ZZ TEST Pen ${tag}`, 50, 'DISCOUNT', 0, null, 0, 'STATIONERY']]) {
            const [{ ProductId }] = await customQuery(
                `INSERT INTO dbo.Products (ProductType, CategoryId, Title, Slug, Author, Mrp, PricingMode, DiscountPercent, NetPrice, GstPercent, HsnCode, StockQty, IsFeatured)
                 OUTPUT inserted.ProductId VALUES (@T, @C, @Title, @Slug, 'Test Author', @Mrp, @Mode, @Disc, @Net, 0, '4901', @Stock, 1)`,
                { T: type, C: ids.categoryId, Title: title, Slug: title.toLowerCase().replace(/\s+/g, '-'), Mrp: mrp, Mode: mode, Disc: disc, Net: net, Stock: stock }
            );
            ids.products.push(ProductId);
        }
        const [guide, textbook, pen] = ids.products;
        ids.imageKey = fileStore.newKey(`products/${guide}`, 'png');
        await fileStore.put(ids.imageKey, PNG);
        await customQuery('INSERT INTO dbo.ProductImages (ProductId, StorageKey, SortOrder, IsPrimary) VALUES (@P, @K, 0, 1)', { P: guide, K: ids.imageKey });

        /* ---------- public catalogue ---------- */
        let r = await api('GET', '/settings/public');
        check('Public settings and delivery zones', r.status === 200 && r.body.settings['shop.name'] && r.body.zones.length >= 1 && !('gst.gstin' in r.body.settings), `${r.body.zones?.length} zones`);
        await new Promise((res) => setTimeout(res, 61000 * 0)); // categories cache: first call in this process, so no wait needed
        r = await api('GET', '/categories');
        check('Categories include the new one', r.status === 200 && r.body.some((c) => c.Slug === `zz-test-${tag}` && c.ProductCount === 3));
        r = await api('GET', `/products?category=zz-test-${tag}&sort=priceLow`);
        check('Products by category, sorted by price', r.status === 200 && r.body.total === 3 && Number(r.body.items[0].SellingPrice) === 50 && r.body.items.find((p) => p.ProductId === guide)?.Images[0] === ids.imageKey, `total ${r.body.total}`);
        r = await api('GET', `/products?q=${encodeURIComponent(`ZZ TEST Guide ${tag}`)}`);
        check('Search finds the product', r.status === 200 && r.body.total === 1 && Number(r.body.items[0].SellingPrice) === 270);
        r = await api('GET', `/products?category=zz-test-${tag}&stock=1&net=1`);
        check('Filters: in stock + net price only', r.status === 200 && r.body.total === 1 && r.body.items[0].ProductId === textbook);
        r = await api('GET', `/products?category=zz-test-${tag}&type=STATIONERY`);
        check('Filter by type', r.status === 200 && r.body.total === 1 && r.body.items[0].ProductId === pen);
        const slug = `zz-test-guide-${tag}`;
        r = await api('GET', `/products/${slug}`);
        check('Product page with photo, category and related items', r.status === 200 && r.body.product.Images.length === 1 && r.body.category?.Slug === `zz-test-${tag}` && r.body.related.length === 2);
        r = await api('GET', '/products/no-such-book-xyz');
        check('Unknown product gives 404', r.status === 404);
        r = await api('GET', '/home');
        check('Home sections load', r.status === 200 && Array.isArray(r.body.featured) && Array.isArray(r.body.newArrivals) && r.body.counts);
        r = await api('GET', '/facets');
        check('Filter options load', r.status === 200 && Array.isArray(r.body.classLevels));
        const photo = await fetch(`${base}/files/${ids.imageKey}`);
        check('Product photo served from the shared uploads folder', photo.status === 200 && photo.headers.get('content-type') === 'image/png');

        /* ---------- checkout quote ---------- */
        r = await api('POST', '/checkout/quote', { cart: [{ ProductId: guide, Qty: 2 }, { ProductId: textbook, Qty: 1 }], fulfilment: 'PICKUP' });
        check('Quote for pickup: prices from the database, no delivery charge', r.status === 200 && r.body.Subtotal === 660 && r.body.ShippingCharge === 0 && r.body.MrpTotal === 720, `subtotal ${r.body.Subtotal}`);
        r = await api('POST', '/checkout/quote', { cart: [{ ProductId: guide, Qty: 1 }], fulfilment: 'DELIVERY', address: { State: 'Tamil Nadu', Pincode: '600001' } });
        check('Quote for delivery picks a zone and a charge', r.status === 200 && r.body.zone && r.body.GrandTotal === r.body.Subtotal + r.body.ShippingCharge, `${r.body.zone?.Name} ₹${r.body.ShippingCharge}`);
        r = await api('POST', '/checkout/quote', { cart: [{ ProductId: guide, Qty: 99 }], fulfilment: 'PICKUP' });
        check('Quote refuses more than the stock', r.status === 409 || r.status === 400, r.body.message);
        r = await api('POST', '/checkout/quote', { cart: [{ ProductId: pen, Qty: 1 }], fulfilment: 'PICKUP' });
        check('Quote refuses an out-of-stock item', r.status === 409, r.body.message);

        /* ---------- first order creates the account ---------- */
        const address = { Name: 'ZZ TEST Buyer', Mobile: mobile, Line1: '1 Test Street', City: 'Chennai', State: 'Tamil Nadu', Pincode: '600001' };
        r = await api('POST', '/orders', { cart: [{ ProductId: guide, Qty: 2 }], fulfilment: 'DELIVERY', address, paymentMethod: 'UPI_LATER', newCustomer: { name: 'ZZ TEST Buyer', mobile, password: 'short' } }, null);
        check('Weak password at checkout is refused', r.status === 400, r.body.message);
        r = await api('POST', '/orders', { cart: [{ ProductId: guide, Qty: 2 }], fulfilment: 'DELIVERY', address, paymentMethod: 'UPI_LATER', note: 'Please call first', newCustomer: { name: 'ZZ TEST Buyer', mobile, password } }, null);
        check('First order creates the account and signs in', r.status === 201 && /^KBC-\d{6}$/.test(r.body.order?.OrderNo) && r.body.token && r.body.customer?.Mobile === mobile, r.body.order?.OrderNo || r.body.message);
        token = r.body.token;
        ids.customerId = r.body.customer?.CustomerId;
        const order1 = r.body.order?.OrderNo;
        check('Order totals and status are right', r.body.order?.Status === 'PLACED' && r.body.order?.PaymentStatus === 'PENDING' && Number(r.body.order?.Subtotal) === 540 && r.body.order?.Items?.length === 1);
        let [{ StockQty }] = await customQuery('SELECT StockQty FROM dbo.Products WHERE ProductId = @P', { P: guide });
        check('Stock reserved when the order is placed (5 → 3)', StockQty === 3, `stock ${StockQty}`);
        r = await api('POST', '/orders', { cart: [{ ProductId: textbook, Qty: 1 }], fulfilment: 'PICKUP', paymentMethod: 'COD', newCustomer: { name: 'Someone', mobile, password } }, null);
        check('Same mobile as a new customer is refused', r.status === 409, r.body.message);

        /* ---------- sign in / account ---------- */
        r = await api('POST', '/auth/login', { mobile, password: 'wrong-password' }, null);
        check('Wrong password refused', r.status === 401);
        r = await api('POST', '/auth/login', { mobile, password }, null);
        check('Sign in with mobile + password', r.status === 200 && r.body.token);
        token = r.body.token;
        r = await api('POST', '/auth/register', { name: 'Dup', mobile, password }, null);
        check('Register with a used mobile is refused', r.status === 409);
        r = await api('GET', '/auth/me');
        check('Me', r.status === 200 && r.body.customer.Mobile === mobile);
        r = await api('GET', '/orders', null, null);
        check('My orders needs sign-in', r.status === 401);
        r = await api('PUT', '/account/profile', { name: 'ZZ TEST Buyer Renamed', email: `zz.${tag}@example.com` });
        check('Update profile', r.status === 200 && r.body.customer.Name === 'ZZ TEST Buyer Renamed');
        r = await api('GET', '/account/addresses');
        check('Checkout address was saved as default', r.status === 200 && r.body.length === 1 && r.body[0].IsDefault === true);
        r = await api('POST', '/account/addresses', { ...address, Line1: '2 Other Street', Pincode: '600002' });
        check('Add a second address', r.status === 201 && r.body.length === 2);
        r = await api('DELETE', `/account/addresses/${r.body.find((a) => a.Line1 === '2 Other Street').AddressId}`);
        check('Delete an address', r.status === 200 && r.body.length === 1);

        /* ---------- cart & wishlist ---------- */
        r = await api('PUT', '/cart', { lines: [{ ProductId: textbook, Qty: 1 }] });
        check('Save bag', r.status === 200 && r.body.length === 1);
        r = await api('POST', '/cart/merge', { lines: [{ ProductId: textbook, Qty: 1 }, { ProductId: guide, Qty: 1 }] });
        check('Merge guest bag after sign-in', r.status === 200 && r.body.length === 2 && r.body.find((l) => l.ProductId.toLowerCase() === textbook.toLowerCase())?.Qty === 2);
        r = await api('PUT', `/wishlist/${pen}`);
        check('Save to wishlist', r.status === 200 && r.body.length === 1);
        r = await api('DELETE', `/wishlist/${pen}`);
        check('Remove from wishlist', r.status === 200 && r.body.length === 0);

        /* ---------- orders ---------- */
        r = await api('POST', '/orders', { cart: [{ ProductId: textbook, Qty: 1 }], fulfilment: 'PICKUP', paymentMethod: 'COD' });
        check('Signed-in pickup order (cash at counter)', r.status === 201 && r.body.order.FulfilmentType === 'PICKUP' && Number(r.body.order.ShippingCharge) === 0 && !r.body.token);
        const order2 = r.body.order?.OrderNo;
        r = await api('GET', '/cart');
        check('Bag is emptied after ordering', r.status === 200 && r.body.length === 0);
        r = await api('GET', '/orders');
        check('My orders list with thumbnails', r.status === 200 && r.body.length === 2 && r.body[0].Items.length >= 1);
        r = await api('GET', `/orders/${order1}`);
        check('Order detail with history', r.status === 200 && r.body.History[0].Status === 'PLACED' && r.body.ShipCity === 'Chennai' && r.body.CustomerNote === 'Please call first');
        r = await api('GET', `/orders/${order1}/invoice`);
        check('Invoice not available before shipping', r.status === 404);
        r = await api('POST', '/track', { orderNo: order1, mobile: '7000000000' }, null);
        check('Tracking with the wrong mobile finds nothing', r.status === 404);
        r = await api('POST', '/track', { orderNo: order1.toLowerCase(), mobile }, null);
        check('Public tracking by order number + mobile', r.status === 200 && r.body.Status === 'PLACED' && r.body.History.length === 1 && !('ShipLine1' in r.body));
        r = await api('POST', `/orders/${order1}/cancel`, { reason: 'Ordered by mistake' });
        [{ StockQty }] = await customQuery('SELECT StockQty FROM dbo.Products WHERE ProductId = @P', { P: guide });
        check('Cancel returns stock (3 → 5)', r.status === 200 && r.body.Status === 'CANCELLED' && StockQty === 5, `stock ${StockQty}`);
        r = await api('POST', `/orders/${order1}/cancel`, {});
        check('Cancelled order cannot be cancelled again', r.status === 409);

        /* ---------- requests ---------- */
        r = await api('POST', '/requests', { requestType: 'BULK', contactName: 'ZZ TEST', mobile, items: [{ Title: 'Reader', Qty: 10 }] });
        check('Bulk enquiry without a school name is refused', r.status === 400);
        r = await api('POST', '/requests', { requestType: 'BULK', institutionName: 'ZZ TEST School', contactName: 'ZZ TEST', mobile, items: [], attachments: [{ fileName: 'list.exe', dataUrl: 'data:application/octet-stream;base64,TVqQAAMAAAAEAAAA' }] });
        check('Non-image, non-PDF attachment is refused', r.status === 400, r.body.message);
        r = await api('POST', '/requests', { requestType: 'BULK', institutionName: 'ZZ TEST School', institutionGstin: '37ARLPG6434G1ZO', contactName: 'ZZ TEST', mobile, fulfilment: 'PICKUP', items: [{ Title: 'Reader Class 8', ClassLevel: 'Class 8', Qty: 40 }, { Title: 'Maths Class 8', Qty: 40 }], attachments: [{ fileName: 'class8-list.pdf', dataUrl: PDF_URL }], note: 'Sections A and B' });
        check('Bulk enquiry with a PDF book list', r.status === 201 && /^REQ-\d{6}$/.test(r.body.RequestNo) && r.body.Items.length === 2 && r.body.Attachments.length === 1, r.body.RequestNo || r.body.message);
        const reqNo = r.body.RequestNo;
        const [att] = await customQuery('SELECT a.StorageKey FROM dbo.RequestAttachments a JOIN dbo.ProductRequests r ON r.RequestId = a.RequestId WHERE r.RequestNo = @N', { N: reqNo });
        if (att) ids.attachmentKeys.push(att.StorageKey);
        const notPublic = att ? await fetch(`${base}/files/${att.StorageKey}`) : { status: 0 };
        check('Book-list attachment is not publicly downloadable', notPublic.status === 404);
        r = await api('POST', `/requests/${reqNo}/accept`);
        check('Cannot accept before a quote exists', r.status === 409);
        await customQuery(`UPDATE dbo.ProductRequests SET Status = 'QUOTED', QuoteItemsTotal = 8000, QuoteShipping = 0, QuoteTotal = 8000, QuoteValidUntil = DATEADD(DAY, 5, CAST(SYSUTCDATETIME() AS DATE)), QuotedOn = SYSUTCDATETIME() WHERE RequestNo = @N`, { N: reqNo });
        r = await api('POST', `/requests/${reqNo}/accept`);
        check('Accept the quote', r.status === 200 && r.body.AcceptedOn && r.body.History.at(-1).Note.includes('accepted'));
        r = await api('GET', '/requests');
        check('My requests list', r.status === 200 && r.body.length === 1 && r.body[0].ItemCount === 2);
        r = await api('POST', `/requests/${reqNo}/cancel`);
        check('Cancel the request before paying', r.status === 200 && r.body.Status === 'CANCELLED');

        /* ---------- password & blocked account ---------- */
        r = await api('PUT', '/auth/password', { current: password, next: `${password}-new` });
        check('Change password', r.status === 200);
        r = await api('POST', '/auth/login', { mobile, password: `${password}-new` }, null);
        check('Sign in with the new password', r.status === 200);
        await customQuery('UPDATE dbo.Customers SET IsActive = 0 WHERE CustomerId = @C', { C: ids.customerId });
        r = await api('GET', '/auth/me');
        check('Blocked account is signed out', r.status === 401);
        r = await api('POST', '/auth/login', { mobile, password: `${password}-new` }, null);
        check('Blocked account cannot sign in', r.status === 403);
        void order2;
    } catch (error) {
        check('Unexpected error', false, error.stack);
    } finally {
        try {
            const C = ids.customerId || '00000000-0000-0000-0000-000000000000';
            await customQuery(
                `DELETE FROM dbo.OrderStatusHistory WHERE OrderId IN (SELECT OrderId FROM dbo.Orders WHERE CustomerId = @C);
                 DELETE FROM dbo.OrderItems WHERE OrderId IN (SELECT OrderId FROM dbo.Orders WHERE CustomerId = @C);
                 DELETE FROM dbo.Orders WHERE CustomerId = @C;
                 DELETE FROM dbo.RequestStatusHistory WHERE RequestId IN (SELECT RequestId FROM dbo.ProductRequests WHERE CustomerId = @C);
                 DELETE FROM dbo.RequestAttachments WHERE RequestId IN (SELECT RequestId FROM dbo.ProductRequests WHERE CustomerId = @C);
                 DELETE FROM dbo.ProductRequestItems WHERE RequestId IN (SELECT RequestId FROM dbo.ProductRequests WHERE CustomerId = @C);
                 DELETE FROM dbo.ProductRequests WHERE CustomerId = @C;
                 DELETE FROM dbo.CartItems WHERE CustomerId = @C;
                 DELETE FROM dbo.WishlistItems WHERE CustomerId = @C;
                 DELETE FROM dbo.CustomerAddresses WHERE CustomerId = @C;
                 DELETE FROM dbo.AuditLog WHERE ActorId = @C;
                 DELETE FROM dbo.Customers WHERE CustomerId = @C;`,
                { C }
            );
            for (const p of ids.products) {
                await customQuery('DELETE FROM dbo.StockLedger WHERE ProductId = @P; DELETE FROM dbo.ProductImages WHERE ProductId = @P; DELETE FROM dbo.CartItems WHERE ProductId = @P; DELETE FROM dbo.Products WHERE ProductId = @P;', { P: p });
            }
            if (ids.categoryId) await customQuery('DELETE FROM dbo.Categories WHERE CategoryId = @Id', { Id: ids.categoryId });
            for (const k of [ids.imageKey, ...ids.attachmentKeys].filter(Boolean)) await fileStore.remove(k).catch(() => null);
            const [left] = await customQuery(`SELECT (SELECT COUNT(*) FROM dbo.Products WHERE Title LIKE 'ZZ TEST%') + (SELECT COUNT(*) FROM dbo.Customers WHERE Name LIKE 'ZZ TEST%') + (SELECT COUNT(*) FROM dbo.Categories WHERE Name LIKE 'ZZ TEST%') + (SELECT COUNT(*) FROM dbo.Orders) + (SELECT COUNT(*) FROM dbo.ProductRequests) AS N`);
            check('Cleanup: no test rows left', left.N === 0, `leftovers ${left.N}`);
            console.log(`SEQUENCES_BEFORE ${JSON.stringify(seqBefore[0])}`);
        } catch (error) {
            check('Cleanup', false, error.message);
        }
        server.close();
        await (await db.poolPromise).close();
        const failed = results.filter((x) => !x.ok).length;
        console.log(`\n${results.length - failed}/${results.length} passed`);
        process.exitCode = failed ? 1 : 0;
    }
})();
