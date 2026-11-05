import { useEffect, useId, useRef } from "react";
import { useSelector, useStore } from "react-redux";
import type { RootState } from "../../app/store";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import type { Report } from "../../features/reports/reportsSlice";
import { getReporterName } from "../../features/reports/getReporterName";
import { getAssigneeName } from "../../features/reports/getAssigneeName";
import { t } from "../../i18n";
import { formatDateTime, formatNumber, reportTypeLabel, statusLabel } from "../../i18n/formatters";
import { isValidMapLocation } from "../mapPreview/location";
import { MediaImage } from "../media/Media";
import { reportActionFor } from "../reportCard/reportAction";
import "./ReportDetails.css";

function isImage(url: string): boolean {
  if (url.startsWith("http://127.0.0.1:4001/api/media/") && url.endsWith("/content")) return true;
  if (url.startsWith("data:image")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(url.split("?")[0]);
}

export default function ReportDetails({ report, onClose, onPrimary, actionPending = false, actionDisabled = false, error }: {
  report: Report;
  onClose: () => void;
  onPrimary: (id: string, status: Report["status"]) => void;
  actionPending?: boolean;
  actionDisabled?: boolean;
  error?: string;
}) {
  const store = useStore<RootState>();
  const instanceSession = useRef(captureSession(store.getState()));
  const token = useSelector(selectToken);
  const userId = useSelector(selectUserId);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const closing = useRef(false);
  const titleId = useId();
  const action = reportActionFor(report, !!token, userId);
  const validLocation = isValidMapLocation(report.location);
  const createdValid = Number.isFinite(Date.parse(report.createdAt));
  const updatedValid = Number.isFinite(Date.parse(report.updatedAt));

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    if (isSessionCurrent(store.getState(), instanceSession.current) && element && !element.open) element.showModal();
    // Capture the node: React can detach the ref before passive cleanup. Native
    // close owns modal teardown; parent owns the surviving compact expand target.
    return () => { mounted.current = false; element?.close(); };
  }, [store]);

  const close = () => {
    if (!mounted.current || closing.current || !isSessionCurrent(store.getState(), instanceSession.current)) return;
    closing.current = true;
    dialog.current?.close();
    onClose();
  };
  const act = () => {
    if (!mounted.current || closing.current || actionPending || actionDisabled || !action || !isSessionCurrent(store.getState(), instanceSession.current)) return;
    onPrimary(report._id, report.status);
  };

  return <dialog ref={dialog} className="report-details" aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className="report-details__header">
      <h2 id={titleId}>{t("reports.details")}: {reportTypeLabel(report.type)}</h2>
      <button type="button" className="btn" aria-label={t("reports.closeDetails")} onClick={close}>{t("reports.close")}</button>
    </header>
    <div className="report-details__body">
      <p className="report-details__description" dir="auto">{report.description}</p>
      <dl className="report-details__meta">
        <div><dt>{t("reports.status")}</dt><dd>{statusLabel(report.status)}</dd></div>
        <div><dt>{t("reports.createdAt")}</dt><dd><time dateTime={createdValid ? report.createdAt : undefined}>{formatDateTime(report.createdAt)}</time></dd></div>
        {updatedValid && <div><dt>{t("reports.updatedAt")}</dt><dd><time dateTime={report.updatedAt}>{formatDateTime(report.updatedAt)}</time></dd></div>}
        <div><dt>{t("reports.reporter")}</dt><dd><bdi>{getReporterName(report)}</bdi></dd></div>
        {(report.status === "in-progress" || report.status === "resolved") && <div><dt>{t("reports.assignee")}</dt><dd><bdi>{getAssigneeName(report)}</bdi></dd></div>}
      </dl>
      {report.status === "resolved" && <p>{t("reports.resolvedMeaning")}</p>}
      {validLocation ? <nav className="report-details__navigation" aria-label={t("reports.location")}>
        <a className="btn" href={`https://waze.com/ul?ll=${report.location.lat},${report.location.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer">{t("reports.waze")}</a>
        <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${report.location.lat},${report.location.lng}`} target="_blank" rel="noopener noreferrer">{t("reports.googleMaps")}</a>
      </nav> : <p>{t("reports.navigationUnavailable")}</p>}
      {report.media && report.media.length > 0 && <div className="report-details__media">
        {report.media.filter((url): url is string => typeof url === "string" && url.length > 0).map((url, index) => isImage(url)
          ? <MediaImage key={`${index}:${url}`} src={url} alt={t("reports.mediaAlt", { number: formatNumber(index + 1) })} className="report-details__image" />
          : <video key={`${index}:${url}`} controls playsInline preload="metadata" className="report-details__video" aria-label={t("reports.mediaAlt", { number: formatNumber(index + 1) })}><source src={url} />{t("reports.videoUnsupported")}</video>)}
      </div>}
      {action && <button type="button" className="btn btn-brand" disabled={actionPending || actionDisabled} onClick={act}>{t(action === "claim" ? "reports.claim" : "reports.resolve")}</button>}
      {actionPending && <p role="status">{t("reports.actionSaving")}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
