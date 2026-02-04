import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { getQueryParam } from "./components/helpers";

/* ===== Helpers ===== */
function fmtHM(totalMinutes) {
  const m = Number(totalMinutes || 0);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

export default function SoftwarePage({ API }) {
  const deviceId = getQueryParam("deviceId");
  const token = localStorage.getItem("mdm_token") || "";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ deviceId: "", date: "", usage: [] });
  const [q, setQ] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await axios.get(
          `${API}/api/device/${encodeURIComponent(deviceId)}/software-today`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setData(res.data);
      } catch {
        toast.error("Failed to load software list");
        setData({ deviceId, date: "", usage: [] });
      } finally {
        setLoading(false);
      }
    }

    if (deviceId && token) load();
    else setLoading(false);
  }, [deviceId, token, API]);

  const filtered = useMemo(() => {
    const list = data?.usage || [];
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((u) => (u.softwareName || "").toLowerCase().includes(s));
  }, [data, q]);

  const total = filtered.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">Software Used Today</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Device: <span className="font-mono">{deviceId}</span> • Date:{" "}
                  <span className="font-medium">{data.date || "—"}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium"
                >
                  Refresh
                </button>
                <button
                  onClick={() => window.close()}
                  className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium"
                >
                  Close Tab
                </button>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {loading ? (
              <div className="text-gray-500">Loading...</div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div className="text-sm text-gray-600">
                    Total Software:{" "}
                    <span className="font-semibold">{total}</span>
                  </div>

                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search software..."
                    className="w-full sm:w-72 border rounded-xl px-3 py-2 text-sm outline-none focus:ring focus:ring-blue-200"
                  />
                </div>

                <div className="border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-3 text-left">Software Name</th>
                        <th className="p-3 text-left">First Seen</th>
                        <th className="p-3 text-left">Last Seen</th>
                        <th className="p-3 text-left">Usage</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.length ? (
                        filtered.map((u) => (
                          <tr key={u._id} className="border-t hover:bg-gray-50">
                            <td className="p-3 font-medium">{u.softwareName}</td>
                            <td className="p-3">
                              {u.firstSeen
                                ? new Date(u.firstSeen).toLocaleTimeString()
                                : "—"}
                            </td>
                            <td className="p-3">
                              {u.lastSeen
                                ? new Date(u.lastSeen).toLocaleTimeString()
                                : "—"}
                            </td>
                            <td className="p-3">
                              {fmtHM(u.totalMinutes)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="p-6 text-center text-gray-400">
                            No software usage recorded today
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-xs text-gray-500">
                  Tip: Search box se kisi bhi software ko quickly filter कर सकते हो.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
