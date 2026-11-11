// Shop rules shared by the customer API: settings, delivery zones, stock moves, validation helpers.
const { customQuery } = require('./dbFunctions');
const { fail, money } = require('./access');

// Settings the shop website may show (IsPublic = 1).
// Settings the shop website may show. The GSTIN is always included: it's printed on every invoice and the
// website footer shows it, even though it is stored with IsPublic = 0.
const publicSettings = async () => {
    const rows = await customQuery("SELECT SettingKey, SettingValue FROM dbo.ShopSettings WHERE IsPublic = 1 OR SettingKey = 'gst.gstin'");
    return Object.fromEntries(rows.map((r) => [r.SettingKey, r.SettingValue]));
};

const allSettings = async (tx) => {
    const run = tx ? tx.run : customQuery;
    const rows = await run('SELECT SettingKey, SettingValue FROM dbo.ShopSettings');
    return Object.fromEntries(rows.map((r) => [r.SettingKey, r.SettingValue]));
};

const isOn = (settings, key) => String(settings[key] ?? 'true').toLowerCase() === 'true';

/**
 * Delivery zone for an address: LOCAL (pincode in the owner's list) → STATE (same state as the shop)
 * → NATIONAL. Returns null when that zone is switched off.
 */
const zoneFor = async ({ pincode, state }, tx) => {
    const run = tx ? tx.run : customQuery;
    const [row] = await run(
        `DECLARE @ShopState NVARCHAR(60) = (SELECT SettingValue FROM dbo.ShopSettings WHERE SettingKey = 'shop.state');
         SELECT TOP 1 z.ZoneId, z.Code, z.Name, z.Charge, z.FreeAbove, z.EtaDays, z.IsActive
         FROM dbo.ShippingZones z
         WHERE z.Code = CASE
             WHEN EXISTS (SELECT 1 FROM dbo.ShippingZonePincodes p JOIN dbo.ShippingZones lz ON lz.ZoneId = p.ZoneId AND lz.Code = 'LOCAL' WHERE p.Pincode = @Pincode) THEN 'LOCAL'
             WHEN @State = @ShopState THEN 'STATE'
             ELSE 'NATIONAL' END`,
        { Pincode: String(pincode || '').trim(), State: String(state || '').trim() }
    );
    return row && row.IsActive ? row : null;
};

const deliveryCharge = (zone, subtotal) => (!zone ? 0 : zone.FreeAbove && subtotal >= Number(zone.FreeAbove) ? 0 : money(zone.Charge));

// Moves stock and writes the ledger in the caller's transaction. Refuses to go below zero.
const moveStock = async (tx, { productId, change, reason, refId = null, note = null }) => {
    const [row] = await tx.run(
        `UPDATE dbo.Products SET StockQty = StockQty + @Change, UpdatedOn = SYSUTCDATETIME()
         OUTPUT inserted.StockQty, inserted.Title
         WHERE ProductId = @ProductId AND StockQty + @Change >= 0`,
        { ProductId: productId, Change: change }
    );
    if (!row) {
        const [p] = await tx.run('SELECT Title, StockQty FROM dbo.Products WHERE ProductId = @ProductId', { ProductId: productId });
        throw fail(409, p ? (p.StockQty ? `Only ${p.StockQty} left of "${p.Title}". Please lower the quantity.` : `"${p.Title}" just went out of stock. Please remove it from your bag.`) : 'A product in your bag is no longer available.');
    }
    await tx.run(
        `INSERT INTO dbo.StockLedger (ProductId, Change, QtyAfter, Reason, RefId, Note) VALUES (@ProductId, @Change, @QtyAfter, @Reason, @RefId, @Note)`,
        { ProductId: productId, Change: change, QtyAfter: row.StockQty, Reason: reason, RefId: refId, Note: note }
    );
    return row.StockQty;
};

const audit = async ({ actorId = null, action, entityType = null, entityId = null, details = null }) => {
    try {
        await customQuery(
            `INSERT INTO dbo.AuditLog (ActorType, ActorId, Action, EntityType, EntityId, Details) VALUES ('CUSTOMER', @ActorId, @Action, @EntityType, @EntityId, @Details)`,
            { ActorId: actorId, Action: action, EntityType: entityType, EntityId: entityId == null ? null : String(entityId), Details: details == null ? null : JSON.stringify(details) }
        );
    } catch (error) {
        console.error(`Audit not recorded (${action}):`, error.message);
    }
};

/* ---------------- validation ---------------- */
const isMobile = (v) => /^[6-9]\d{9}$/.test(String(v || '').trim());
const isPincode = (v) => /^[1-9]\d{5}$/.test(String(v || '').trim());
const isEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const isGstin = (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(v).trim().toUpperCase());
const passwordProblem = (p) => {
    const v = String(p ?? '');
    if (v.length < 8) return 'Choose a password of at least 8 characters.';
    if (v.length > 128) return 'Use 128 characters or fewer.';
    return null;
};
const STATES = [
    'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
    'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
    'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

module.exports = { publicSettings, allSettings, isOn, zoneFor, deliveryCharge, moveStock, audit, isMobile, isPincode, isEmail, isGstin, passwordProblem, STATES };
