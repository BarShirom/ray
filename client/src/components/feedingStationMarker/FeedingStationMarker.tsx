import L from "leaflet";
import { Marker } from "react-leaflet";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import "./FeedingStationMarker.css";

const stationIcon = L.divIcon({
  className: "feeding-station-marker",
  html: '<span aria-hidden="true">&#128049;</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export default function FeedingStationMarker({ station, onSelect }: {
  station: FeedingStation;
  onSelect: (stationId: string, opener: HTMLElement | null) => void;
}) {
  return (
    <Marker
      position={[station.location.lat, station.location.lng]}
      icon={stationIcon}
      title={t("stations.marker", { name: station.name })}
      alt={t("stations.marker", { name: station.name })}
      zIndexOffset={500}
      keyboard
      autoPanOnFocus={false}
      eventHandlers={{ click: (event) => {
        const opener = (event.target as L.Marker).getElement() ?? null;
        opener?.focus({ preventScroll: true });
        onSelect(station._id, opener);
      } }}
    />
  );
}
