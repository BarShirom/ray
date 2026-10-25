import { MediaImage } from "../media/Media";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import type { Report } from "../../features/reports/reportsSlice";
import {
  claimReport,
  resolveReport,
} from "../../features/reports/reportsThunks";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import { getReporterName } from "../../features/reports/getReporterName";
import { getAssigneeName } from "../../features/reports/getAssigneeName";
import { t } from "../../i18n";
import { formatDateTime, formatNumber, reportTypeLabel, statusLabel } from "../../i18n/formatters";
import { localizeError } from "../../i18n/errors";
import { localizePopupClose } from "../mapPreview/mapAccessibility";
import "./ReportMarker.css";

const emojiForType = (type: Report["type"]) =>
  type === "emergency"
    ? "🚨"
    : type === "food"
    ? "🥫"
    : type === "general"
    ? "🐱"
    : "📍";

type Assigned = string | { _id?: string; id?: string } | null | undefined;
const assignedToId = (assigned: Assigned) => {
  if (!assigned) return null;
  if (typeof assigned === "string") return assigned;
  return assigned._id ?? assigned.id ?? null;
};

type MediaLike = string | { url: string; type?: "image" | "video" };
const isImageUrl = (u: string) => {
  if (u.startsWith("http://127.0.0.1:4001/api/media/") && u.endsWith("/content")) return true;
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
  const [actionError, setActionError] = useState("");

  const icon = useMemo(
    () => buildIcon(report.type, report.status),
    [report.type, report.status]
  );

  const canResolve =
    isLoggedIn &&
    report.status === "in-progress" &&
    assignedToId(report.assignedTo) === userId;

  const handleClaim = async () => {
    setActionError("");
    if (isLoggedIn) {
      try { await dispatch(claimReport({ reportId: report._id })).unwrap(); }
      catch (error) { setActionError(localizeError(error, "report")); }
    }
  };

  const handleResolve = async () => {
    setActionError("");
    if (isLoggedIn) {
      try { await dispatch(resolveReport({ reportId: report._id })).unwrap(); }
      catch (error) { setActionError(localizeError(error, "report")); }
    }
  };

  const showClaim = isLoggedIn && report.status === "new";
  const showResolve = canResolve;

  const reporterName = getReporterName(report);
  const assigneeName = getAssigneeName(report);

  return (
    <Marker position={[report.location.lat, report.location.lng]} icon={icon}
      title={t("map.reportMarker", { type: reportTypeLabel(report.type) })}
      alt={t("map.reportMarker", { type: reportTypeLabel(report.type) })}
      eventHandlers={{ popupopen: (event) => localizePopupClose(event.popup) }}>
      <Popup>
        <div
          className="popup-content"
          role="dialog"
          aria-label={t("reports.details")}
        >
          <div className="popup-header">
            <span className="popup-emoji">{emojiForType(report.type)}</span>
            <strong className="popup-title">{reportTypeLabel(report.type)}</strong>
          </div>

          <p className="popup-description" dir="auto">{report.description}</p>

          <div className="popup-links">
            <a
              href={`https://waze.com/ul?ll=${report.location.lat},${report.location.lng}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              className="chip-link"
            >
              📍 {t("reports.waze")}
            </a>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="chip-link"
            >
              🗺️ {t("reports.googleMaps")}
            </a>
          </div>

          <div className="popup-meta">
            <div>
              <strong>{t("reports.status")}</strong> {statusLabel(report.status)}
            </div>
            <div>
              <strong>{t("reports.time")}</strong>{" "}
              <time dateTime={Number.isNaN(Date.parse(report.createdAt)) ? undefined : report.createdAt}>{formatDateTime(report.createdAt)}</time>
            </div>
            <div>
              <strong>{t("reports.reporter")}</strong> <bdi>{reporterName}</bdi>
            </div>
            {(report.status === "in-progress" ||
              report.status === "resolved") && (
              <div>
                <strong>{t("reports.assignee")}</strong> <bdi>{assigneeName}</bdi>
              </div>
            )}
          </div>

          {Array.isArray(report.media) && report.media.length > 0 && (
            <div className="popup-media">
              {report.media.map((item, idx) => {
                const { url, kind } = toMedia(item as MediaLike);
                return kind === "image" ? (
                  <MediaImage
                    key={idx}
                    src={url}
                    alt={t("reports.mediaAlt", { number: formatNumber(idx + 1) })}
                    className="popup-image"
                  />
                ) : (
                  <video key={idx} controls playsInline className="popup-video">
                    <source src={url} />
                    {t("reports.videoUnsupported")}
                  </video>
                );
              })}
            </div>
          )}

          {(showClaim || showResolve) && (
            <div className="popup-actions">
              {showClaim && (
                <button className="btn btn-brand" onClick={handleClaim}>
                  {t("reports.claim")}
                </button>
              )}
              {showResolve && (
                <button className="btn btn-brand" onClick={handleResolve}>
                  {t("reports.resolve")}
                </button>
              )}
            </div>
          )}
          {actionError && <p role="alert">{actionError}</p>}
        </div>
      </Popup>
    </Marker>
  );
}
