import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import type { Report } from "../../features/reports/reportsSlice";
import {
  claimReport,
  resolveReport,
} from "../../features/reports/reportsThunks";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import "./ReportMarker.css";

interface ReportMarkerProps {
  report: Report;
}

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

const ReportMarker = ({ report }: ReportMarkerProps) => {
  const dispatch = useAppDispatch();
  const token = useSelector(selectToken);
  const userId = useSelector(selectUserId);

  
  const handleClaim = () => {
    if (token) dispatch(claimReport({ reportId: report._id, token }));
  };

  const handleResolve = () => {
    if (token) dispatch(resolveReport({ reportId: report._id, token }));
  };
 console.log({ reportAssignedTo: report.assignedTo, userId });

  return (
    <Marker
      position={[report.location.lat, report.location.lng]}
      icon={getIcon(report.type, report.status)}
    >
      <Popup>
        <div className="popup-content">
          <div className="popup-header">
            <span className="popup-emoji">{emojiForType(report.type)}</span>
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
              📍 Waze
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="popup-link"
            >
              🗺️ Google Maps
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
              <strong>Reporter:</strong> {report.createdByName ?? "Guest"}
            </div>

            {(report.status === "in-progress" ||
              report.status === "resolved") && (
              <div>
                <strong>Assigned to:</strong> {report.assignedToName ?? "—"}
              </div>
            )}
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

          {/* Claim / Resolve Buttons */}
          {token && (
            <div className="popup-actions">
              {report.status === "new" && (
                <button className="popup-button claim" onClick={handleClaim}>
                  ✅ Claim Report
                </button>
              )}
              {report.status === "in-progress" &&
                report.assignedTo === userId && (
                  <button
                    className="popup-button resolve"
                    onClick={handleResolve}
                  >
                    ✔️ Mark as Resolved
                  </button>
                )}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
};

export default ReportMarker;
