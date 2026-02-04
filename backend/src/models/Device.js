const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, unique: true, index: true },
    username: String,
    os: String,
    model: String,
    deviceTokenHash: String,
    status: {
      online: { type: Boolean, default: false },
      lastSeen: Date,
    },
    lastLocation: {
      method: String,
      ip: String,
      city: String,
      region: String,
      country: String,
      lat: Number,
      lng: Number,
      accuracyMeters: Number,
      timestamp: Date,
    },
    lockState: { type: String, default: "UNLOCKED" },
    lockCodeHash: { type: String, default: null },
    lockCodeExpiresAt: { type: Date, default: null },
    lastUnlockEvent: {
      usedAt: Date,
      usedCodeLast4: String,
      usedByDeviceId: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Device", DeviceSchema);
