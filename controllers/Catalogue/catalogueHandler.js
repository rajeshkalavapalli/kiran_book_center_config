// HTTP side of browsing the shop (all public).
// Each handler: read what the website sent → call ONE service function → send the result.
// Errors: a service error with `status` (from fail()) is a message for the customer; anything else is logged and becomes a 500.
const catalogueService = require('./catalogueService');

exports.getShopSettings = async (req, res) => {
    try {
        const result = await catalogueService.getShopSettings();
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the shop settings', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load shop details.' });
    }
};

exports.getCategories = async (req, res) => {
    try {
        const result = await catalogueService.getCategories();
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the categories', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load categories.' });
    }
};

exports.getProducts = async (req, res) => {
    try {
        const filters = req.query;
        const result = await catalogueService.getProducts(filters);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the products', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load products.' });
    }
};

exports.getFacets = async (req, res) => {
    try {
        const result = await catalogueService.getFacets();
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the filters', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load filters.' });
    }
};

exports.getProductBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await catalogueService.getProductBySlug(slug);
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the product', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the item.' });
    }
};

exports.getHomePage = async (req, res) => {
    try {
        const result = await catalogueService.getHomePage();
        return res.status(200).json(result);
    } catch (err) {
        if (!err.status) console.log('error while loading the home page', err);
        return res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the home page.' });
    }
};
