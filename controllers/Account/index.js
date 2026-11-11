// Routes for the signed-in customer's profile, addresses, bag and wishlist.
// Routes only: the work is in accountHandler.js.
const express = require('express');

const { requireCustomer } = require('../../utils/auth');
const accountHandler = require('./accountHandler');

const router = express.Router();
router.use('/account', requireCustomer);
router.use('/cart', requireCustomer);
router.use('/wishlist', requireCustomer);

router.get('/account/profile', accountHandler.getProfile);
router.put('/account/profile', accountHandler.updateProfile);
router.get('/account/addresses', accountHandler.getAddresses);
router.post('/account/addresses', accountHandler.addAddress);
router.delete('/account/addresses/:addressId', accountHandler.deleteAddress);

router.get('/cart', accountHandler.getCart);
router.put('/cart', accountHandler.replaceCart);
router.post('/cart/merge', accountHandler.mergeCart);

router.get('/wishlist', accountHandler.getWishlist);
router.put('/wishlist/:productId', accountHandler.addToWishlist);
router.delete('/wishlist/:productId', accountHandler.removeFromWishlist);

module.exports = router;
