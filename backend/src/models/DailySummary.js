const mongoose = require("mongoose");

const DailySummarySchema = new mongoose.Schema(
  {
    deviceId: { type: String, index: true },
    date: { type: String, index: true },
    softwareCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DailySummary", DailySummarySchema);
