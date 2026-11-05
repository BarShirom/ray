import { Marker } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import type { Report } from "../../features/reports/reportsSlice";
import { t } from "../../i18n";
import { reportTypeLabel } from "../../i18n/formatters";
import "./ReportMarker.css";

const buildIcon = (type: Report["type"], status: Report["status"]) => {
  let iconFile = "marker-icon.png";
  if (status === "resolved") iconFile = "marker-icon-grey.png";
  else if (status === "in-progress") iconFile = "marker-icon-blue.png";
  else iconFile = type === "emergency" ? "marker-icon-red.png" : type === "food" ? "marker-icon-green.png" : "marker-icon-yellow.png";

  return new L.Icon({
    iconUrl: `/icons/${iconFile}`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    shadowSize: [41, 41],
  });
};

export default function ReportMarker({ report, onSelect }: {
  report: Report;
  onSelect: (reportId: string, opener: HTMLElement | null) => void;
}) {
  const icon = useMemo(() => buildIcon(report.type, report.status), [report.type, report.status]);
  return (
    <Marker
      position={[report.location.lat, report.location.lng]}
      icon={icon}
      keyboard
      autoPanOnFocus={false}
      title={t("map.reportMarker", { type: reportTypeLabel(report.type) })}
      alt={t("map.reportMarker", { type: reportTypeLabel(report.type) })}
      eventHandlers={{ click: (event) => {
        const opener = (event.target as L.Marker).getElement() ?? null;
        // Pointer selection captures the same control as Leaflet's built-in
        // Enter activation. The parent owns selection and focus return.
        opener?.focus({ preventScroll: true });
        onSelect(report._id, opener);
      } }}
    />
  );
}
