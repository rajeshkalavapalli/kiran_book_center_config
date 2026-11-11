// HTTP side of checkout, orders and tracking.
// Each handler: read what the website sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the customer; anything else is logged and becomes a 500.
const orderService = require('./orderService');

exports.getCheckoutQuote = async (req, res) => {
    try {
        const { cart, fulfilment, address } = req.body || {};
        const result = await orderService.getCheckoutQuote(cart, fulfilment, address);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while working out the checkout total', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to work out the total.' });
    }
};

exports.placeOrder = async (req, res) => {
    try {
        // Set when signed in (optionalCustomer). A first-time buyer sends newCustomer in the body instead.
        const signedInCustomer = req.customer || null;
        const orderData = req.body || {};
        const result = await orderService.placeOrder(signedInCustomer, orderData);
        return res.status(201).json(result);
    } catch (err) {
        if (!err.status) console.log('error while placing the order', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to place your order.' });
    }
};

exports.trackOrder = async (req, res) => {
    try {
        const { orderNo, mobile } = req.body || {};
        const result = await orderService.trackOrder(req.ip, orderNo, mobile);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while tracking the order', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to find the order.' });
    }
};

exports.getOrders = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await orderService.getOrders(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the orders', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your orders.' });
    }
};

exports.getOrderByNo = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { orderNo } = req.params;
        const result = await orderService.getOrderByNo(customerId, orderNo);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the order', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the order.' });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { orderNo } = req.params;
        const { reason } = req.body || {};
        const result = await orderService.cancelOrder(customerId, orderNo, reason);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while cancelling the order', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to cancel the order.' });
    }
};

exports.getInvoice = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { orderNo } = req.params;
        const result = await orderService.getInvoice(customerId, orderNo);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the invoice', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the invoice.' });
    }
};
