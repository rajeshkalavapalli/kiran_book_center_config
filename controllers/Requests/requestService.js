// Business rules for "Request a book" and bulk enquiries: validation, attachments, status changes.
// No SQL and no req/res here: the database goes through requestDA.js, the HTTP side is requestHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const { fail, text } = require('../../utils/access');
const fileStore = require('../../utils/fileStore');
const { audit, isEmail, isGstin, isMobile, isPincode, STATES } = require('../../utils/shop');
const requestDA = require('./requestDA');

const ATTACH = { types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], maxBytes: 5 * 1024 * 1024, maxFiles: 3 };
const MAX_LINES = 200;
const CAN_CANCEL = ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'];

/* ---------------- helpers (used only inside this file) ---------------- */

const cleanNo = (requestNo) => String(requestNo || '').trim().toUpperCase();
const todayInIndia = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

// Checks the form and returns clean values, or throws a message the customer can act on.
const validateRequest = (b) => {
    const requestType = b.requestType === 'BULK' ? 'BULK' : 'SINGLE';
    const items = (Array.isArray(b.items) ? b.items : []).filter((i) => text(i?.Title, 250)).slice(0, MAX_LINES);
    const files = Array.isArray(b.attachments) ? b.attachments.slice(0, ATTACH.maxFiles) : [];
    if (requestType === 'BULK' && !text(b.institutionName, 200)) throw fail(400, 'Enter the school or college name.');
    if (!text(b.contactName, 120)) throw fail(400, 'Enter a contact name.');
    if (!isMobile(b.mobile)) throw fail(400, 'Enter a valid 10-digit mobile number.');
    if (!isEmail(b.email)) throw fail(400, "That email address doesn't look right.");
    if (!isGstin(b.institutionGstin)) throw fail(400, "That GSTIN doesn't look right (15 characters, e.g. 37ABCDE1234F1Z5).");
    if (!items.length && !files.length) throw fail(400, requestType === 'BULK' ? 'Add at least one book, or upload a photo of the list.' : 'Tell us which book you need.');
    if (items.some((i) => !(Number(i.Qty) >= 1 && Number(i.Qty) <= 100000))) throw fail(400, 'Each line needs a quantity of at least 1.');
    const fulfilment = b.fulfilment === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    const a = b.address || {};
    if (fulfilment === 'DELIVERY' && (!text(a.Line1, 200) || !text(a.City, 80) || !STATES.includes(a.State) || !isPincode(a.Pincode))) throw fail(400, 'Please complete the delivery address, or choose pickup.');

    const delivery = fulfilment === 'DELIVERY';
    return {
        files,
        request: {
            requestType,
            institutionName: requestType === 'BULK' ? text(b.institutionName, 200) : null,
            institutionGstin: b.institutionGstin ? String(b.institutionGstin).trim().toUpperCase() : null,
            contactName: text(b.contactName, 120),
            mobile: String(b.mobile).trim(),
            email: text(b.email, 160),
            note: text(b.note, 1000),
            fulfilment,
            shipName: delivery ? text(b.contactName, 120) : null,
            shipMobile: delivery ? String(b.mobile).trim() : null,
            line1: delivery ? text(a.Line1, 200) : null,
            line2: delivery ? text(a.Line2, 200) : null,
            city: delivery ? text(a.City, 80) : null,
            state: delivery ? a.State : null,
            pincode: delivery ? String(a.Pincode).trim() : null,
        },
        items: items.map((i) => ({ title: text(i.Title, 250), author: text(i.Author, 200), publisher: text(i.Publisher, 150), classLevel: text(i.ClassLevel, 40), qty: Math.trunc(Number(i.Qty)) })),
    };
};

// Checks each uploaded file by its real content and stores it; adds what was stored to `stored`.
const storeAttachments = async (customerId, files, stored) => {
    for (const f of files) {
        const file = fileStore.fromDataUrl(f?.dataUrl, { allow: ATTACH.types, maxBytes: ATTACH.maxBytes });
        if (!file) throw fail(400, `"${text(f?.fileName, 80) || 'A file'}" can't be used. Please upload JPG, PNG or PDF, up to 5 MB each.`);
        const key = fileStore.newKey(`requests/${customerId}`, file.type.ext);
        await fileStore.put(key, file.buffer);
        stored.push({ key, name: text(f.fileName, 200) || `book-list.${file.type.ext}`, type: file.type.contentType, size: file.buffer.length });
    }
};

/* ---------------- service functions (called by requestHandler.js) ---------------- */

/**
 * Saves a new request.
 * requestData: { requestType: SINGLE|BULK, institutionName, institutionGstin, contactName, mobile, email,
 *                items[{Title, Author, Publisher, ClassLevel, Qty}], note, fulfilment, address{Line1,Line2,City,State,Pincode},
 *                attachments[{ fileName, dataUrl }] }
 */
exports.submitRequest = async (customerId, requestData) => {
    const stored = [];
    try {
        const { request, items, files } = validateRequest(requestData);

        // Files are stored first; if saving the request fails they are removed again (catch below).
        await storeAttachments(customerId, files, stored);

        const requestNo = await requestDA.withTransaction(async (tx) => {
            const no = `REQ-${String(await requestDA.nextRequestNo(tx)).padStart(6, '0')}`;
            const requestId = await requestDA.insertRequest(tx, { ...request, requestNo: no, customerId });
            for (let n = 0; n < items.length; n += 1) await requestDA.insertRequestItem(tx, requestId, n + 1, items[n]);
            for (const f of stored) await requestDA.insertRequestAttachment(tx, requestId, f);
            await requestDA.insertRequestHistory(tx, { requestId, status: 'SUBMITTED', customerId });
            return no;
        });

        await audit({ actorId: customerId, action: 'REQUEST_SUBMITTED', entityType: 'Request', entityId: requestNo });
        const result = await exports.getRequestByNo(customerId, requestNo);
        return result;
    } catch (err) {
        await Promise.all(stored.map((f) => fileStore.remove(f.key).catch(() => null)));
        if (!err.status) console.log('error in requestService.submitRequest', err);
        throw err;
    }
};

// All requests of the signed-in customer, newest first.
exports.getRequests = async (customerId) => {
    try {
        const result = await requestDA.getRequestsByCustomer(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in requestService.getRequests', err);
        throw err;
    }
};

// One request with its lines, history and attachment names.
exports.getRequestByNo = async (customerId, requestNo) => {
    try {
        const { request, items, history, attachments } = await requestDA.getRequestByNo(customerId, cleanNo(requestNo));
        if (!request) throw fail(404, "We couldn't find that request on your account.");
        const result = { ...request, Items: items, History: history, Attachments: attachments };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in requestService.getRequestByNo', err);
        throw err;
    }
};

// The customer accepts the shop's quote (only while it is open and not expired).
exports.acceptQuote = async (customerId, requestNo) => {
    try {
        const no = cleanNo(requestNo);
        await requestDA.withTransaction(async (tx) => {
            const r = await requestDA.lockRequestByNo(tx, customerId, no);
            if (!r) throw fail(404, 'Request not found.');
            if (r.Status !== 'QUOTED') throw fail(409, 'There is no open quote on this request.');
            if (r.AcceptedOn) return;
            if (r.QuoteValidUntil && new Date(r.QuoteValidUntil).toISOString().slice(0, 10) < todayInIndia()) throw fail(409, 'This quote has expired. Please ask the shop for a fresh one.');
            await requestDA.markRequestAccepted(tx, r.RequestId);
            await requestDA.insertRequestHistory(tx, { requestId: r.RequestId, status: 'QUOTED', note: `You accepted the quote of ₹${Number(r.QuoteTotal).toLocaleString('en-IN')}. Waiting for payment.`, customerId });
        });
        await audit({ actorId: customerId, action: 'QUOTE_ACCEPTED', entityType: 'Request', entityId: no });
        const result = await exports.getRequestByNo(customerId, no);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in requestService.acceptQuote', err);
        throw err;
    }
};

// The customer cancels a request that hasn't been paid for yet.
exports.cancelRequest = async (customerId, requestNo) => {
    try {
        const no = cleanNo(requestNo);
        await requestDA.withTransaction(async (tx) => {
            const r = await requestDA.lockRequestByNo(tx, customerId, no);
            if (!r) throw fail(404, 'Request not found.');
            if (!CAN_CANCEL.includes(r.Status)) throw fail(409, "This request can't be cancelled now. Please contact the shop.");
            await requestDA.markRequestCancelled(tx, r.RequestId);
            await requestDA.insertRequestHistory(tx, { requestId: r.RequestId, status: 'CANCELLED', note: 'Cancelled by you.', customerId });
        });
        const result = await exports.getRequestByNo(customerId, no);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in requestService.cancelRequest', err);
        throw err;
    }
};
