// HTTP side of public product photos. Streams the file itself instead of sending JSON.
const fileService = require('./fileService');

exports.getProductPhoto = async (req, res) => {
    try {
        const key = [].concat(req.params.path).join('/');
        await fileService.getProductPhoto(res, key);
    } catch (err) {
        if (!err.status) console.log('error while sending the product photo', err);
        if (!res.headersSent) res.status(err.status || 500).json({ message: err.status ? err.message : 'Failed to load the file.' });
    }
};
