import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import type { Report } from "../../features/reports/reportsSlice";
import {
  claimReport,
  resolveReport,
} from "../../features/reports/reportsThunks";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import "./ReportMarker.css";

// helpers
const emojiForType = (type: Report["type"]) =>
  type === "emergency"
    ? "🚨"
    : type === "food"
    ? "🥫"
    : type === "general"
    ? "🐱"
    : "📍";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// accept both {_id} and {id}
type Assigned =
  | string
  | { _id?: string; id?: string; firstName?: string; lastName?: string }
  | null
  | undefined;

const assignedToId = (assigned: Assigned) => {
  if (!assigned) return null;
  if (typeof assigned === "string") return assigned;
  return assigned._id ?? assigned.id ?? null;
};

const assignedToName = (assigned: Assigned, fallback?: string) => {
  if (!assigned || typeof assigned === "string") return fallback ?? "—";
  const name = [assigned.firstName, assigned.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || (fallback ?? "—");
};

type MediaLike = string | { url: string; type?: "image" | "video" };
const isImageUrl = (u: string) => {
  if (u.startsWith("data:image")) return true;
  if (u.startsWith("data:video")) return false;
  const clean = u.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/.test(clean);
};
const toMedia = (item: MediaLike) => {
  const url = typeof item === "string" ? item : item.url;
  const kind =
    typeof item === "object" && item.type
      ? item.type
      : isImageUrl(url)
      ? "image"
      : "video";
  return { url, kind: kind as "image" | "video" };
};

// png icons must exist in /public/icons
const buildIcon = (type: Report["type"], status: Report["status"]) => {
  let iconFile = "marker-icon.png";
  if (status === "resolved") iconFile = "marker-icon-grey.png";
  else if (status === "in-progress") iconFile = "marker-icon-blue.png";
  else
    iconFile =
      type === "emergency"
        ? "marker-icon-red.png"
        : type === "food"
        ? "marker-icon-green.png"
        : "marker-icon-yellow.png";

  return new L.Icon({
    iconUrl: `/icons/${iconFile}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    shadowSize: [41, 41],
  });
};

export default function ReportMarker({ report }: { report: Report }) {
  const dispatch = useAppDispatch();
  const token = useSelector(selectToken);
  const userId = useSelector(selectUserId);
  const isLoggedIn = !!token;

  const icon = useMemo(
    () => buildIcon(report.type, report.status),
    [report.type, report.status]
  );

  const canResolve =
    isLoggedIn &&
    report.status === "in-progress" &&
    assignedToId(report.assignedTo) === userId;

  const handleClaim = () => {
    const authToken = token ?? undefined;
    if (authToken)
      dispatch(claimReport({ reportId: report._id, token: authToken }));
  };
  const handleResolve = () => {
    const authToken = token ?? undefined;
    if (authToken)
      dispatch(resolveReport({ reportId: report._id, token: authToken }));
  };

  const showClaim = isLoggedIn && report.status === "new";
  const showResolve = canResolve;

  return (
    <Marker position={[report.location.lat, report.location.lng]} icon={icon}>
      <Popup>
        <div
          className="popup-content"
          role="dialog"
          aria-label="Report details"
        >
          <div className="popup-header">
            <span className="popup-emoji">{emojiForType(report.type)}</span>
            <strong className="popup-title">{capitalize(report.type)}</strong>
          </div>

          <p className="popup-description">{report.description}</p>

          <div className="popup-links">
            <a
              href={`https://waze.com/ul?ll=${report.location.lat},${report.location.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              className="chip-link"
            >
              📍 Waze
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="chip-link"
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
                <strong>Assigned to:</strong>{" "}
                {assignedToName(
                  report.assignedTo,
                  report.assignedToName ?? undefined
                )}
              </div>
            )}
          </div>

          {Array.isArray(report.media) && report.media.length > 0 && (
            <div className="popup-media">
              {report.media.map((item, idx) => {
                const { url, kind } = toMedia(item as MediaLike);
                return kind === "image" ? (
                  <img
                    key={idx}
                    src={url}
                    alt={`Report media ${idx + 1}`}
                    className="popup-image"
                  />
                ) : (
                  <video key={idx} controls playsInline className="popup-video">
                    <source src={url} />
                    Your browser does not support the video tag.
                  </video>
                );
              })}
            </div>
          )}

          {(showClaim || showResolve) && (
            <div className="popup-actions">
              {showClaim && (
                <button
                  className="btn btn-compact btn-brand"
                  onClick={handleClaim}
                >
                  🧰 Claim
                </button>
              )}
              {showResolve && (
                <button
                  className="btn btn-compact btn-success"
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
}

