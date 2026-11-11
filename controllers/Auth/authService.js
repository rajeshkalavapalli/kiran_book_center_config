// Business rules for customer accounts: validation, password hashing, sign-in lockout, tokens.
// No SQL and no req/res here: the database goes through authDA.js, the HTTP side is authHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const argon2 = require('argon2');

const { fail, text } = require('../../utils/access');
const { issueToken, checkLock, recordFailure, clearFailures } = require('../../utils/auth');
const { audit, isEmail, isMobile, passwordProblem } = require('../../utils/shop');
const authDA = require('./authDA');

// Same message for an unknown number and a wrong password, so accounts can't be probed.
const WRONG = 'Incorrect mobile number or password.';

/* ---------------- helpers (also used by checkout in Orders) ---------------- */

// What the website is allowed to see about a customer.
exports.publicCustomer = (c) => ({ CustomerId: c.CustomerId, Name: c.Name, Mobile: c.Mobile, Email: c.Email || null, CreatedOn: c.CreatedOn, MustChangePassword: Boolean(c.MustChangePassword) });

const passwordMatches = (hash, password) => (hash ? argon2.verify(hash, String(password || '')).catch(() => false) : false);

// Checks a new customer's details; returns a message or null.
exports.validateNew = ({ name, mobile, email, password }) => {
    if (!text(name, 120)) return 'Enter your name.';
    if (!isMobile(mobile)) return 'Enter a valid 10-digit mobile number.';
    if (!isEmail(email)) return "That email address doesn't look right.";
    return passwordProblem(password);
};

// Creates the customer (inside the caller's transaction when `tx` is given). Throws 409 if the mobile or email is taken.
exports.createCustomer = async ({ name, mobile, email, password }, tx) => {
    try {
        const m = String(mobile).trim();
        const e = text(email, 160);
        const taken = await authDA.findTakenMobileOrEmail(m, e, tx);
        if (taken === 1) throw fail(409, 'This mobile number already has an account. Please sign in.');
        if (taken === 2) throw fail(409, 'This email is already used by another account.');
        const result = await authDA.insertCustomer({ name: text(name, 120), mobile: m, email: e, passwordHash: await argon2.hash(String(password)) }, tx);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in authService.createCustomer', err);
        throw err;
    }
};

/* ---------------- service functions (called by authHandler.js) ---------------- */

// Sign-up: creates the account and returns the customer with a session token.
exports.registerCustomer = async (customerData) => {
    try {
        const problem = exports.validateNew(customerData);
        if (problem) throw fail(400, problem);
        const c = await exports.createCustomer(customerData);
        await audit({ actorId: c.CustomerId, action: 'REGISTERED', entityType: 'Customer', entityId: c.CustomerId });
        const result = { customer: exports.publicCustomer(c), ...issueToken(c.CustomerId) };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in authService.registerCustomer', err);
        throw err;
    }
};

// Sign-in with mobile + password. Locks for 15 minutes after 5 wrong tries.
exports.loginCustomer = async (mobile, password) => {
    try {
        const m = String(mobile || '').trim();
        if (!isMobile(m) || !password) throw fail(400, 'Enter your 10-digit mobile number and password.');
        const locked = checkLock(m);
        if (locked) throw fail(429, locked);
        const c = await authDA.getCustomerForLogin(m);
        if (!c || !(await passwordMatches(c.PasswordHash, password))) {
            recordFailure(m);
            throw fail(401, WRONG);
        }
        if (!c.IsActive) throw fail(403, 'This account is paused. Please contact the shop.');
        clearFailures(m);
        await authDA.updateLastLogin(c.CustomerId);
        const result = { customer: exports.publicCustomer(c), ...issueToken(c.CustomerId) };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in authService.loginCustomer', err);
        throw err;
    }
};

// The signed-in customer (fails if the account was paused meanwhile).
exports.getMe = async (customerId) => {
    try {
        const c = await authDA.getActiveCustomerById(customerId);
        if (!c) throw fail(401, 'Please sign in again.');
        const result = { customer: exports.publicCustomer(c) };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in authService.getMe', err);
        throw err;
    }
};

exports.changePassword = async (customerId, current, next) => {
    try {
        if (!(await passwordMatches(await authDA.getPasswordHash(customerId), current))) throw fail(400, 'Your current password is not correct.');
        const problem = passwordProblem(next);
        if (problem) throw fail(400, problem);
        if (String(next) === String(current)) throw fail(400, 'Choose a password different from the current one.');
        await authDA.updatePassword(customerId, await argon2.hash(String(next)));
        await audit({ actorId: customerId, action: 'PASSWORD_CHANGED', entityType: 'Customer', entityId: customerId });
        return { ok: true };
    } catch (err) {
        if (!err.status) console.log('error in authService.changePassword', err);
        throw err;
    }
};
