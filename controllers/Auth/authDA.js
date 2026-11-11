// Data access for customer accounts: runs the queries in sql.js and returns plain rows.
// Functions that take `tx` run inside the caller's transaction (checkout creates accounts that way).
const { customQuery } = require('../../utils/dbFunctions');
const sql = require('./sql');

const run = (tx) => (tx ? tx.run : customQuery);

// Returns 1 if the mobile is taken, 2 if the email is taken, otherwise null.
exports.findTakenMobileOrEmail = async (mobile, email, tx) => {
    const [row] = await run(tx)(sql.FIND_TAKEN_MOBILE_OR_EMAIL(), { Mobile: mobile, Email: email });
    return row?.Why || null;
};

exports.insertCustomer = async ({ name, mobile, email, passwordHash }, tx) => {
    const [row] = await run(tx)(sql.INSERT_CUSTOMER(), { Name: name, Mobile: mobile, Email: email, Hash: passwordHash });
    return row;
};

exports.getCustomerForLogin = async (mobile) => {
    const [row] = await customQuery(sql.GET_CUSTOMER_FOR_LOGIN(), { Mobile: mobile });
    return row || null;
};

exports.updateLastLogin = async (customerId) => {
    return await customQuery(sql.UPDATE_LAST_LOGIN(), { Id: customerId });
};

exports.getActiveCustomerById = async (customerId) => {
    const [row] = await customQuery(sql.GET_ACTIVE_CUSTOMER_BY_ID(), { Id: customerId });
    return row || null;
};

exports.getPasswordHash = async (customerId) => {
    const [row] = await customQuery(sql.GET_PASSWORD_HASH(), { Id: customerId });
    return row?.PasswordHash || null;
};

exports.updatePassword = async (customerId, passwordHash) => {
    return await customQuery(sql.UPDATE_PASSWORD(), { Id: customerId, Hash: passwordHash });
};
