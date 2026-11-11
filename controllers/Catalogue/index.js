// Routes for browsing the shop. All public: no sign-in needed. Routes only: the work is in catalogueHandler.js.
const express = require('express');

const catalogueHandler = require('./catalogueHandler');

const router = express.Router();

router.get('/settings/public', catalogueHandler.getShopSettings);
router.get('/categories', catalogueHandler.getCategories);
router.get('/products', catalogueHandler.getProducts);
router.get('/facets', catalogueHandler.getFacets);
router.get('/products/:slug', catalogueHandler.getProductBySlug);
router.get('/home', catalogueHandler.getHomePage);

module.exports = router;
