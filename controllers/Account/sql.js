// SQL for the signed-in customer's profile, addresses, bag and wishlist.
// Query text only: each entry returns the SQL string, and accountDA.js runs it (sql.NAME()).
module.exports = {
    /* ---------------- profile ---------------- */

    GET_PROFILE: () => {
        return `
            SELECT
                CustomerId,
                Name,
                Mobile,
                Email,
                CreatedOn,
                MustChangePassword
            FROM dbo.Customers
            WHERE CustomerId = @Id
        `;
    },

    CHECK_EMAIL_TAKEN: () => {
        return `
            SELECT 1 AS T
            FROM dbo.Customers
            WHERE Email = @E
              AND CustomerId <> @Id
        `;
    },

    UPDATE_PROFILE: () => {
        return `
            UPDATE dbo.Customers
            SET Name = @Name,
                Email = @Email
            OUTPUT
                inserted.CustomerId,
                inserted.Name,
                inserted.Mobile,
                inserted.Email,
                inserted.CreatedOn,
                inserted.MustChangePassword
            WHERE CustomerId = @Id
        `;
    },

    /* ---------------- addresses ---------------- */

    GET_ADDRESSES: () => {
        return `
            SELECT
                AddressId,
                Name,
                Mobile,
                Line1,
                Line2,
                Landmark,
                City,
                State,
                Pincode,
                IsDefault
            FROM dbo.CustomerAddresses
            WHERE CustomerId = @Id
            ORDER BY IsDefault DESC, CreatedOn DESC
        `;
    },

    FIND_SAME_ADDRESS: () => {
        return `
            SELECT
                AddressId
            FROM dbo.CustomerAddresses
            WHERE CustomerId = @C
              AND Line1 = @Line1
              AND Pincode = @Pincode
              AND Name = @Name
        `;
    },

    COUNT_ADDRESSES: () => {
        return `
            SELECT COUNT(*) AS N
            FROM dbo.CustomerAddresses
            WHERE CustomerId = @C
        `;
    },

    CLEAR_DEFAULT_ADDRESS: () => {
        return `
            UPDATE dbo.CustomerAddresses
            SET IsDefault = 0
            WHERE CustomerId = @C
        `;
    },

    INSERT_ADDRESS: () => {
        return `
            INSERT INTO dbo.CustomerAddresses (
                CustomerId,
                Name,
                Mobile,
                Line1,
                Line2,
                Landmark,
                City,
                State,
                Pincode,
                IsDefault
            )
            OUTPUT inserted.AddressId
            VALUES (
                @C,
                @Name,
                @Mobile,
                @Line1,
                @Line2,
                @Landmark,
                @City,
                @State,
                @Pincode,
                @IsDefault
            )
        `;
    },

    DELETE_ADDRESS: () => {
        return `
            DELETE FROM dbo.CustomerAddresses
            OUTPUT deleted.IsDefault
            WHERE AddressId = @Id
              AND CustomerId = @C
        `;
    },

    MAKE_NEWEST_ADDRESS_DEFAULT: () => {
        return `
            UPDATE dbo.CustomerAddresses
            SET IsDefault = 1
            WHERE AddressId = (
                SELECT TOP 1 AddressId
                FROM dbo.CustomerAddresses
                WHERE CustomerId = @C
                ORDER BY CreatedOn DESC
            )
        `;
    },

    /* ---------------- bag ---------------- */

    GET_CART: () => {
        return `
            SELECT
                ci.ProductId,
                ci.Qty,
                p.Slug,
                p.Title,
                p.Author,
                p.Publisher,
                p.ProductType,
                p.Mrp,
                p.SellingPrice,
                p.PricingMode,
                p.DiscountPercent,
                p.StockQty,
                p.IsActive,
                (SELECT TOP 1 StorageKey FROM dbo.ProductImages i WHERE i.ProductId = p.ProductId ORDER BY i.IsPrimary DESC, i.SortOrder) AS Image
            FROM dbo.CartItems ci
            JOIN dbo.Products p ON p.ProductId = ci.ProductId
            WHERE ci.CustomerId = @C
            ORDER BY ci.AddedOn
        `;
    },

    CLEAR_CART: () => {
        return `
            DELETE FROM dbo.CartItems
            WHERE CustomerId = @C
        `;
    },

    // Adds or sets one line (only for active products). Quantities are capped at 999.
    UPSERT_CART_LINE: () => {
        return `
            IF EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @P AND IsActive = 1)
            BEGIN
                UPDATE dbo.CartItems
                SET Qty = CASE
                              WHEN @Mode = 'merge' THEN IIF(Qty + @Q > 999, 999, Qty + @Q)
                              ELSE IIF(@Q > 999, 999, @Q)
                          END
                WHERE CustomerId = @C
                  AND ProductId = @P;

                IF @@ROWCOUNT = 0
                    INSERT INTO dbo.CartItems (CustomerId, ProductId, Qty)
                    VALUES (@C, @P, IIF(@Q > 999, 999, @Q));
            END
        `;
    },

    /* ---------------- wishlist ---------------- */

    GET_WISHLIST: () => {
        return `
            SELECT
                w.ProductId,
                p.Slug,
                p.Title,
                p.Author,
                p.Publisher,
                p.ProductType,
                p.Mrp,
                p.SellingPrice,
                p.PricingMode,
                p.DiscountPercent,
                p.StockQty,
                p.ClassLevel,
                (SELECT TOP 1 StorageKey FROM dbo.ProductImages i WHERE i.ProductId = p.ProductId ORDER BY i.IsPrimary DESC, i.SortOrder) AS Image
            FROM dbo.WishlistItems w
            JOIN dbo.Products p ON p.ProductId = w.ProductId
            WHERE w.CustomerId = @C
              AND p.IsActive = 1
            ORDER BY w.AddedOn DESC
        `;
    },

    ADD_TO_WISHLIST: () => {
        return `
            IF EXISTS (SELECT 1 FROM dbo.Products WHERE ProductId = @P AND IsActive = 1)
               AND NOT EXISTS (SELECT 1 FROM dbo.WishlistItems WHERE CustomerId = @C AND ProductId = @P)
                INSERT INTO dbo.WishlistItems (CustomerId, ProductId)
                VALUES (@C, @P)
        `;
    },

    REMOVE_FROM_WISHLIST: () => {
        return `
            DELETE FROM dbo.WishlistItems
            WHERE CustomerId = @C
              AND ProductId = @P
        `;
    },
};
