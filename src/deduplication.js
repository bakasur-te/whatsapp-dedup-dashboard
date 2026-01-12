const crypto = require('crypto');

function generateTextHash(senderId, messageBody) {
    const content = `${senderId || 'unknown'}:${messageBody || ''}`;
    return crypto.createHash('sha256').update(content).digest('hex');
}

function generateMediaHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hasLinks(text) {
    if (!text) return false;
    const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|in|co|io|me|app|dev|xyz|info|biz|edu|gov)[^\s]*/gi;
    return urlPattern.test(text);
}

function hasPrices(text) {
    if (!text) return false;
    const pricePattern = /[₹$€£¥][\s]?[\d,]+\.?\d*|Rs\.?\s?[\d,]+\.?\d*|\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?(?:\s?(?:rupees?|rs|inr|dollars?|usd|euros?|lakh|lakhs|crore|crores|k|K|L|Cr))?/gi;
    return pricePattern.test(text);
}

function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = { generateTextHash, generateMediaHash, hasLinks, hasPrices, generateId };
