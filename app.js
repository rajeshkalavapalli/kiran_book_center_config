require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { warmUp } = require('./db');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.set('trust proxy', 1);

// Request attachments (school book lists) arrive as base64 inside JSON: up to 3 files × 5 MB.
app.use('/api/requests', express.json({ limit: '22mb' }));
app.use(express.json({ limit: '200kb' }));

// CORS_ORIGINS: comma-separated web addresses allowed to call the API (the shop website). Not set: any (local only).
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', require('./controllers/Catalogue'));
app.use('/api', require('./controllers/Auth'));
app.use('/api', require('./controllers/Account'));
app.use('/api', require('./controllers/Orders'));
app.use('/api', require('./controllers/Requests'));
app.use('/api', require('./controllers/Files'));

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));
app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'That upload is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request was not valid JSON.' });
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong.' });
});

const PORT = Number(process.env.PORT) || 5100;

if (require.main === module) {
    warmUp();
    app.listen(PORT, () => console.log(`Kiran Book Center customer API running on port ${PORT}`));
}

module.exports = app;
