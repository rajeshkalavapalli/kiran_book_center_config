// HTTP side of the signed-in customer's profile, addresses, bag and wishlist.
// Each handler: read what the website sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the customer; anything else is logged and becomes a 500.
const accountService = require('./accountService');

/* ---------------- profile ---------------- */

exports.getProfile = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await accountService.getProfile(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the profile', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your profile.' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { name, email } = req.body || {};
        const result = await accountService.updateProfile(customerId, name, email);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while saving the profile', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to save your details.' });
    }
};

/* ---------------- addresses ---------------- */

exports.getAddresses = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await accountService.getAddresses(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the addresses', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your addresses.' });
    }
};

exports.addAddress = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const addressData = req.body || {};
        const result = await accountService.addAddress(customerId, addressData);
        return res.status(201).json(result);
    } catch (err) {
        if (!err.status) console.log('error while saving the address', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to save the address.' });
    }
};

exports.deleteAddress = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { addressId } = req.params;
        const result = await accountService.deleteAddress(customerId, addressId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while removing the address', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to remove the address.' });
    }
};

/* ---------------- bag ---------------- */

exports.getCart = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await accountService.getCart(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the bag', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your bag.' });
    }
};

exports.replaceCart = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const lines = req.body?.lines;
        const result = await accountService.replaceCart(customerId, lines);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while updating the bag', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to update your bag.' });
    }
};

exports.mergeCart = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const lines = req.body?.lines;
        const result = await accountService.mergeCart(customerId, lines);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while merging the bag', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to update your bag.' });
    }
};

/* ---------------- wishlist ---------------- */

exports.getWishlist = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await accountService.getWishlist(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the wishlist', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your wishlist.' });
    }
};

exports.addToWishlist = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { productId } = req.params;
        const result = await accountService.addToWishlist(customerId, productId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while saving to the wishlist', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to save to wishlist.' });
    }
};

exports.removeFromWishlist = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { productId } = req.params;
        const result = await accountService.removeFromWishlist(customerId, productId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while removing from the wishlist', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to remove from wishlist.' });
    }
};
