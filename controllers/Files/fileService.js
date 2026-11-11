// Rules for serving files. Only product photos uploaded by the owner are public;
// request attachments (school book lists) are never served by the customer API.
// No database here, so this module has no sql.js or DA file.
const { fail } = require('../../utils/access');
const { sendFile } = require('../../utils/fileStore');

const PUBLIC_PRODUCT_PHOTO = /^products\/[\w-]+\/[\w-]+\.(jpg|png|webp)$/;

// Streams a public product photo to the response; anything else is "not found".
exports.getProductPhoto = async (res, key) => {
    try {
        if (!PUBLIC_PRODUCT_PHOTO.test(key)) throw fail(404, 'File not found.');
        await sendFile(res, key);
    } catch (err) {
        if (!err.status) console.log('error in fileService.getProductPhoto', err);
        throw err;
    }
};
