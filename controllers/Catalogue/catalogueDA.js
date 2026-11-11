// Data access for the public catalogue: runs the queries in sql.js and returns plain rows.
const { customQuery, multiQuery } = require('../../utils/dbFunctions');
const sql = require('./sql');

exports.getCategories = async () => {
    return await customQuery(sql.GET_CATEGORIES());
};

// `orderBy` must be one of the fixed sort expressions from catalogueService (never user text).
exports.getProducts = async (orderBy, filters) => {
    return await customQuery(sql.GET_PRODUCTS(orderBy), filters);
};

exports.getFacets = async () => {
    const [values, [range]] = await multiQuery(sql.GET_FACETS());
    return { values, range };
};

exports.getProductBySlug = async (slug) => {
    const [row] = await customQuery(sql.GET_PRODUCT_BY_SLUG(), { Slug: slug });
    return row || null;
};

exports.getProductImages = async (productId) => {
    return await customQuery(sql.GET_PRODUCT_IMAGES(), { Id: productId });
};

exports.getRelatedProducts = async ({ productId, categoryId, parentId }) => {
    return await customQuery(sql.GET_RELATED_PRODUCTS(), { Id: productId, CategoryId: categoryId, ParentId: parentId });
};

exports.getHomePage = async () => {
    const [featured, examDesk, newArrivals] = await multiQuery(sql.GET_HOME_PAGE());
    return { featured, examDesk, newArrivals };
};

exports.getShippingZones = async () => {
    return await customQuery(sql.GET_SHIPPING_ZONES());
};
