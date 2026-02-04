require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const deviceRoutes = require("./src/routes/deviceRoutes");
const usageRoutes = require("./src/routes/usageRoutes");
const adminRoutes = require("./src/routes/adminRoutes");

// ✅ ADD THIS (IMPORTANT)
const Device = require("./src/models/Device");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN, credentials: true },
});

// Make io available in routes
app.set("io", io);

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/", (_, res) => res.json({ ok: true, name: "ManageX" }));

app.use("/api/admin", adminRoutes);
app.use("/api/device", deviceRoutes);
app.use("/api/usage", usageRoutes);

// Socket rooms
io.on("connection", (socket) => {
  socket.on("join-device", ({ deviceId }) => {
    socket.join(`device:${deviceId}`);
  });

  socket.on("join-admin", () => socket.join("admins"));
});

// ✅ Offline detector (Real-time online/offline)
setInterval(async () => {
  try {
    const OFFLINE_AFTER_MS = 2 * 60 * 1000; // 2 min
    const now = Date.now();

    const devices = await Device.find().lean();

    for (const d of devices) {
      const lastSeen = d?.status?.lastSeen
        ? new Date(d.status.lastSeen).getTime()
        : 0;

      const shouldBeOnline = !!lastSeen && now - lastSeen <= OFFLINE_AFTER_MS;

      // Only update if changed
      if ((d.status?.online ?? false) !== shouldBeOnline) {
        await Device.updateOne(
          { _id: d._id },
          { $set: { "status.online": shouldBeOnline } },
        );

        io.to("admins").emit("device-update", {
          deviceId: d.deviceId,
          online: shouldBeOnline,
          lastSeen: d.status?.lastSeen,
          lastLocation: d.lastLocation,
          lockState: d.lockState,
        });
      }
    }
  } catch (err) {
    console.error("Offline detector error:", err.message);
  }
}, 30 * 1000); // every 30 sec

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Mongo connected");

  const PORT = process.env.PORT || 8080;

  server.listen(PORT, () => {
    console.log(`Backend running on :${PORT}`);
  });
})();
