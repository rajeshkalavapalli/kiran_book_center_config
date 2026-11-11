// Routes for public product photos. Routes only: the work is in fileHandler.js.
const express = require('express');

const fileHandler = require('./fileHandler');

const router = express.Router();

router.get('/files/*path', fileHandler.getProductPhoto);

module.exports = router;
