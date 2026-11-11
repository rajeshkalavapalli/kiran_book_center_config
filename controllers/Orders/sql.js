// SQL for checkout, orders, invoices and tracking.
// Query text only: each entry returns the SQL string, and orderDA.js runs it (sql.NAME()).

const PRODUCT_IMAGE = `(SELECT TOP 1 StorageKey FROM dbo.ProductImages pi WHERE pi.ProductId = i.ProductId ORDER BY pi.IsPrimary DESC, pi.SortOrder)`;

module.exports = {
    // Current price and stock for the bag (never trust prices sent by the browser).
    // `count` is how many product ids are passed as @P0, @P1, ...
    GET_PRICE_LINES: (count) => {
        return `
            SELECT
                p.ProductId,
                p.Slug,
                p.Title,
                p.Author,
                p.ProductType,
                p.Mrp,
                p.PricingMode,
                p.SellingPrice,
                p.GstPercent,
                p.HsnCode,
                p.StockQty,
                p.IsActive
            FROM dbo.Products p
            WHERE p.ProductId IN (${Array.from({ length: count }, (_, i) => `@P${i}`).join(', ')})
        `;
    },

    NEXT_ORDER_NO: () => {
        return `
            SELECT NEXT VALUE FOR dbo.OrderNoSeq AS N
        `;
    },

    INSERT_ORDER: () => {
        return `
            INSERT INTO dbo.Orders (
                OrderNo,
                CustomerId,
                FulfilmentType,
                PaymentMethod,
                ShipName,
                ShipMobile,
                ShipLine1,
                ShipLine2,
                ShipLandmark,
                ShipCity,
                ShipState,
                ShipPincode,
                ShippingZoneId,
                Subtotal,
                MrpTotal,
                ShippingCharge,
                GrandTotal,
                CustomerNote
            )
            OUTPUT inserted.OrderId
            VALUES (
                @OrderNo,
                @CustomerId,
                @FulfilmentType,
                @PaymentMethod,
                @ShipName,
                @ShipMobile,
                @ShipLine1,
                @ShipLine2,
                @ShipLandmark,
                @ShipCity,
                @ShipState,
                @ShipPincode,
                @ZoneId,
                @Subtotal,
                @MrpTotal,
                @Shipping,
                @Grand,
                @Note
            )
        `;
    },

    INSERT_ORDER_ITEM: () => {
        return `
            INSERT INTO dbo.OrderItems (
                OrderId,
                ProductId,
                Title,
                Mrp,
                PricingMode,
                UnitPrice,
                GstPercent,
                HsnCode,
                Qty
            ) VALUES (
                @OrderId,
                @ProductId,
                @Title,
                @Mrp,
                @PricingMode,
                @UnitPrice,
                @GstPercent,
                @HsnCode,
                @Qty
            )
        `;
    },

    INSERT_ORDER_HISTORY: () => {
        return `
            INSERT INTO dbo.OrderStatusHistory (
                OrderId,
                Status,
                Note,
                ChangedByType,
                ChangedById
            ) VALUES (
                @OrderId,
                @Status,
                @Note,
                'CUSTOMER',
                @CustomerId
            )
        `;
    },

    CLEAR_CART: () => {
        return `
            DELETE FROM dbo.CartItems
            WHERE CustomerId = @CustomerId
        `;
    },

    GET_ORDERS_BY_CUSTOMER: () => {
        return `
            SELECT
                o.OrderId,
                o.OrderNo,
                o.Status,
                o.FulfilmentType,
                o.PaymentMethod,
                o.PaymentStatus,
                o.GrandTotal,
                o.PlacedOn,
                (SELECT SUM(Qty) FROM dbo.OrderItems i WHERE i.OrderId = o.OrderId) AS ItemCount
            FROM dbo.Orders o
            WHERE o.CustomerId = @CustomerId
            ORDER BY o.PlacedOn DESC
        `;
    },

    // Thumbnails for the order list (first 3 items of each order).
    GET_ORDER_THUMBNAILS: () => {
        return `
            SELECT
                x.OrderNo,
                x.ProductId,
                x.Title,
                x.ProductType,
                x.Image
            FROM (
                SELECT
                    o.OrderNo,
                    i.ProductId,
                    i.Title,
                    p.ProductType,
                    ${PRODUCT_IMAGE} AS Image,
                    ROW_NUMBER() OVER (PARTITION BY o.OrderId ORDER BY i.Title) AS rn
                FROM dbo.Orders o
                JOIN dbo.OrderItems i ON i.OrderId = o.OrderId
                LEFT JOIN dbo.Products p ON p.ProductId = i.ProductId
                WHERE o.CustomerId = @CustomerId
            ) x
            WHERE x.rn <= 3
        `;
    },

    // Four result sets: the order, its items, its history (payments hidden) and the invoice number if issued.
    GET_ORDER_BY_NO: () => {
        return `
            SELECT
                o.OrderId,
                o.OrderNo,
                o.CustomerId,
                o.Status,
                o.FulfilmentType,
                o.PaymentMethod,
                o.PaymentStatus,
                o.ShipName,
                o.ShipMobile,
                o.ShipLine1,
                o.ShipLine2,
                o.ShipLandmark,
                o.ShipCity,
                o.ShipState,
                o.ShipPincode,
                o.Subtotal,
                o.MrpTotal,
                o.ShippingCharge,
                o.GrandTotal,
                o.CourierName,
                o.TrackingNo,
                o.TrackingUrl,
                o.CustomerNote,
                o.CancelReason,
                o.PlacedOn,
                z.Name AS ZoneName
            FROM dbo.Orders o
            LEFT JOIN dbo.ShippingZones z ON z.ZoneId = o.ShippingZoneId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId;

            SELECT
                i.ProductId,
                i.Title,
                i.Mrp,
                i.PricingMode,
                i.UnitPrice,
                i.GstPercent,
                i.Qty,
                i.LineTotal,
                p.Slug,
                p.ProductType,
                p.Author,
                ${PRODUCT_IMAGE} AS Image
            FROM dbo.OrderItems i
            JOIN dbo.Orders o ON o.OrderId = i.OrderId
            LEFT JOIN dbo.Products p ON p.ProductId = i.ProductId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId
            ORDER BY i.Title;

            SELECT
                h.Status,
                h.Note,
                h.ChangedOn
            FROM dbo.OrderStatusHistory h
            JOIN dbo.Orders o ON o.OrderId = h.OrderId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId
              AND h.Status <> 'PAYMENT'
            ORDER BY h.HistoryId;

            SELECT
                v.InvoiceId,
                v.InvoiceNo,
                v.IssuedOn
            FROM dbo.Invoices v
            JOIN dbo.Orders o ON o.OrderId = v.OrderId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId
              AND v.IsCancelled = 0;
        `;
    },

    // Locks the order for the rest of the transaction so two clicks can't both cancel it.
    LOCK_ORDER_BY_NO: () => {
        return `
            SELECT
                OrderId,
                OrderNo,
                Status
            FROM dbo.Orders WITH (UPDLOCK, ROWLOCK)
            WHERE OrderNo = @OrderNo
              AND CustomerId = @CustomerId
        `;
    },

    GET_ORDER_ITEMS: () => {
        return `
            SELECT
                ProductId,
                Qty
            FROM dbo.OrderItems
            WHERE OrderId = @OrderId
        `;
    },

    MARK_ORDER_CANCELLED: () => {
        return `
            UPDATE dbo.Orders
            SET Status = 'CANCELLED',
                CancelReason = @Reason,
                UpdatedOn = SYSUTCDATETIME()
            WHERE OrderId = @OrderId
        `;
    },

    // Two result sets: the invoice header and its lines.
    GET_INVOICE: () => {
        return `
            SELECT
                v.*
            FROM dbo.Invoices v
            JOIN dbo.Orders o ON o.OrderId = v.OrderId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId
              AND v.IsCancelled = 0;

            SELECT
                l.LineNumber,
                l.Description,
                l.HsnCode,
                l.Qty,
                l.UnitPrice,
                l.GstPercent,
                l.TaxableValue,
                l.Cgst,
                l.Sgst,
                l.Igst,
                l.LineTotal
            FROM dbo.InvoiceLines l
            JOIN dbo.Invoices v ON v.InvoiceId = l.InvoiceId
            JOIN dbo.Orders o ON o.OrderId = v.OrderId
            WHERE o.OrderNo = @OrderNo
              AND o.CustomerId = @CustomerId
              AND v.IsCancelled = 0
            ORDER BY l.LineNumber;
        `;
    },

    // Public tracking: the order number plus the account's or the delivery mobile.
    TRACK_ORDER: () => {
        return `
            SELECT
                o.OrderId,
                o.OrderNo,
                o.Status,
                o.FulfilmentType,
                o.PaymentStatus,
                o.GrandTotal,
                o.PlacedOn,
                o.CourierName,
                o.TrackingNo,
                o.TrackingUrl
            FROM dbo.Orders o
            JOIN dbo.Customers c ON c.CustomerId = o.CustomerId
            WHERE o.OrderNo = @OrderNo
              AND (c.Mobile = @Mobile OR o.ShipMobile = @Mobile)
        `;
    },

    TRACK_HISTORY: () => {
        return `
            SELECT
                Status,
                ChangedOn
            FROM dbo.OrderStatusHistory
            WHERE OrderId = @OrderId
              AND Status <> 'PAYMENT'
            ORDER BY HistoryId
        `;
    },
};
