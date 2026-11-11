// SQL for "Request a book" and school/college bulk enquiries.
// Query text only: each entry returns the SQL string, and requestDA.js runs it (sql.NAME()).
module.exports = {
    NEXT_REQUEST_NO: () => {
        return `
            SELECT NEXT VALUE FOR dbo.RequestNoSeq AS N
        `;
    },

    INSERT_REQUEST: () => {
        return `
            INSERT INTO dbo.ProductRequests (
                RequestNo,
                CustomerId,
                RequestType,
                InstitutionName,
                InstitutionGstin,
                ContactName,
                Mobile,
                Email,
                Note,
                FulfilmentType,
                ShipName,
                ShipMobile,
                ShipLine1,
                ShipLine2,
                ShipCity,
                ShipState,
                ShipPincode
            )
            OUTPUT inserted.RequestId
            VALUES (
                @No,
                @C,
                @Type,
                @Inst,
                @Gstin,
                @Contact,
                @Mobile,
                @Email,
                @Note,
                @Fulfilment,
                @ShipName,
                @ShipMobile,
                @Line1,
                @Line2,
                @City,
                @State,
                @Pincode
            )
        `;
    },

    INSERT_REQUEST_ITEM: () => {
        return `
            INSERT INTO dbo.ProductRequestItems (
                RequestId,
                LineNumber,
                Title,
                Author,
                Publisher,
                ClassLevel,
                Qty
            ) VALUES (
                @R,
                @L,
                @Title,
                @Author,
                @Publisher,
                @Class,
                @Qty
            )
        `;
    },

    INSERT_REQUEST_ATTACHMENT: () => {
        return `
            INSERT INTO dbo.RequestAttachments (
                RequestId,
                StorageKey,
                FileName,
                ContentType,
                SizeBytes
            ) VALUES (
                @R,
                @K,
                @N,
                @T,
                @S
            )
        `;
    },

    INSERT_REQUEST_HISTORY: () => {
        return `
            INSERT INTO dbo.RequestStatusHistory (
                RequestId,
                Status,
                Note,
                ChangedByType,
                ChangedById
            ) VALUES (
                @R,
                @Status,
                @Note,
                'CUSTOMER',
                @C
            )
        `;
    },

    GET_REQUESTS_BY_CUSTOMER: () => {
        return `
            SELECT
                r.RequestId,
                r.RequestNo,
                r.RequestType,
                r.InstitutionName,
                r.Status,
                r.QuoteTotal,
                r.AcceptedOn,
                r.CreatedOn,
                (SELECT COUNT(*) FROM dbo.ProductRequestItems i WHERE i.RequestId = r.RequestId) AS ItemCount,
                (SELECT TOP 1 Title FROM dbo.ProductRequestItems i WHERE i.RequestId = r.RequestId ORDER BY LineNumber) AS FirstTitle
            FROM dbo.ProductRequests r
            WHERE r.CustomerId = @C
            ORDER BY r.CreatedOn DESC
        `;
    },

    // Four result sets: the request, its lines, its history (payments hidden) and attachment names.
    GET_REQUEST_BY_NO: () => {
        return `
            SELECT
                RequestId,
                RequestNo,
                RequestType,
                InstitutionName,
                InstitutionGstin,
                ContactName,
                Mobile,
                Email,
                Note,
                Status,
                PaymentStatus,
                FulfilmentType,
                ShipLine1,
                ShipLine2,
                ShipCity,
                ShipState,
                ShipPincode,
                QuoteItemsTotal,
                QuoteShipping,
                QuoteTotal,
                QuoteValidUntil,
                QuoteNote,
                QuotedOn,
                AcceptedOn,
                RejectReason,
                CourierName,
                TrackingNo,
                TrackingUrl,
                CreatedOn
            FROM dbo.ProductRequests
            WHERE RequestNo = @No
              AND CustomerId = @C;

            SELECT
                i.LineNumber,
                i.Title,
                i.Author,
                i.Publisher,
                i.ClassLevel,
                i.Qty,
                i.QuotedUnitPrice,
                i.IsAvailable
            FROM dbo.ProductRequestItems i
            JOIN dbo.ProductRequests r ON r.RequestId = i.RequestId
            WHERE r.RequestNo = @No
              AND r.CustomerId = @C
            ORDER BY i.LineNumber;

            SELECT
                h.Status,
                h.Note,
                h.ChangedOn
            FROM dbo.RequestStatusHistory h
            JOIN dbo.ProductRequests r ON r.RequestId = h.RequestId
            WHERE r.RequestNo = @No
              AND r.CustomerId = @C
              AND h.Status <> 'PAYMENT'
            ORDER BY h.HistoryId;

            SELECT
                a.FileName
            FROM dbo.RequestAttachments a
            JOIN dbo.ProductRequests r ON r.RequestId = a.RequestId
            WHERE r.RequestNo = @No
              AND r.CustomerId = @C
            ORDER BY a.CreatedOn;
        `;
    },

    // Locks the row for the rest of the transaction so two clicks can't both change it.
    LOCK_REQUEST_BY_NO: () => {
        return `
            SELECT
                RequestId,
                Status,
                QuoteTotal,
                QuoteValidUntil,
                AcceptedOn
            FROM dbo.ProductRequests WITH (UPDLOCK, ROWLOCK)
            WHERE RequestNo = @No
              AND CustomerId = @C
        `;
    },

    MARK_REQUEST_ACCEPTED: () => {
        return `
            UPDATE dbo.ProductRequests
            SET AcceptedOn = SYSUTCDATETIME(),
                UpdatedOn = SYSUTCDATETIME()
            WHERE RequestId = @R
        `;
    },

    MARK_REQUEST_CANCELLED: () => {
        return `
            UPDATE dbo.ProductRequests
            SET Status = 'CANCELLED',
                UpdatedOn = SYSUTCDATETIME()
            WHERE RequestId = @R
        `;
    },
};
