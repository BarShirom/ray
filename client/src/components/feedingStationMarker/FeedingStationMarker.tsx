import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { FeedingStation } from "../../features/feedingStations/types";
import "./FeedingStationMarker.css";

const stationIcon = L.divIcon({
  className: "feeding-station-marker",
  html: '<span aria-hidden="true">&#128049;</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -20],
});

export default function FeedingStationMarker({ station, onSelect }: {
  station: FeedingStation;
  onSelect: (station: FeedingStation) => void;
}) {
  return (
    <Marker
      position={[station.location.lat, station.location.lng]}
      icon={stationIcon}
      title={`Feeding station: ${station.name}`}
      alt={`Feeding station: ${station.name}`}
      zIndexOffset={500}
      eventHandlers={{ click: () => onSelect(station) }}
    >
      <Popup>
        <div className="feeding-station-popup">
          <small>Feeding station</small>
          <strong>{station.name}</strong>
          <p>Estimated cats: {station.estimatedCats}<br />Estimated kittens: {station.estimatedKittens}</p>
          <button type="button" className="btn" onClick={() => onSelect(station)}>Station details</button>
        </div>
      </Popup>
    </Marker>
  );
}
