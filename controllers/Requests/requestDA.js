// Data access for requests: runs the queries in sql.js and returns plain rows.
// No rules here. Functions that take `tx` run inside the caller's transaction.
const { customQuery, multiQuery, inTransaction } = require('../../utils/dbFunctions');
const sql = require('./sql');

const run = (tx) => (tx ? tx.run : customQuery);

exports.withTransaction = inTransaction;

exports.nextRequestNo = async (tx) => {
    const [{ N }] = await run(tx)(sql.NEXT_REQUEST_NO());
    return N;
};

exports.insertRequest = async (tx, r) => {
    const [{ RequestId }] = await run(tx)(sql.INSERT_REQUEST(), {
        No: r.requestNo,
        C: r.customerId,
        Type: r.requestType,
        Inst: r.institutionName,
        Gstin: r.institutionGstin,
        Contact: r.contactName,
        Mobile: r.mobile,
        Email: r.email,
        Note: r.note,
        Fulfilment: r.fulfilment,
        ShipName: r.shipName,
        ShipMobile: r.shipMobile,
        Line1: r.line1,
        Line2: r.line2,
        City: r.city,
        State: r.state,
        Pincode: r.pincode,
    });
    return RequestId;
};

exports.insertRequestItem = async (tx, requestId, lineNumber, i) => {
    return await run(tx)(sql.INSERT_REQUEST_ITEM(), { R: requestId, L: lineNumber, Title: i.title, Author: i.author, Publisher: i.publisher, Class: i.classLevel, Qty: i.qty });
};

exports.insertRequestAttachment = async (tx, requestId, f) => {
    return await run(tx)(sql.INSERT_REQUEST_ATTACHMENT(), { R: requestId, K: f.key, N: f.name, T: f.type, S: f.size });
};

exports.insertRequestHistory = async (tx, { requestId, status, note = null, customerId }) => {
    return await run(tx)(sql.INSERT_REQUEST_HISTORY(), { R: requestId, Status: status, Note: note, C: customerId });
};

exports.getRequestsByCustomer = async (customerId) => {
    return await customQuery(sql.GET_REQUESTS_BY_CUSTOMER(), { C: customerId });
};

exports.getRequestByNo = async (customerId, requestNo) => {
    const [[request], items, history, attachments] = await multiQuery(sql.GET_REQUEST_BY_NO(), { No: requestNo, C: customerId });
    return { request, items, history, attachments };
};

exports.lockRequestByNo = async (tx, customerId, requestNo) => {
    const [row] = await run(tx)(sql.LOCK_REQUEST_BY_NO(), { No: requestNo, C: customerId });
    return row || null;
};

exports.markRequestAccepted = async (tx, requestId) => {
    return await run(tx)(sql.MARK_REQUEST_ACCEPTED(), { R: requestId });
};

exports.markRequestCancelled = async (tx, requestId) => {
    return await run(tx)(sql.MARK_REQUEST_CANCELLED(), { R: requestId });
};
