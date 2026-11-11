const crypto = require('crypto');

const { customQuery } = require('./dbFunctions');

// Customer sessions: signed tokens (HMAC-SHA256, JWT layout) with their own secret (CUSTOMER_AUTH_SECRET),
// so an owner token from the admin API is never accepted here and vice versa.
const TOKEN_TTL_SECONDS = Number(process.env.CUSTOMER_TOKEN_TTL_SECONDS) || 30 * 24 * 60 * 60;

const getSecret = () => {
    const secret = process.env.CUSTOMER_AUTH_SECRET;
    if (!secret || secret.length < 32) throw new Error('CUSTOMER_AUTH_SECRET is missing or shorter than 32 characters.');
    return secret;
};

const base64url = (input) => Buffer.from(input).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');

const issueToken = (customerId) => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ sub: String(customerId), typ: 'customer', iat: now, exp: now + TOKEN_TTL_SECONDS }));
    return { token: `${header}.${payload}.${sign(`${header}.${payload}`)}`, expiresAt: new Date((now + TOKEN_TTL_SECONDS) * 1000).toISOString() };
};

const verifyToken = (token) => {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = Buffer.from(sign(`${header}.${payload}`));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    try {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (claims.typ !== 'customer' || !claims.sub || !claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) return null;
        return claims;
    } catch {
        return null;
    }
};

// ---------- wrong-password limit: 5 failures per mobile number, then 15 minutes locked ----------
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map();
const checkLock = (key) => {
    const entry = failures.get(key);
    if (entry?.until && entry.until > Date.now()) {
        const minutes = Math.ceil((entry.until - Date.now()) / 60000);
        return `Too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
    }
    return null;
};
const recordFailure = (key) => {
    const entry = failures.get(key) || { count: 0, until: 0 };
    if (entry.until && entry.until <= Date.now()) Object.assign(entry, { count: 0, until: 0 });
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) entry.until = Date.now() + LOCK_MS;
    failures.set(key, entry);
};
const clearFailures = (key) => failures.delete(key);

// Reads the token if there is one. Blocked or deleted customers count as signed out.
const readCustomer = async (req) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    const claims = match ? verifyToken(match[1].trim()) : null;
    if (!claims) return null;
    const [c] = await customQuery('SELECT CustomerId, Name, Mobile, Email, MustChangePassword FROM dbo.Customers WHERE CustomerId = @Id AND IsActive = 1', { Id: claims.sub });
    return c ? { customerId: c.CustomerId, name: c.Name, mobile: c.Mobile, email: c.Email, mustChangePassword: c.MustChangePassword } : null;
};

// Sets req.customer when a valid token is present; never blocks (for public routes like checkout).
const optionalCustomer = async (req, res, next) => {
    try {
        req.customer = await readCustomer(req);
        return next();
    } catch (error) {
        console.error('Error checking the session:', error);
        return res.status(500).json({ message: 'Failed to check your session.' });
    }
};

// For routes that need a signed-in customer.
const requireCustomer = async (req, res, next) => {
    try {
        req.customer = await readCustomer(req);
        if (!req.customer) return res.status(401).json({ message: 'Please sign in to continue.' });
        return next();
    } catch (error) {
        console.error('Error checking the session:', error);
        return res.status(500).json({ message: 'Failed to check your session.' });
    }
};

module.exports = { issueToken, verifyToken, checkLock, recordFailure, clearFailures, optionalCustomer, requireCustomer };
