// Routes for checkout, orders and tracking. Routes only: the work is in orderHandler.js.
const express = require('express');

const { optionalCustomer, requireCustomer } = require('../../utils/auth');
const orderHandler = require('./orderHandler');

const router = express.Router();

// Checkout works signed in or as a first-time buyer (who gets an account with the order).
router.post('/checkout/quote', orderHandler.getCheckoutQuote);
router.post('/orders', optionalCustomer, orderHandler.placeOrder);
router.post('/track', orderHandler.trackOrder);

router.get('/orders', requireCustomer, orderHandler.getOrders);
router.get('/orders/:orderNo', requireCustomer, orderHandler.getOrderByNo);
router.post('/orders/:orderNo/cancel', requireCustomer, orderHandler.cancelOrder);
router.get('/orders/:orderNo/invoice', requireCustomer, orderHandler.getInvoice);

module.exports = router;
