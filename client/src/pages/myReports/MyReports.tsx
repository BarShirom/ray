import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { selectAllReports } from "../../features/reports/reportsSelectors";
import { selectUserId, selectToken } from "../../features/auth/authSelectors";
import { resolveReport } from "../../features/reports/reportsThunks";
import ReportCard from "../../components/reportCard/ReportCard";
import type { Report, ReportStatus } from "../../features/reports/reportsSlice";
import "./MyReports.css";

type MaybeId = string | { _id?: string; id?: string } | null | undefined;
const getId = (v: MaybeId) =>
  typeof v === "string" ? v : v?._id ?? v?.id ?? null;

export default function MyReports() {
  const dispatch = useAppDispatch();

  const reports = useSelector(selectAllReports) as Report[];
  const userId = useSelector(selectUserId);
  const token = useSelector(selectToken) ?? null;

  const mine = useMemo<Report[]>(() => {
    const list = reports.filter((r) => getId(r.assignedTo) === userId);
    return list.slice().sort((a, b) => {
      const da = new Date(a.updatedAt ?? a.createdAt).getTime();
      const db = new Date(b.updatedAt ?? b.createdAt).getTime();
      return db - da;
    });
  }, [reports, userId]);

  const handlePrimary = (id: string, status: ReportStatus) => {
    if (!token) return;
    if (status === "resolved") return;

    const r = reports.find((x) => x._id === id);
    if (!r || getId(r.assignedTo) !== userId) return;

    dispatch(resolveReport({ reportId: id }));
  };

  return (
    <div className="panel myreports">
      <div className="list-header">
        <span>My reports</span>
        <span className="hint">{mine.length} total</span>
      </div>

      {mine.length === 0 ? (
        <div className="empty">No claimed reports yet.</div>
      ) : (
        <div className="report-list">
          {mine.map((r) => (
            <ReportCard key={r._id} report={r} onPrimary={handlePrimary} />
          ))}
        </div>
      )}
    </div>
  );
}
