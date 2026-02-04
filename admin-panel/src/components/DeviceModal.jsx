import { MapPin, X } from "lucide-react";
import LocationCell from "./LocationCell";
import { formatDateTime } from "./helpers";

export default function DeviceModal({
  open,
  loading,
  selected,
  onClose,
  onOpenSoftwareTab,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h3 className="text-lg font-semibold">Device Details</h3>
            <p className="text-xs text-gray-500">
              {selected?.device?.deviceId || "Loading..."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {selected?.device?.deviceId && (
              <button
                onClick={() => onOpenSoftwareTab(selected.device.deviceId)}
                className="px-3 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                Details
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-gray-500">Loading details...</div>
          ) : !selected ? (
            <div className="text-sm text-gray-500">No data</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <InfoCard label="Online">
                  {(selected.device.status?.online ?? false) ? "Online" : "Offline"}
                </InfoCard>

                <InfoCard label="Last Seen">
                  {formatDateTime(selected.device.status?.lastSeen)}
                </InfoCard>

                <InfoCard label="User">
                  {selected.device.username || "—"}
                </InfoCard>

                <InfoCard label="Model">
                  {selected.device.model || "—"}
                </InfoCard>

                <InfoCard label="OS">
                  {selected.device.os || "—"}
                </InfoCard>

                <InfoCard label="Lock State">
                  {selected.device.lockState || "—"}
                </InfoCard>
              </div>

              <div className="mt-4 bg-gray-50 rounded-2xl p-3 text-sm">
                <div className="text-xs text-gray-500 mb-1">Last Location</div>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">
                    <LocationCell loc={selected.device.lastLocation} />
                  </div>

                  {typeof selected.device.lastLocation?.lat === "number" &&
                    typeof selected.device.lastLocation?.lng === "number" && (
                      <a
                        href={`https://www.google.com/maps?q=${selected.device.lastLocation.lat},${selected.device.lastLocation.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline text-sm flex items-center gap-1"
                      >
                        <MapPin size={16} /> Open Map
                      </a>
                    )}
                </div>
              </div>

              <div className="mt-5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm opacity-90">
                      Total Software Used Today
                    </div>
                    <div className="text-3xl font-bold">
                      {selected.summary?.softwareCount ?? 0}
                    </div>
                  </div>

                  <button
                    onClick={() => onOpenSoftwareTab(selected.device.deviceId)}
                    className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-medium"
                  >
                    View All Software →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, children }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold mt-1">{children}</div>
    </div>
  );
}
