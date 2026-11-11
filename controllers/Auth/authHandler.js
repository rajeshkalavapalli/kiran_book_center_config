// HTTP side of customer sign-up and sign-in.
// Each handler: read what the website sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the customer; anything else is logged and becomes a 500.
const authService = require('./authService');

exports.registerCustomer = async (req, res) => {
    try {
        const customerData = req.body || {};
        const result = await authService.registerCustomer(customerData);
        return res.status(201).json(result);
    } catch (err) {
        if (!err.status) console.log('error while creating the customer account', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to create your account.' });
    }
};

exports.loginCustomer = async (req, res) => {
    try {
        const { mobile, password } = req.body || {};
        const result = await authService.loginCustomer(mobile, password);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while signing in', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to sign in.' });
    }
};

exports.getMe = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await authService.getMe(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the signed-in customer', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your account.' });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { current, next } = req.body || {};
        const result = await authService.changePassword(customerId, current, next);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while changing the password', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to change your password.' });
    }
};
