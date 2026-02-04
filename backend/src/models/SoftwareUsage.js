const mongoose = require("mongoose");

const SoftwareUsageSchema = new mongoose.Schema(
  {
    deviceId: { type: String, index: true },
    softwareName: String,
    date: { type: String, index: true }, // YYYY-MM-DD (device local or UTC)
    firstSeen: Date,
    lastSeen: Date,
    totalMinutes: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SoftwareUsage", SoftwareUsageSchema);
