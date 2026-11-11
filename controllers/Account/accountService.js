// Business rules for the customer's profile, saved addresses, bag and wishlist.
// No SQL and no req/res here: the database goes through accountDA.js, the HTTP side is accountHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
// cleanAddress and saveAddress are also used by checkout (Orders).
const { fail, needGuid, text } = require('../../utils/access');
const { isEmail, isMobile, isPincode, STATES } = require('../../utils/shop');
const { publicCustomer } = require('../Auth/authService');
const accountDA = require('./accountDA');

const MAX_ADDRESSES = 10;
const MAX_CART_LINES = 100;

/* ---------------- helpers ---------------- */

// Keeps valid lines only: a product id and a whole quantity of at least 1.
const cleanCartLines = (lines) =>
    (Array.isArray(lines) ? lines : [])
        .slice(0, MAX_CART_LINES)
        .map((l) => ({ ProductId: String(l.ProductId || '').toLowerCase(), Qty: Math.trunc(Number(l.Qty)) }))
        .filter((l) => /^[0-9a-f-]{36}$/.test(l.ProductId) && l.Qty >= 1);

// mode "replace" swaps the whole bag; mode "merge" adds the lines to it.
const writeCart = async (customerId, lines, mode) => {
    const clean = cleanCartLines(lines);
    await accountDA.withTransaction(async (tx) => {
        if (mode === 'replace') await accountDA.clearCart(customerId, tx);
        for (const line of clean) await accountDA.upsertCartLine(customerId, line, mode, tx);
    });
    return accountDA.getCart(customerId);
};

// Returns a clean address or throws a message the customer can act on. Also used by checkout.
exports.cleanAddress = (a = {}) => {
    const out = {
        Name: text(a.Name, 120),
        Mobile: String(a.Mobile || '').trim(),
        Line1: text(a.Line1, 200),
        Line2: text(a.Line2, 200),
        Landmark: text(a.Landmark, 120),
        City: text(a.City, 80),
        State: STATES.includes(a.State) ? a.State : null,
        Pincode: String(a.Pincode || '').trim(),
    };
    if (!out.Name) throw fail(400, 'Enter the name for delivery.');
    if (!isMobile(out.Mobile)) throw fail(400, 'Enter a valid 10-digit mobile number for delivery.');
    if (!out.Line1 || !out.City) throw fail(400, 'Please complete the delivery address.');
    if (!out.State) throw fail(400, 'Choose the state.');
    if (!isPincode(out.Pincode)) throw fail(400, 'Enter a valid 6-digit pincode.');
    return out;
};

// Saves an address (skips exact duplicates); the first address becomes the default.
// Runs inside the caller's transaction when `tx` is given (checkout). Returns the AddressId.
exports.saveAddress = async (customerId, addressData, tx, makeDefault = false) => {
    try {
        const a = exports.cleanAddress(addressData);
        const existing = await accountDA.findSameAddress(customerId, a, tx);
        if (existing) return existing;
        const count = await accountDA.countAddresses(customerId, tx);
        if (count >= MAX_ADDRESSES) throw fail(400, `You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`);
        const isDefault = makeDefault || count === 0;
        if (isDefault) await accountDA.clearDefaultAddress(customerId, tx);
        const result = await accountDA.insertAddress(customerId, a, isDefault, tx);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.saveAddress', err);
        throw err;
    }
};

/* ---------------- profile ---------------- */

exports.getProfile = async (customerId) => {
    try {
        const c = await accountDA.getProfile(customerId);
        if (!c) throw fail(401, 'Please sign in again.');
        const result = { customer: publicCustomer(c) };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.getProfile', err);
        throw err;
    }
};

exports.updateProfile = async (customerId, name, email) => {
    try {
        if (!text(name, 120)) throw fail(400, 'Enter your name.');
        if (!isEmail(email)) throw fail(400, "That email address doesn't look right.");
        const e = text(email, 160);
        if (e && (await accountDA.checkEmailTaken(e, customerId))) throw fail(409, 'This email is already used by another account.');
        const c = await accountDA.updateProfile(customerId, { name: text(name, 120), email: e });
        if (!c) throw fail(401, 'Please sign in again.');
        const result = { customer: publicCustomer(c) };
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.updateProfile', err);
        throw err;
    }
};

/* ---------------- addresses ---------------- */

exports.getAddresses = async (customerId) => {
    try {
        const result = await accountDA.getAddresses(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.getAddresses', err);
        throw err;
    }
};

// Saves an address from the account page and returns the updated list.
exports.addAddress = async (customerId, addressData) => {
    try {
        await exports.saveAddress(customerId, addressData, null, Boolean(addressData?.IsDefault));
        const result = await accountDA.getAddresses(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.addAddress', err);
        throw err;
    }
};

// Removes an address; if it was the default, the newest remaining one becomes the default.
exports.deleteAddress = async (customerId, addressId) => {
    try {
        const id = needGuid(addressId, 'address');
        await accountDA.withTransaction(async (tx) => {
            const deleted = await accountDA.deleteAddress(customerId, id, tx);
            if (!deleted) throw fail(404, 'That address was not found.');
            if (deleted.IsDefault) await accountDA.makeNewestAddressDefault(customerId, tx);
        });
        const result = await accountDA.getAddresses(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.deleteAddress', err);
        throw err;
    }
};

/* ---------------- bag (kept on the account, so it follows the customer) ---------------- */

exports.getCart = async (customerId) => {
    try {
        const result = await accountDA.getCart(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.getCart', err);
        throw err;
    }
};

// Swaps the whole bag for the given lines.
exports.replaceCart = async (customerId, lines) => {
    try {
        const result = await writeCart(customerId, lines, 'replace');
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.replaceCart', err);
        throw err;
    }
};

// Adds the given lines to the bag (used right after sign-in, to keep what was added as a guest).
exports.mergeCart = async (customerId, lines) => {
    try {
        const result = await writeCart(customerId, lines, 'merge');
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.mergeCart', err);
        throw err;
    }
};

/* ---------------- wishlist ---------------- */

exports.getWishlist = async (customerId) => {
    try {
        const result = await accountDA.getWishlist(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.getWishlist', err);
        throw err;
    }
};

exports.addToWishlist = async (customerId, productId) => {
    try {
        await accountDA.addToWishlist(customerId, needGuid(productId, 'product'));
        const result = await accountDA.getWishlist(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.addToWishlist', err);
        throw err;
    }
};

exports.removeFromWishlist = async (customerId, productId) => {
    try {
        await accountDA.removeFromWishlist(customerId, needGuid(productId, 'product'));
        const result = await accountDA.getWishlist(customerId);
        return result;
    } catch (err) {
        if (!err.status) console.log('error in accountService.removeFromWishlist', err);
        throw err;
    }
};
