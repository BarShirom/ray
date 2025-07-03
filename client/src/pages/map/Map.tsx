import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";

const Map = () => {
  return (
    <div className="map-container">
      <MapContainer
        center={[32.0853, 34.7818]}
        zoom={13}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[32.0853, 34.7818]}>
          <Popup>A cat was seen here 😺</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

export default Map;
