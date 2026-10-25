// components/MapPreview.tsx
import { MapContainer, TileLayer, useMapEvents, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import LocalizedMapControls from "./LocalizedMapControls";
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
}: {
  onSelect: (loc: { lat: number; lng: number }) => void;
}) => {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const MapPreview = ({
  selectedLocation,
  onSelect,
}: {
  selectedLocation: { lat: number; lng: number } | null;
  onSelect: (loc: { lat: number; lng: number }) => void;
}) => {
  const center = selectedLocation ?? { lat: 32.0853, lng: 34.7818 };

  return (
    <MapContainer
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
      <LocationMarker onSelect={onSelect} />
      {selectedLocation && (
        <Marker
          position={[selectedLocation.lat, selectedLocation.lng]}
          icon={markerIcon}
          draggable={true}
          title={t("map.locationMarker")}
          alt={t("map.locationMarker")}
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target;
              const pos = marker.getLatLng();
              onSelect({ lat: pos.lat, lng: pos.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
};

export default MapPreview;
