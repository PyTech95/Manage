import { Eye } from "lucide-react";
import LocationCell from "./LocationCell";
import { formatDateTime } from "./helpers";

export default function DeviceTable({
  devices,
  onLock,
  onUnlock,
  onOpenDetails,
}) {
  return (
    <div className="bg-white rounded-lg shadow-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-cyan-100">
          <tr>
            <th className="p-3 text-left">Device ID</th>
            <th className="p-3 text-left">User</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Last Seen</th>
            <th className="p-3 text-left">Location</th>
            <th className="p-3 text-left">Actions</th>
            <th className="p-3 text-left">Details</th>
          </tr>
        </thead>

        <tbody>
          {devices.map((d) => {
            const online = d?.status?.online ?? d?.online ?? false;
            const lastSeen = d?.status?.lastSeen ?? d?.lastSeen ?? null;

            const minutesAgo = lastSeen
             ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000)
             : null;

           const hours = minutesAgo !== null ? Math.floor(minutesAgo / 60) : null;
           const minutes = minutesAgo !== null ? minutesAgo % 60 : null;

           const agoText =
             minutesAgo === null
               ? null
               : hours > 0
               ? `${hours} h ${minutes} min`
               : `${minutesAgo} min`;
            return (
              <tr key={d.deviceId} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono">{d.deviceId}</td>
                <td className="p-3">{d.username || "—"}</td>

                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      online
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {online ? "Online" : "Offline"}
                  </span>

                  {!online && agoText && (
                  <div className="text-xs text-gray-500 mt-1">
                    Last seen {agoText} ago
                  </div>
                  )}

                </td>

                <td className="p-3">{formatDateTime(lastSeen)}</td>

                <td className="p-3">
                  <LocationCell loc={d?.lastLocation} />
                </td>

                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onLock(d.deviceId)}
                      className="px-3 py-1.5 text-xs font-medium rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Lock
                    </button>

                    <button
                      onClick={() => onUnlock(d.deviceId)}
                      className="px-3 py-1.5 text-xs font-medium rounded-xl bg-green-50 text-green-600 hover:bg-green-100"
                    >
                      Unlock
                    </button>
                  </div>
                </td>

                <td className="p-3">
                  <button
                    onClick={() => onOpenDetails(d.deviceId)}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            );
          })}

          {devices.length === 0 && (
            <tr>
              <td colSpan="7" className="text-center p-6 text-gray-400">
                No devices found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
