import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { selectAllReports } from "../../features/reports/reportsSelectors";
import { selectUserId, selectToken } from "../../features/auth/authSelectors";
import { resolveReport } from "../../features/reports/reportsThunks";
import ReportCard from "../../components/reportCard/ReportCard";
import type { Report, ReportStatus } from "../../features/reports/reportsSlice";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import "./MyReports.css";

type MaybeId = string | { _id?: string; id?: string } | null | undefined;
const getId = (v: MaybeId) =>
  typeof v === "string" ? v : v?._id ?? v?.id ?? null;

export default function MyReports() {
  const dispatch = useAppDispatch();

  const reports = useSelector(selectAllReports) as Report[];
  const userId = useSelector(selectUserId);
  const token = useSelector(selectToken) ?? null;
  const [actionError, setActionError] = useState("");

  const mine = useMemo<Report[]>(() => {
    const list = reports.filter((r) => getId(r.assignedTo) === userId);
    return list.slice().sort((a, b) => {
      const da = new Date(a.updatedAt ?? a.createdAt).getTime();
      const db = new Date(b.updatedAt ?? b.createdAt).getTime();
      return db - da;
    });
  }, [reports, userId]);

  const handlePrimary = async (id: string, status: ReportStatus) => {
    if (!token) return;
    if (status === "resolved") return;

    const r = reports.find((x) => x._id === id);
    if (!r || getId(r.assignedTo) !== userId) return;

    setActionError("");
    try { await dispatch(resolveReport({ reportId: id })).unwrap(); }
    catch (error) { setActionError(localizeError(error, "report")); }
  };

  return (
    <div className="panel myreports">
      <div className="list-header">
        <h1>{t("reports.assignedTitle")}</h1>
        <span className="hint">{t("reports.assignedCount", { count: mine.length })}</span>
      </div>

      {mine.length === 0 ? (
        <div className="empty">{t("reports.assignedEmpty")}</div>
      ) : (
        <div className="report-list">
          {mine.map((r) => (
            <ReportCard key={r._id} report={r} onPrimary={handlePrimary} />
          ))}
        </div>
      )}
      {actionError && <p role="alert">{actionError}</p>}
    </div>
  );
}
