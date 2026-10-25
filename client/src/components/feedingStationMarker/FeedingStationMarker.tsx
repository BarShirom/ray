import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import { formatNumber } from "../../i18n/formatters";
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
      title={t("stations.marker", { name: station.name })}
      alt={t("stations.marker", { name: station.name })}
      zIndexOffset={500}
      eventHandlers={{ click: (event) => {
        // A mouse click does not consistently focus Leaflet's keyboard marker.
        // Give the native dialog an actual opening control to return focus to.
        (event.target as L.Marker).getElement()?.focus({ preventScroll: true });
        onSelect(station);
      } }}
    >
      <Popup eventHandlers={{ add: (event) => {
        const close = (event.target as L.Popup).getElement()?.querySelector<HTMLAnchorElement>(".leaflet-popup-close-button");
        close?.setAttribute("aria-label", t("map.closePopup"));
        close?.setAttribute("title", t("map.closePopup"));
      } }}>
        <div className="feeding-station-popup">
          <small>{t("stations.singular")}</small>
          <strong dir="auto">{station.name}</strong>
          <p>{t("stations.catsCount", { number: formatNumber(station.estimatedCats) })}<br />{t("stations.kittensCount", { number: formatNumber(station.estimatedKittens) })}</p>
          <button type="button" className="btn" onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            onSelect(station);
          }}>{t("stations.details")}</button>
        </div>
      </Popup>
    </Marker>
  );
}
