require('dotenv').config();
const jwt = require('jsonwebtoken');

if (!global.nonceStore) {
  global.nonceStore = new Map();
}

const WHITLIST = process.env.WHITELIST_ADDRESSES?.split(',') || [];

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = (req,