// HTTP side of "Request a book" and bulk enquiries.
// Each handler: read what the website sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the customer; anything else is logged and becomes a 500.
const requestService = require('./requestService');

exports.submitRequest = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const requestData = req.body || {};
        const result = await requestService.submitRequest(customerId, requestData);
        return res.status(201).json(result);
    } catch (err) {
        if (!err.status) console.log('error while submitting the request', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to send your request.' });
    }
};

exports.getRequests = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const result = await requestService.getRequests(customerId);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the requests', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load your requests.' });
    }
};

exports.getRequestByNo = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { requestNo } = req.params;
        const result = await requestService.getRequestByNo(customerId, requestNo);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the request', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the request.' });
    }
};

exports.acceptQuote = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { requestNo } = req.params;
        const result = await requestService.acceptQuote(customerId, requestNo);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while accepting the quote', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to accept the quote.' });
    }
};

exports.cancelRequest = async (req, res) => {
    try {
        const customerId = req.customer.customerId;
        const { requestNo } = req.params;
        const result = await requestService.cancelRequest(customerId, requestNo);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while cancelling the request', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to cancel the request.' });
    }
};
