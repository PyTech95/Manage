const Device = require("../models/Device");
const { hashToken } = require("../utils/crypto");

async function authDevice(req, res, next) {
  const token = req.header("X-Device-Token");
  const deviceId = req.body.deviceId || req.query.deviceId;

  if (!token || !deviceId) return res.status(401).json({ error: "Device auth missing" });

  const d = await Device.findOne({ deviceId });
  if (!d) return res.status(401).json({ error: "Unknown device" });

  if (hashToken(token) !== d.deviceTokenHash) return res.status(401).json({ error: "Invalid token" });

  req.device = d;
  next();
}

module.exports = { authDevice };
