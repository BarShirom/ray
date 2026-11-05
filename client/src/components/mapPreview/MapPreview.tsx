// components/MapPreview.tsx
import { MapContainer, TileLayer, useMapEvents, Marker } from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import LocalizedMapControls from "./LocalizedMapControls";
import { isValidMapLocation, type MapLocation } from "./location";
import { t } from "../../i18n";

const markerIcon = new L.Icon({
  iconUrl: "/icons/marker-icon-blue.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
});

const LocationMarker = ({
  onSelect,
  describedBy,
}: {
  onSelect: (loc: L.LatLng) => void;
  describedBy?: string;
}) => {
  const map = useMapEvents({
    click(e) {
      onSelect(e.latlng);
    },
  });
  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", t("reports.locationMap"));
    if (describedBy) container.setAttribute("aria-describedby", describedBy);
  }, [map, describedBy]);
  return null;
};

const MapPreview = ({
  selectedLocation,
  onSelect,
  disabled = false,
  describedBy,
}: {
  selectedLocation: MapLocation | null;
  onSelect: (loc: MapLocation | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) => {
  const map = useRef<L.Map | null>(null);
  const selected = isValidMapLocation(selectedLocation) ? selectedLocation : null;
  const center = selected ?? { lat: 32.0853, lng: 34.7818 };
  const selectPoint = (point: L.LatLng) => {
    if (disabled) return;
    // Leaflet can pan across repeated worlds. Preserve the same geographic point
    // while keeping the submitted longitude inside the database's valid range.
    const wrapped = point.wrap();
    if (isValidMapLocation(wrapped)) onSelect({ lat: wrapped.lat, lng: wrapped.lng });
  };

  return (
    <div className="report-location-picker" inert={disabled} aria-disabled={disabled}>
      <MapContainer
        ref={map}
        className="report-location-map"
        center={[center.lat, center.lng]}
        zoom={13}
        zoomControl={false}
        style={{
          height: "200px",
          width: "100%",
          marginTop: "1rem",
          borderRadius: "8px",
        }}
      >
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LocalizedMapControls />
        <LocationMarker onSelect={selectPoint} describedBy={describedBy} />
        {selected && (
          <Marker
            position={[selected.lat, selected.lng]}
            icon={markerIcon}
            draggable={true}
            title={t("map.locationMarker")}
            alt={t("map.locationMarker")}
            eventHandlers={{
              dragend: (e) => {
                const marker = e.target;
                const pos = marker.getLatLng();
                selectPoint(pos);
              },
            }}
          />
        )}
      </MapContainer>
      <div className="report-location-actions">
        <button type="button" className="btn" disabled={disabled} onClick={() => {
          const current = map.current;
          if (current && !disabled) selectPoint(current.getCenter());
        }}>{t("reports.selectMapCenter")}</button>
        <button type="button" className="btn btn-ghost" disabled={disabled || !selected} onClick={() => {
          if (!disabled) onSelect(null);
        }}>{t("reports.clearLocation")}</button>
      </div>
    </div>
  );
};

export default MapPreview;
