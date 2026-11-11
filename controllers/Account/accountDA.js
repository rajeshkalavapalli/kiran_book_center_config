// Data access for the customer's account: runs the queries in sql.js and returns plain rows.
// Functions that take `tx` run inside the caller's transaction (checkout saves addresses that way).
const { customQuery, inTransaction } = require('../../utils/dbFunctions');
const sql = require('./sql');

const run = (tx) => (tx ? tx.run : customQuery);

exports.withTransaction = inTransaction;

/* ---------------- profile ---------------- */

exports.getProfile = async (customerId) => {
    const [row] = await customQuery(sql.GET_PROFILE(), { Id: customerId });
    return row || null;
};

exports.checkEmailTaken = async (email, customerId) => {
    const rows = await customQuery(sql.CHECK_EMAIL_TAKEN(), { E: email, Id: customerId });
    return rows.length > 0;
};

exports.updateProfile = async (customerId, { name, email }) => {
    const [row] = await customQuery(sql.UPDATE_PROFILE(), { Id: customerId, Name: name, Email: email });
    return row || null;
};

/* ---------------- addresses ---------------- */

exports.getAddresses = async (customerId) => {
    return await customQuery(sql.GET_ADDRESSES(), { Id: customerId });
};

exports.findSameAddress = async (customerId, a, tx) => {
    const [row] = await run(tx)(sql.FIND_SAME_ADDRESS(), { C: customerId, Line1: a.Line1, Pincode: a.Pincode, Name: a.Name });
    return row?.AddressId || null;
};

exports.countAddresses = async (customerId, tx) => {
    const [{ N }] = await run(tx)(sql.COUNT_ADDRESSES(), { C: customerId });
    return N;
};

exports.clearDefaultAddress = async (customerId, tx) => {
    return await run(tx)(sql.CLEAR_DEFAULT_ADDRESS(), { C: customerId });
};

exports.insertAddress = async (customerId, a, isDefault, tx) => {
    const [row] = await run(tx)(sql.INSERT_ADDRESS(), { C: customerId, ...a, IsDefault: isDefault });
    return row.AddressId;
};

// Returns the deleted row ({ IsDefault }) or null if it wasn't this customer's address.
exports.deleteAddress = async (customerId, addressId, tx) => {
    const [row] = await run(tx)(sql.DELETE_ADDRESS(), { Id: addressId, C: customerId });
    return row || null;
};

exports.makeNewestAddressDefault = async (customerId, tx) => {
    return await run(tx)(sql.MAKE_NEWEST_ADDRESS_DEFAULT(), { C: customerId });
};

/* ---------------- bag ---------------- */

exports.getCart = async (customerId) => {
    return await customQuery(sql.GET_CART(), { C: customerId });
};

exports.clearCart = async (customerId, tx) => {
    return await run(tx)(sql.CLEAR_CART(), { C: customerId });
};

exports.upsertCartLine = async (customerId, line, mode, tx) => {
    return await run(tx)(sql.UPSERT_CART_LINE(), { C: customerId, P: line.ProductId, Q: line.Qty, Mode: mode });
};

/* ---------------- wishlist ---------------- */

exports.getWishlist = async (customerId) => {
    return await customQuery(sql.GET_WISHLIST(), { C: customerId });
};

exports.addToWishlist = async (customerId, productId) => {
    return await customQuery(sql.ADD_TO_WISHLIST(), { C: customerId, P: productId });
};

exports.removeFromWishlist = async (customerId, productId) => {
    return await customQuery(sql.REMOVE_FROM_WISHLIST(), { C: customerId, P: productId });
};
