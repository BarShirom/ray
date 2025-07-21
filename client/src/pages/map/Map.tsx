import { useSelector } from "react-redux";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";

import { selectAllReports } from "../../features/reports/reportsSelectors";
import type { Report } from "../../features/reports/reportsSlice";

const Map = () => {
  const reports = useSelector(selectAllReports);

  const defaultCenter = { lat: 32.0853, lng: 34.7818 };
  const center =
    reports.length > 0 ? reports[reports.length - 1].location : defaultCenter;

  return (
    <div className="map-container">
      <div className="map-wrapper">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {reports.map((report) => (
            <Marker
              key={report.id}
              position={[report.location.lat, report.location.lng]}
              icon={getIcon(report.type, report.status)}
            >
              <Popup>
                <div className="popup-content">
                  <div className="popup-header">
                    <span className="popup-emoji">
                      {emojiForType(report.type)}
                    </span>
                    <strong>{capitalize(report.type)}</strong>
                  </div>

                  <p className="popup-description">{report.description}</p>

                  <div className="popup-links">
                    <a
                      href={`https://waze.com/ul?ll=${report.location.lat},${report.location.lng}&navigate=yes`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="popup-link"
                    >
                      📍 Open in <strong>Waze</strong>
                    </a>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="popup-link"
                    >
                      🗺️ Open in <strong>Google Maps</strong>
                    </a>
                  </div>

                  <div className="popup-meta">
                    <div>
                      <strong>Status:</strong> {capitalize(report.status)}
                    </div>
                    <div>
                      <strong>Time:</strong>{" "}
                      {new Date(report.createdAt).toLocaleString()}
                    </div>
                    <div>
                      <strong>Reporter:</strong> {report.createdBy ?? "Guest"}
                    </div>
                  </div>

                  {Array.isArray(report.media) && report.media.length > 0 && (
                    <div className="popup-media">
                      {report.media.map((item, idx) =>
                        item.startsWith("data:image") ? (
                          <img
                            key={idx}
                            src={item}
                            alt={`Media ${idx}`}
                            className="popup-image"
                          />
                        ) : (
                          <video key={idx} controls className="popup-video">
                            <source src={item} />
                            Your browser does not support the video tag.
                          </video>
                        )
                      )}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="map-legend">
        <h4>🗺️ Legend</h4>
        <div className="legend-item">
          <img src="/icons/marker-icon-red.png" alt="Red marker" />
          Emergency (new)
        </div>
        <div className="legend-item">
          <img src="/icons/marker-icon-green.png" alt="Green marker" />
          Food given (new)
        </div>
        <div className="legend-item">
          <img src="/icons/marker-icon-yellow.png" alt="Yellow marker" />
          General (new)
        </div>
        <div className="legend-item">
          <img src="/icons/marker-icon-blue.png" alt="Blue marker" />
          In progress
        </div>
        <div className="legend-item">
          <img src="/icons/marker-icon-grey.png" alt="Gray marker" />
          Resolved
        </div>
      </div>
    </div>
  );
};

function emojiForType(type: Report["type"]) {
  switch (type) {
    case "emergency":
      return "🚨";
    case "food":
      return "🥫";
    case "general":
      return "🐱";
    default:
      return "📍";
  }
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getIcon(type: Report["type"], status: Report["status"]): L.Icon {
  let iconFile = "marker-icon.png";

  if (status === "resolved") iconFile = "marker-icon-gray.png";
  else if (status === "in-progress") iconFile = "marker-icon-blue.png";
  else {
    switch (type) {
      case "emergency":
        iconFile = "marker-icon-red.png";
        break;
      case "food":
        iconFile = "marker-icon-green.png";
        break;
      case "general":
        iconFile = "marker-icon-yellow.png";
        break;
      default:
        iconFile = "marker-icon.png";
    }
  }

  return new L.Icon({
    iconUrl: `/icons/${iconFile}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    shadowSize: [41, 41],
  });
}

export default Map;
