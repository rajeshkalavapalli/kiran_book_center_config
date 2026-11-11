// Routes for "Request a book" and bulk enquiries. Routes only: the work is in requestHandler.js.
const express = require('express');

const { requireCustomer } = require('../../utils/auth');
const requestHandler = require('./requestHandler');

const router = express.Router();
router.use('/requests', requireCustomer);

router.post('/requests', requestHandler.submitRequest);
router.get('/requests', requestHandler.getRequests);
router.get('/requests/:requestNo', requestHandler.getRequestByNo);
router.post('/requests/:requestNo/accept', requestHandler.acceptQuote);
router.post('/requests/:requestNo/cancel', requestHandler.cancelRequest);

module.exports = router;
