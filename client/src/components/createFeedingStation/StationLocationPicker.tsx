import { CircleMarker, useMapEvents } from "react-leaflet";
import { DomEvent } from "leaflet";
import { useEffect, useRef } from "react";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";

export default function StationLocationPicker({ enabled, location, onSelect }: {
  enabled: boolean;
  location: FeedingStation["location"] | null;
  onSelect: (location: FeedingStation["location"]) => void;
}) {
  const controls = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (controls.current) DomEvent.disableClickPropagation(controls.current);
  }, [enabled]);
  const map = useMapEvents({
    click(event) {
      if (enabled) onSelect({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return <>
    {enabled && <div className="station-location-keyboard" ref={controls}>
      <p>{t("stations.mapLocationKeyboard")}</p>
      <button className="btn" type="button" onClick={(event) => {
        event.stopPropagation();
        const center = map.getCenter();
        onSelect({ lat: center.lat, lng: center.lng });
      }}>{t("stations.selectMapCenter")}</button>
    </div>}
    {location && <CircleMarker center={[location.lat, location.lng]} radius={12}
      interactive={false} pathOptions={{ color: "#7c3aed", fillColor: "#fff", fillOpacity: .8, weight: 3, dashArray: "4 3" }} />}
  </>;
}
