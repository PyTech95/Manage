import { MapPin } from "lucide-react";

export default function LocationCell({ loc }) {
  if (loc?.city) {
    const region = loc?.region ? `, ${loc.region}` : "";
    const country = loc?.country ? `, ${loc.country}` : "";
    return <span>{`${loc.city}${region}${country}`}</span>;
  }

  if (typeof loc?.lat === "number" && typeof loc?.lng === "number") {
    const mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        title={`${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`}
      >
        <MapPin size={18} className="text-red-500" />
      </a>
    );
  }

  return <span className="text-gray-400">N/A</span>;
}
