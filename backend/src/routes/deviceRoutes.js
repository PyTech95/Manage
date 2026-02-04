const express = require("express");
const geoip = require("geoip-lite");

const Device = require("../models/Device");
const DailySummary = require("../models/DailySummary");
const SoftwareUsage = require("../models/SoftwareUsage");

const {
  createDeviceToken,
  hashToken, // sha256(token) in your project
  generateUnlockCode, // ✅ add in utils/crypto.js (recommended) OR fallback below
  hashUnlockCode, // ✅ add in utils/crypto.js (recommended) OR fallback below
} = require("../utils/crypto");

const { authDevice } = require("../middleware/authDevice");
const { authAdmin } = require("../middleware/authAdmin");

const router = express.Router();

/* ================= Helpers ================= */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// If you DIDN'T add generateUnlockCode/hashUnlockCode in crypto.js,
// this fallback will keep it working. Prefer crypto.js methods.
function genUnlockCodeFallback() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function ttlMinutes() {
  const v = parseInt(process.env.UNLOCK_CODE_TTL_MIN || "30", 10);
  return Number.isFinite(v) ? v : 30;
}

function codeHash(code) {
  // ✅ Stronger: HMAC with secret (recommended)
  if (typeof hashUnlockCode === "function") {
    const secret = process.env.UNLOCK_CODE_SECRET || "dev_secret";
    return hashUnlockCode(code, secret);
  }
  // ✅ Basic fallback: sha256(code) via hashToken (works but less ideal)
  return hashToken(String(code));
}

function makeUnlockCode() {
  if (typeof generateUnlockCode === "function") return generateUnlockCode();
  return genUnlockCodeFallback();
}

/* ================= Register device (agent) ================= */
router.post("/register", async (req, res) => {
  const { deviceId, username, os, model } = req.body;
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });

  const deviceToken = createDeviceToken(
    deviceId,
    process.env.DEVICE_TOKEN_SECRET,
  );

  const doc = await Device.findOneAndUpdate(
    { deviceId },
    {
      deviceId,
      username,
      os,
      model,
      deviceTokenHash: hashToken(deviceToken),
      status: { online: true, lastSeen: new Date() },
    },
    { upsert: true, new: true },
  );

  return res.json({ deviceToken, device: { deviceId: doc.deviceId } });
});

/* ================= Heartbeat (agent) + IP-based location ================= */
router.post("/heartbeat", authDevice, async (req, res) => {
  const io = req.app.get("io");
  const device = req.device;

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";

  const geo = geoip.lookup(ip.replace("::ffff:", ""));
  const location = geo
    ? {
        method: "IP",
        ip,
        city: geo.city,
        region: geo.region,
        country: geo.country,
        lat: geo.ll?.[0],
        lng: geo.ll?.[1],
        timestamp: new Date(),
      }
    : { method: "IP", ip, timestamp: new Date() };

  device.status.online = true;
  device.status.lastSeen = new Date();
  device.lastLocation = { ...(device.lastLocation || {}), ...location };

  await device.save();

  io.to("admins").emit("device-update", {
    deviceId: device.deviceId,
    online: true,
    lastSeen: device.status.lastSeen,
    lastLocation: device.lastLocation,
    lockState: device.lockState,
    lastUnlockEvent: device.lastUnlockEvent,
  });

  res.json({ ok: true });
});

/* ================= Receive WIN lat/lng (optional helper or agent) ================= */
router.post("/location", authDevice, async (req, res) => {
  const { lat, lng, accuracyMeters } = req.body;
  const device = req.device;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "lat and lng must be numbers" });
  }

  device.lastLocation = {
    ...(device.lastLocation || {}),
    method: "WIN",
    lat,
    lng,
    accuracyMeters,
    timestamp: new Date(),
  };

  await device.save();

  const io = req.app.get("io");
  io.to("admins").emit("device-update", {
    deviceId: device.deviceId,
    online: device.status?.online ?? true,
    lastSeen: device.status?.lastSeen,
    lastLocation: device.lastLocation,
    lockState: device.lockState,
    lastUnlockEvent: device.lastUnlockEvent,
  });

  res.json({ ok: true });
});

/* ================= Admin: list devices (computed online/offline) ================= */
router.get("/list", authAdmin, async (_req, res) => {
  const devices = await Device.find().sort({ updatedAt: -1 }).lean();

  const OFFLINE_AFTER_MS = 2 * 60 * 1000; // 2 minutes
  const now = Date.now();

  const computed = devices.map((d) => {
    const lastSeen = d?.status?.lastSeen
      ? new Date(d.status.lastSeen).getTime()
      : 0;
    const isOnline = lastSeen && now - lastSeen <= OFFLINE_AFTER_MS;

    return {
      ...d,
      status: { ...(d.status || {}), online: !!isOnline },
    };
  });

  res.json({ devices: computed });
});

/* ================= Admin: device details (modal) ================= */
router.get("/:deviceId/details", authAdmin, async (req, res) => {
  const { deviceId } = req.params;

  const device = await Device.findOne({ deviceId }).lean();
  if (!device) return res.status(404).json({ error: "Device not found" });

  const today = todayUTC();

  const summary = await DailySummary.findOne({ deviceId, date: today }).lean();

  const usage = await SoftwareUsage.find({ deviceId, date: today })
    .sort({ totalMinutes: -1, lastSeen: -1 })
    .lean();

  res.json({
    device,
    today,
    summary: summary || { deviceId, date: today, softwareCount: 0 },
    usage,
  });
});

/* ================= Admin: software list today (new tab page) ================= */
router.get("/:deviceId/software-today", authAdmin, async (req, res) => {
  const { deviceId } = req.params;
  const date = todayUTC();

  const usage = await SoftwareUsage.find({ deviceId, date })
    .sort({ softwareName: 1 })
    .lean();

  res.json({ deviceId, date, usage });
});

/* ================= Agent: unlock with code (user enters code on overlay) =================
   POST /api/device/unlock-with-code
   headers: X-Device-Token
   body: { code }
*/
router.post("/unlock-with-code", authDevice, async (req, res) => {
  const io = req.app.get("io");
  const device = req.device;
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: "code required" });

  if (device.lockState !== "LOCKED") {
    return res.status(400).json({ error: "Device is not locked" });
  }

  if (!device.lockCodeHash || !device.lockCodeExpiresAt) {
    return res.status(400).json({ error: "No active lock code" });
  }

  if (new Date() > new Date(device.lockCodeExpiresAt)) {
    return res.status(400).json({ error: "Code expired" });
  }

  const ok = codeHash(String(code).trim()) === device.lockCodeHash;
  if (!ok) return res.status(401).json({ error: "Invalid code" });

  // ✅ unlock
  device.lockState = "UNLOCKED";
  device.lockCodeHash = null;
  device.lockCodeExpiresAt = null;
  device.lastUnlockEvent = {
    usedAt: new Date(),
    usedCodeLast4: String(code).slice(-4),
    usedByDeviceId: device.deviceId,
  };

  await device.save();

  // tell device to close overlay
  io.to(`device:${device.deviceId}`).emit("command", { command: "UNLOCK" });

  // update admins
  io.to("admins").emit("device-update", {
    deviceId: device.deviceId,
    online: device.status?.online ?? true,
    lastSeen: device.status?.lastSeen,
    lastLocation: device.lastLocation,
    lockState: device.lockState,
    lastUnlockEvent: device.lastUnlockEvent,
  });

  res.json({ ok: true });
});

/* ================= Admin: lock/unlock (real-time command + unlock code) =================
   POST /api/device/:deviceId/command
   body: { command: "LOCK" | "UNLOCK", message?: string }
*/
router.post("/:deviceId/command", authAdmin, async (req, res) => {
  const io = req.app.get("io");
  const { deviceId } = req.params;
  const { command, message } = req.body;

  const device = await Device.findOne({ deviceId });
  if (!device) return res.status(404).json({ error: "Device not found" });

  if (command === "LOCK") {
    const unlockCode = makeUnlockCode();
    const expiresAt = new Date(Date.now() + ttlMinutes() * 60 * 1000);

    device.lockState = "LOCKED";
    device.lockCodeHash = codeHash(unlockCode);
    device.lockCodeExpiresAt = expiresAt;
    await device.save();

    io.to(`device:${deviceId}`).emit("command", {
      command: "LOCK",
      message:
        message || "This device is locked by Admin. Please contact IT support.",
      expiresAt, // ✅ overlay can show expiry timer if you want
    });

    io.to("admins").emit("device-update", {
      deviceId: device.deviceId,
      online: device.status?.online ?? true,
      lastSeen: device.status?.lastSeen,
      lastLocation: device.lastLocation,
      lockState: device.lockState,
      lastUnlockEvent: device.lastUnlockEvent,
    });

    // ✅ Admin panel will show this code
    return res.json({ ok: true, unlockCode, expiresAt });
  }

  if (command === "UNLOCK") {
    device.lockState = "UNLOCKED";
    device.lockCodeHash = null;
    device.lockCodeExpiresAt = null;
    await device.save();

    io.to(`device:${deviceId}`).emit("command", { command: "UNLOCK" });

    io.to("admins").emit("device-update", {
      deviceId: device.deviceId,
      online: device.status?.online ?? true,
      lastSeen: device.status?.lastSeen,
      lastLocation: device.lastLocation,
      lockState: device.lockState,
      lastUnlockEvent: device.lastUnlockEvent,
    });

    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "Invalid command" });
});

module.exports = router;
