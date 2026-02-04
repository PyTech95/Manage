const express = require("express");
const { authDevice } = require("../middleware/authDevice");
const SoftwareUsage = require("../models/SoftwareUsage");
const DailySummary = require("../models/DailySummary");

const router = express.Router();

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Agent sends process snapshot: ["chrome", "code", ...]
 */
router.post("/process-snapshot", authDevice, async (req, res) => {
  const { deviceId, processes } = req.body;
  const date = todayUTC();

  if (!Array.isArray(processes)) return res.status(400).json({ error: "processes must be array" });

  // Basic mapping: processName -> displayName (extend later)
  const map = {
    chrome: "Google Chrome",
    msedge: "Microsoft Edge",
    code: "VS Code",
    postman: "Postman",
    zoom: "Zoom"
  };

  const names = [...new Set(processes.map(p => p.toLowerCase()))]
    .map(p => map[p] || p)
    .filter(Boolean);

  const now = new Date();

  // Upsert usage
  for (const softwareName of names) {
    await SoftwareUsage.findOneAndUpdate(
      { deviceId, softwareName, date },
      {
        $setOnInsert: { firstSeen: now },
        $set: { lastSeen: now }
      },
      { upsert: true }
    );
  }

  // Update daily summary count
  const uniqueCount = await SoftwareUsage.countDocuments({ deviceId, date });
  await DailySummary.findOneAndUpdate(
    { deviceId, date },
    { $set: { softwareCount: uniqueCount } },
    { upsert: true }
  );

  res.json({ ok: true, softwareCount: uniqueCount });
});

module.exports = router;
