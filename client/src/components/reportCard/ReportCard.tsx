import "./ReportCard.css";
import { useSelector } from "react-redux";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import type { Report } from "../../features/reports/reportsSlice";

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

const assignedToName = (assigned: Assigned | undefined, fallback?: string) => {
  if (!assigned || typeof assigned === "string") return fallback ?? "—";
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
  const token = useSelector(selectToken);
  const userId = useSelector(selectUserId);
  const isLoggedIn = !!token;

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

  const showClaim = isLoggedIn && report.status === "new";
  const showResolve =
    isLoggedIn &&
    report.status === "in-progress" &&
    assignedToId(report.assignedTo) === userId;

  const showButton = showClaim || showResolve;

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
              <b>
                {assignedToName(
                  report.assignedTo,
                  report.assignedToName ?? undefined
                )}
              </b>
            </div>
          )}
        </div>

        {showButton && (
          <button
            className="btn"
            onClick={() => onPrimary(report._id, report.status)}
          >
            {primaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

