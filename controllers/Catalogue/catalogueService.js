// Business rules for the public catalogue: filters, sorting, paging, caching and the shape the website expects.
// No SQL and no req/res here: the database goes through catalogueDA.js, the HTTP side is catalogueHandler.js.
// Each exported function: try → do the work → return the result; catch → log unexpected errors → throw to the handler.
const { fail, text } = require('../../utils/access');
const { publicSettings } = require('../../utils/shop');
const catalogueDA = require('./catalogueDA');

const TYPES = ['BOOK', 'STATIONERY', 'NOTEBOOK', 'KIT'];
// Fixed ORDER BY expressions; the query string only picks a key, so no user text reaches the SQL.
const SORTS = {
    relevance: 'IsFeatured DESC, CASE WHEN StockQty > 0 THEN 0 ELSE 1 END, CreatedOn DESC',
    newest: 'CreatedOn DESC',
    priceLow: 'SellingPrice ASC, Title',
    priceHigh: 'SellingPrice DESC, Title',
    discount: '(Mrp - SellingPrice) / NULLIF(Mrp, 0) DESC, Title',
};
const CATEGORY_CACHE_MS = 60000;

/* ---------------- helpers ---------------- */

// Product rows as the website expects them: Images is a list of storage keys (main photo first).
const shape = ({ ImageKey, TotalCount, ...p }) => ({ ...p, Images: ImageKey ? [ImageKey] : [] });

const numberOrNull = (v) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// Categories change rarely: keep them for 60 seconds.
let categoryCache = { at: 0, rows: [] };
const loadCategories = async () => {
    if (Date.now() - categoryCache.at > CATEGORY_CACHE_MS) categoryCache = { at: Date.now(), rows: await catalogueDA.getCategories() };
    return categoryCache.rows;
};

/* ---------------- service functions (called by catalogueHandler.js) ---------------- */

// Public shop details (address, phones, payment switches...) and the delivery zones.
exports.getShopSettings = async () => {
    try {
        const [settings, zones] = await Promise.all([publicSettings(), catalogueDA.getShippingZones()]);
        return { settings, zones };
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getShopSettings', err);
        throw err;
    }
};

exports.getCategories = async () => {
    try {
        const result = await loadCategories();
        return result;
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getCategories', err);
        throw err;
    }
};

// Shop listing with optional filters: category, q, type, class, board, stock=1, net=1, min, max, sort, page, pageSize.
exports.getProducts = async (filters) => {
    try {
        const q = filters || {};
        const cat = q.category ? (await loadCategories()).find((c) => c.Slug === String(q.category)) || null : null;
        if (q.category && !cat) return { items: [], total: 0, page: 1, pageSize: 0 };
        const types = [].concat(q.type || []).filter((t) => TYPES.includes(t));
        const term = text(q.q, 100);
        const page = Math.max(1, Math.trunc(Number(q.page) || 1));
        const pageSize = Math.min(60, Math.max(1, Math.trunc(Number(q.pageSize) || 48)));
        const rows = await catalogueDA.getProducts(SORTS[q.sort] || SORTS.relevance, {
            CategoryId: cat?.CategoryId || null,
            Q: term ? `%${term.replace(/[%_[]/g, '[$&]')}%` : null,
            Types: types.length ? `,${types.join(',')},` : null,
            ClassLevel: text(q.class, 40),
            Board: text(q.board, 40),
            InStock: q.stock === '1' ? 1 : 0,
            NetOnly: q.net === '1' ? 1 : 0,
            MinPrice: numberOrNull(q.min),
            MaxPrice: numberOrNull(q.max),
            Offset: (page - 1) * pageSize,
            PageSize: pageSize,
        });
        return { items: rows.map(shape), total: rows[0]?.TotalCount || 0, page, pageSize };
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getProducts', err);
        throw err;
    }
};

// Values for the shop filters, taken from the visible products.
exports.getFacets = async () => {
    try {
        const { values, range } = await catalogueDA.getFacets();
        const pick = (kind) => [...new Set(values.filter((v) => v.Kind === kind).map((v) => v.Value))].sort();
        return { classLevels: pick('class'), boards: pick('board'), minPrice: Number(range.MinPrice), maxPrice: Number(range.MaxPrice) };
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getFacets', err);
        throw err;
    }
};

// One product page: the product, all its photos, its category and up to 4 related items.
exports.getProductBySlug = async (slug) => {
    try {
        const p = await catalogueDA.getProductBySlug(String(slug || '').slice(0, 280));
        if (!p) throw fail(404, "We couldn't find that item.");
        const category = (await loadCategories()).find((c) => c.CategoryId === p.CategoryId) || null;
        const [images, related] = await Promise.all([
            catalogueDA.getProductImages(p.ProductId),
            catalogueDA.getRelatedProducts({ productId: p.ProductId, categoryId: p.CategoryId, parentId: category?.ParentCategoryId || p.CategoryId }),
        ]);
        return { product: { ...shape(p), Images: images.map((i) => i.StorageKey) }, category, related: related.map(shape) };
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getProductBySlug', err);
        throw err;
    }
};

// Home page rails (featured, competitive exams, new arrivals) and product counts per top category.
exports.getHomePage = async () => {
    try {
        const { featured, examDesk, newArrivals } = await catalogueDA.getHomePage();
        const cats = await loadCategories();
        const counts = Object.fromEntries(cats.filter((c) => !c.ParentCategoryId).map((c) => [c.Slug, c.ProductCount]));
        return { featured: featured.map(shape), examDesk: examDesk.map(shape), newArrivals: newArrivals.map(shape), counts };
    } catch (err) {
        if (!err.status) console.log('error in catalogueService.getHomePage', err);
        throw err;
    }
};
