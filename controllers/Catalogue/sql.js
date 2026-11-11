// SQL for the public catalogue.
// Query text only: each entry returns the SQL string, and catalogueDA.js runs it (sql.NAME()).

// Shared pieces used by several product queries below.
// Only active products in active categories are visible on the shop website.
const PRODUCT_COLUMNS = `
                p.ProductId,
                p.ProductType,
                p.CategoryId,
                p.Title,
                p.Slug,
                p.Author,
                p.Publisher,
                p.Isbn,
                p.Edition,
                p.PublishYear,
                p.Language,
                p.ClassLevel,
                p.Board,
                p.Subject,
                p.Mrp,
                p.PricingMode,
                p.DiscountPercent,
                p.NetPrice,
                p.SellingPrice,
                p.GstPercent,
                p.StockQty,
                p.IsFeatured,
                p.CreatedOn,
                (SELECT TOP 1 StorageKey FROM dbo.ProductImages i WHERE i.ProductId = p.ProductId ORDER BY i.IsPrimary DESC, i.SortOrder) AS ImageKey`;

const PRODUCT_FROM = `
            FROM dbo.Products p
            JOIN dbo.Categories c ON c.CategoryId = p.CategoryId
            LEFT JOIN dbo.Categories pc ON pc.CategoryId = c.ParentCategoryId`;

const VISIBLE = `p.IsActive = 1 AND c.IsActive = 1 AND (pc.CategoryId IS NULL OR pc.IsActive = 1)`;

module.exports = {
    GET_CATEGORIES: () => {
        return `
            SELECT
                c.CategoryId,
                c.ParentCategoryId,
                c.Name,
                c.Slug,
                c.Description,
                c.SortOrder,
                (SELECT COUNT(*)
                 FROM dbo.Products p
                 JOIN dbo.Categories pcat ON pcat.CategoryId = p.CategoryId
                 WHERE p.IsActive = 1
                   AND (p.CategoryId = c.CategoryId OR pcat.ParentCategoryId = c.CategoryId)) AS ProductCount
            FROM dbo.Categories c
            LEFT JOIN dbo.Categories parent ON parent.CategoryId = c.ParentCategoryId
            WHERE c.IsActive = 1
              AND (parent.CategoryId IS NULL OR parent.IsActive = 1)
            ORDER BY c.SortOrder, c.Name
        `;
    },

    // All filters optional (NULL = any). @Types is a comma list like ',BOOK,KIT,'.
    // `orderBy` is one of the fixed sort expressions in catalogueService (never user text).
    GET_PRODUCTS: (orderBy) => {
        return `
            WITH F AS (
                SELECT ${PRODUCT_COLUMNS}
                ${PRODUCT_FROM}
                WHERE ${VISIBLE}
                  AND (@CategoryId IS NULL OR p.CategoryId = @CategoryId OR c.ParentCategoryId = @CategoryId)
                  AND (@Q IS NULL OR p.Title LIKE @Q OR p.Author LIKE @Q OR p.Publisher LIKE @Q OR p.Isbn LIKE @Q OR p.Subject LIKE @Q OR p.ClassLevel LIKE @Q)
                  AND (@Types IS NULL OR CHARINDEX(',' + p.ProductType + ',', @Types) > 0)
                  AND (@ClassLevel IS NULL OR p.ClassLevel = @ClassLevel)
                  AND (@Board IS NULL OR p.Board = @Board)
                  AND (@InStock = 0 OR p.StockQty > 0)
                  AND (@NetOnly = 0 OR p.PricingMode = 'NET')
                  AND (@MinPrice IS NULL OR p.SellingPrice >= @MinPrice)
                  AND (@MaxPrice IS NULL OR p.SellingPrice <= @MaxPrice)
            )
            SELECT
                *,
                COUNT(*) OVER () AS TotalCount
            FROM F
            ORDER BY ${orderBy}
            OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
        `;
    },

    // Two result sets: class levels and boards on offer, then the price range.
    GET_FACETS: () => {
        return `
            SELECT DISTINCT
                p.ClassLevel AS Value,
                'class' AS Kind
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND p.ClassLevel IS NOT NULL
            UNION ALL
            SELECT DISTINCT
                p.Board,
                'board'
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND p.Board IS NOT NULL;

            SELECT
                ISNULL(FLOOR(MIN(p.SellingPrice)), 0) AS MinPrice,
                ISNULL(CEILING(MAX(p.SellingPrice)), 0) AS MaxPrice
            ${PRODUCT_FROM}
            WHERE ${VISIBLE};
        `;
    },

    GET_PRODUCT_BY_SLUG: () => {
        return `
            SELECT ${PRODUCT_COLUMNS},
                p.Description,
                p.WeightGrams
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND p.Slug = @Slug
        `;
    },

    GET_PRODUCT_IMAGES: () => {
        return `
            SELECT
                StorageKey
            FROM dbo.ProductImages
            WHERE ProductId = @Id
            ORDER BY IsPrimary DESC, SortOrder
        `;
    },

    // Up to 4 items from the same category first, then its parent category.
    GET_RELATED_PRODUCTS: () => {
        return `
            SELECT TOP 4 ${PRODUCT_COLUMNS}
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND p.ProductId <> @Id
              AND (p.CategoryId = @CategoryId OR c.ParentCategoryId = @ParentId OR c.CategoryId = @ParentId)
            ORDER BY
                CASE WHEN p.CategoryId = @CategoryId THEN 0 ELSE 1 END,
                CASE WHEN p.StockQty > 0 THEN 0 ELSE 1 END,
                p.IsFeatured DESC,
                p.CreatedOn DESC
        `;
    },

    // Three result sets: featured, competitive exams, new arrivals.
    GET_HOME_PAGE: () => {
        return `
            SELECT TOP 8 ${PRODUCT_COLUMNS}
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND p.IsFeatured = 1
              AND p.StockQty > 0
            ORDER BY p.UpdatedOn DESC;

            SELECT TOP 10 ${PRODUCT_COLUMNS}
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
              AND (c.Slug = 'competitive-exams' OR pc.Slug = 'competitive-exams')
            ORDER BY
                CASE WHEN p.StockQty > 0 THEN 0 ELSE 1 END,
                p.IsFeatured DESC,
                p.CreatedOn DESC;

            SELECT TOP 10 ${PRODUCT_COLUMNS}
            ${PRODUCT_FROM}
            WHERE ${VISIBLE}
            ORDER BY p.CreatedOn DESC;
        `;
    },

    GET_SHIPPING_ZONES: () => {
        return `
            SELECT
                Code,
                Name,
                Charge,
                FreeAbove,
                EtaDays
            FROM dbo.ShippingZones
            WHERE IsActive = 1
            ORDER BY CASE Code WHEN 'LOCAL' THEN 1 WHEN 'STATE' THEN 2 ELSE 3 END
        `;
    },
};
