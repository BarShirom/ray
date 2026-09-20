import { CircleMarker, useMapEvents } from "react-leaflet";
import type { FeedingStation } from "../../features/feedingStations/types";

export default function StationLocationPicker({ enabled, location, onSelect }: {
  enabled: boolean;
  location: FeedingStation["location"] | null;
  onSelect: (location: FeedingStation["location"]) => void;
}) {
  useMapEvents({
    click(event) {
      if (enabled) onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return location ? <CircleMarker center={[location.lat, location.lng]} radius={12}
    interactive={false} pathOptions={{ color: "#7c3aed", fillColor: "#fff", fillOpacity: .8, weight: 3, dashArray: "4 3" }} /> : null;
}
