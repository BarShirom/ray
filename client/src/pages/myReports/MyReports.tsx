import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { selectAssignedReports, selectAssignedReportsState } from "../../features/reports/reportsSelectors";
import { selectAuthLoading, selectUserId, selectToken } from "../../features/auth/authSelectors";
import { logoutUser } from "../../features/auth/authThunks";
import { fetchMyReports, resolveReport } from "../../features/reports/reportsThunks";
import ReportCard from "../../components/reportCard/ReportCard";
import { reportAssigneeId, type ReportStatus } from "../../features/reports/reportsSlice";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import "./MyReports.css";

export default function MyReports() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const mine = useSelector(selectAssignedReports);
  const assigned = useSelector(selectAssignedReportsState);
  const userId = useSelector(selectUserId);
  const token = useSelector(selectToken);
  const authLoading = useSelector(selectAuthLoading);
  const [actionError, setActionError] = useState<{ userId: string | null; token: string | null; message: string } | null>(null);

  useEffect(() => {
    if (userId && token && !authLoading) void dispatch(fetchMyReports());
  }, [dispatch, userId, token, authLoading]);

  const reauthenticate = async () => {
    await dispatch(logoutUser());
    navigate("/login");
  };

  const handlePrimary = async (id: string, status: ReportStatus) => {
    if (!token || status === "resolved") return;
    const report = mine.find((item) => item._id === id);
    if (!report || reportAssigneeId(report.assignedTo) !== userId) return;
    setActionError(null);
    try { await dispatch(resolveReport({ reportId: id })).unwrap(); }
    catch (error) { setActionError({ userId, token, message: localizeError(error, "report") }); }
  };

  const authenticated = !!userId && !!token && !authLoading;
  const loaded = authenticated && assigned.status === "succeeded";

  return (
    <div className="panel myreports" aria-labelledby="assigned-reports-title">
      <div className="list-header">
        <h1 id="assigned-reports-title">{t("reports.assignedTitle")}</h1>
        {loaded && <span className="hint">{t("reports.assignedCount", { count: mine.length })}</span>}
      </div>
      {authLoading ? <p role="status">{t("reports.authRestoring")}</p> : !authenticated ? (
        <div role="alert"><p>{t("reports.assignedSignIn")}</p><button className="btn" type="button" onClick={() => void reauthenticate()}>{t("reports.signInAgain")}</button></div>
      ) : assigned.status === "unauthorized" ? (
        <div role="alert"><p>{t("reports.assignedExpired")}</p><button className="btn" type="button" onClick={() => void reauthenticate()}>{t("reports.signInAgain")}</button></div>
      ) : assigned.status === "failed" ? (
        <div role="alert"><p>{assigned.error || t("reports.assignedFailed")}</p><button className="btn" type="button" onClick={() => void dispatch(fetchMyReports())}>{t("reports.retryAssigned")}</button></div>
      ) : !loaded ? <p role="status">{t("reports.loadingAssigned")}</p> : mine.length === 0 ? (
        <div className="empty">{t("reports.assignedEmpty")}</div>
      ) : (
        <div className="report-list">{mine.map((report) => <ReportCard key={report._id} report={report} onPrimary={handlePrimary} />)}</div>
      )}
      {loaded && actionError && actionError.userId === userId && actionError.token === token && <p role="alert">{actionError.message}</p>}
    </div>
  );
}
