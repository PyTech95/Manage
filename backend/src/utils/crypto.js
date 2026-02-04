const crypto = require("crypto");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createDeviceToken(deviceId, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(deviceId + ":" + Date.now())
    .digest("hex");
}

// ✅ NEW: 6 digit unlock code
function generateUnlockCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // "123456"
}

function hashUnlockCode(code, secret) {
  return crypto.createHmac("sha256", secret).update(code).digest("hex");
}

module.exports = {
  hashToken,
  createDeviceToken,
  generateUnlockCode,
  hashUnlockCode,
};
