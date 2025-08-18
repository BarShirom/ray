// ❌ remove the local `type Report = ...`
import type { Report } from "../../features/reports/reportsSlice";
import "./ReportCard.css"

// helper to show the assignee name from both shapes you use
type Assigned =
  | string
  | { _id: string; firstName?: string; lastName?: string }
  | null
  | undefined;
const assignedToName = (assigned: Assigned | undefined, fallback?: string) => {
  if (!assigned) return fallback ?? "—";
  if (typeof assigned === "string") return fallback ?? "—";
  const { firstName, lastName } = assigned;
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || (fallback ?? "—");
};

export default function ReportCard({
  report,
  onPrimary,
}: {
  report: Report;
  onPrimary: (id: string, status: Report["status"]) => void;
}) {
  const typeClass =
    report.type === "emergency"
      ? "pill pill--type-emergency"
      : report.type === "food"
      ? "pill pill--type-food"
      : "pill pill--type-general";

  const statusClass =
    report.status === "new"
      ? "pill pill--status-new"
      : report.status === "in-progress"
      ? "pill pill--status-inprogress"
      : "pill pill--status-resolved";

  const primaryLabel =
    report.status === "new"
      ? "Claim"
      : report.status === "in-progress"
      ? "Resolve"
      : "View";

  return (
    <div className="card">
      <div className="card__meta">
        <span className={typeClass}>{report.type}</span>
        <span className={statusClass}>{report.status}</span>
        <span className="card__spacer">
          {typeof report.distanceKm === "number"
            ? `${report.distanceKm.toFixed(1)} km`
            : ""}
          {`  •  ${new Date(report.createdAt).toLocaleString()}`}
        </span>
      </div>

      <div className="card__row">
        <div>
          <div className="card__title">{report.description}</div>
          {(report.status === "in-progress" ||
            report.status === "resolved") && (
            <div className="card__sub">
              Assigned to:{" "}
              <b>{assignedToName(report.assignedTo, report.assignedToName ?? undefined)}</b>
            </div>
          )}
        </div>
        <button
          className="btn"
          onClick={() => onPrimary(report._id, report.status)}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
