// Routes for customer sign-up and sign-in. Routes only: the work is in authHandler.js.
const express = require('express');

const { requireCustomer } = require('../../utils/auth');
const authHandler = require('./authHandler');

const router = express.Router();

router.post('/auth/register', authHandler.registerCustomer);
router.post('/auth/login', authHandler.loginCustomer);
router.get('/auth/me', requireCustomer, authHandler.getMe);
router.put('/auth/password', requireCustomer, authHandler.changePassword);

module.exports = router;
