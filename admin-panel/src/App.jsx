import { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { toast } from "sonner";

import manageXLogo from "./assets/mangeX.png";
import SoftwarePage from "./SoftwarePage";
import DeviceTable from "./components/DeviceTable";
import DeviceModal from "./components/DeviceModal";
import { getQueryParam } from "./components/helpers";

// const API = "https://managexbackend.onrender.com";
const API = "http://localhost:8080";

export default function App() {
  // ✅ new tab software page
  const view = getQueryParam("view");
  if (view === "software") return <SoftwarePage API={API} />;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState(localStorage.getItem("mdm_token") || "");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  async function login(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/admin/login`, { email, password });
      setToken(res.data.token);
      localStorage.setItem("mdm_token", res.data.token);
      toast.success("Login successful");
    } catch {
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  async function loadDevices(t) {
    try {
      const res = await axios.get(`${API}/api/device/list`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      setDevices(res.data.devices || []);
    } catch {
      toast.error("Failed to load devices");
    }
  }

  async function openDetails(deviceId) {
    setDetailsLoading(true);
    setDetailsOpen(true);

    try {
      const res = await axios.get(`${API}/api/device/${deviceId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelected(res.data);
    } catch {
      toast.error("Failed to load device details");
      setDetailsOpen(false);
      setSelected(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  function openSoftwareTab(deviceId) {
    const url = `${window.location.origin}/?view=software&deviceId=${encodeURIComponent(deviceId)}`;
    window.open(url, "_blank");
  }

async function sendCommand(deviceId, command) {
  const toastId = toast.loading(`Sending ${command} command...`);
  try {
    const res = await axios.post(
      `${API}/api/device/${deviceId}/command`,
      { command },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (command === "LOCK" && res.data?.unlockCode) {
      toast.success(`LOCK sent. Unlock Code: ${res.data.unlockCode} (expires soon)`, { id: toastId });
      // optional: copy to clipboard
      navigator.clipboard?.writeText(res.data.unlockCode).catch(() => {});
    } else {
      toast.success(`${command} command sent`, { id: toastId });
    }
  } catch (e) {
    toast.error("Command failed", { id: toastId });
  }
}


  // ✅ socket live updates (table + modal)
  useEffect(() => {
    if (!token) return;

    loadDevices(token);

    const socket = io(API, { transports: ["websocket"] });
    socket.emit("join-admin");

    socket.on("device-update", (u) => {
      // table update
      setDevices((prev) =>
        prev.map((d) => (d.deviceId === u.deviceId ? { ...d, ...u } : d))
      );

      // modal update
      setSelected((prev) => {
        if (!prev?.device?.deviceId) return prev;
        if (prev.device.deviceId !== u.deviceId) return prev;

        const nextOnline =
          u?.status?.online ?? u?.online ?? prev.device.status?.online ?? false;
        const nextLastSeen =
          u?.status?.lastSeen ?? u?.lastSeen ?? prev.device.status?.lastSeen ?? null;

        return {
          ...prev,
          device: {
            ...prev.device,
            status: {
              ...(prev.device.status || {}),
              online: nextOnline,
              lastSeen: nextLastSeen,
            },
            lastLocation: u.lastLocation ?? prev.device.lastLocation,
            lockState: u.lockState ?? prev.device.lockState,
          },
        };
      });
    });

    return () => socket.close();
  }, [token]);

  // ✅ Login UI
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 p-4">
        <form onSubmit={login} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <h2 className="text-2xl font-bold text-center">MDM Admin</h2>
          <p className="text-center text-gray-500 text-sm mb-6">
            Secure device management console
          </p>

          <div className="mb-4">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              className="w-full mt-1 border rounded-xl px-3 py-2 focus:ring focus:ring-blue-300 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-6">
            <label className="text-sm font-medium">Password</label>
            <input
              type="password"
              className="w-full mt-1 border rounded-xl px-3 py-2 focus:ring focus:ring-blue-300 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-xl hover:bg-blue-700 transition font-medium"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    );
  }

  // ✅ Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col items-center">
            <img src={manageXLogo} alt="ManageX Logo" className="h-14 mb-2" />
            <p className="text-center text-gray-500 text-sm">
              Monitor and control company devices in real time
            </p>
          </div>

          <button
            onClick={() => {
              setToken("");
              localStorage.removeItem("mdm_token");
            }}
            className="text-sm text-red-600 hover:underline"
          >
            Logout
          </button>
        </div>

        <DeviceTable
          devices={devices}
          onLock={(id) => sendCommand(id, "LOCK")}
          onUnlock={(id) => sendCommand(id, "UNLOCK")}
          onOpenDetails={openDetails}
        />
      </div>

      <DeviceModal
        open={detailsOpen}
        loading={detailsLoading}
        selected={selected}
        onClose={() => {
          setDetailsOpen(false);
          setSelected(null);
        }}
        onOpenSoftwareTab={openSoftwareTab}
      />
    </div>
  );
}
