import { MediaImage } from "../media/Media";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectIsLoggedIn } from "../../features/auth/authSelectors";
import { selectFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsSelectors";
import { createFeedingLog, fetchFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsThunks";
import type { FeedingPeriod } from "../../features/feedingLogs/types";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import { formatDateTime, formatNumber, periodLabel } from "../../i18n/formatters";
import { localizeError } from "../../i18n/errors";
import "./FeedingStationDetails.css";

export default function FeedingStationDetails({ station, onClose }: {
  station: FeedingStation;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector(selectIsLoggedIn);
  const { data: logs, loading, submitting, loadError, submitError } =
    useAppSelector((state) => selectFeedingLogsForStation(state, station._id));
  const dialog = useRef<HTMLDialogElement>(null);
  const openingControl = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState<FeedingPeriod | "">("");
  const [food, setFood] = useState(true);
  const [water, setWater] = useState(false);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (dialog.current && !dialog.current.open) {
      openingControl.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current.showModal();
    }
  }, []);

  const closeDetails = () => {
    if (closing.current) return;
    closing.current = true;
    // Close before React removes the element so native modal/focus cleanup runs.
    dialog.current?.close();
    if (openingControl.current?.isConnected) openingControl.current.focus({ preventScroll: true });
    onClose();
  };

  useEffect(() => {
    dispatch(fetchFeedingLogsForStation(station._id));
  }, [dispatch, station._id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLoggedIn || !station.active || submitting) return;
    setSuccess(false);
    const result = await dispatch(createFeedingLog({
      stationId: station._id,
      data: { period: period || undefined, food, water, note: note.trim() || undefined },
    }));
    if (createFeedingLog.fulfilled.match(result)) {
      setSuccess(true);
      setShowForm(false);
      setPeriod("");
      setFood(true);
      setWater(false);
      setNote("");
    }
  };

  return (
    <dialog
      ref={dialog}
      className="station-details"
      aria-labelledby="station-details-title"
      onCancel={(event) => { event.preventDefault(); closeDetails(); }}
      onClose={closeDetails}
    >
      <header className="station-details-header">
        <div>
          <small>{t("stations.singular")}</small>
          <h2 id="station-details-title" dir="auto">{station.name}</h2>
        </div>
        <button type="button" className="btn" onClick={closeDetails} aria-label={t("stations.closeDetails")}>{t("stations.close")}</button>
      </header>
      <div className="station-details-body">
        {station.image && <MediaImage className="station-details-image" src={station.image} alt={station.name} />}
        <p className="station-details-counts">
          <span>{t("stations.catsCount", { number: formatNumber(station.estimatedCats) })}</span>
          <span>{t("stations.kittensCount", { number: formatNumber(station.estimatedKittens) })}</span>
        </p>
        {station.notes && <p className="station-details-note" dir="auto">{station.notes}</p>}
        {logs[0] && <p>{t("feeding.mostRecent")} <time dateTime={logs[0].fedAt}>{formatDateTime(logs[0].fedAt)}</time></p>}

        {success && <p className="station-details-success" role="status">{t("feeding.recorded")}</p>}
        {!station.active ? <p>{t("feeding.inactive")}</p> : !isLoggedIn ? (
          <div><p>{t("feeding.authPrompt")}</p><div className="station-feeding-actions"><Link to="/login">{t("feeding.login")}</Link><Link to="/register">{t("feeding.signup")}</Link></div></div>
        ) : !showForm ? (
          <button className="btn btn-brand" type="button" disabled={submitting} onClick={() => { setSuccess(false); setShowForm(true); }}>
            {t(submitting ? "feeding.saving" : "feeding.fedHere")}
          </button>
        ) : (
          <form className="station-feeding-form" onSubmit={submit} aria-label={t("feeding.record")} noValidate>
            <fieldset disabled={submitting}>
              <legend>{t("feeding.record")}</legend>
              <label htmlFor="feeding-period">{t("feeding.period")}</label>
              <select id="feeding-period" value={period} onChange={(event) => setPeriod(event.target.value as FeedingPeriod | "")}>
                <option value="">{t("feeding.unspecified")}</option>
                <option value="morning">{periodLabel("morning")}</option>
                <option value="noon">{periodLabel("noon")}</option>
                <option value="evening">{periodLabel("evening")}</option>
              </select>
              <div className="station-feeding-options">
                <label><input type="checkbox" checked={food} onChange={(event) => setFood(event.target.checked)} /> {t("feeding.food")}</label>
                <label><input type="checkbox" checked={water} onChange={(event) => setWater(event.target.checked)} /> {t("feeding.water")}</label>
              </div>
              <label htmlFor="feeding-note">{t("feeding.note")}</label>
              <textarea id="feeding-note" dir="auto" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
              <div className="station-feeding-actions">
                <button className="btn btn-brand" type="submit">{t(submitting ? "feeding.saving" : "feeding.save")}</button>
                <button className="btn" type="button" onClick={() => setShowForm(false)}>{t("feeding.cancel")}</button>
              </div>
            </fieldset>
            {submitting && <p role="status">{t("feeding.saving")}</p>}
            {submitError && <p role="alert">{localizeError(submitError, "feeding")}</p>}
          </form>
        )}

        <section className="station-feeding-history" aria-labelledby="feeding-history-title">
          <h3 id="feeding-history-title">{t("feeding.history")}</h3>
          {loading && <p role="status">{t("feeding.loading")}</p>}
          {loadError && <div role="alert"><p>{localizeError(loadError, "feeding")}</p><button className="btn" type="button" onClick={() => dispatch(fetchFeedingLogsForStation(station._id))}>{t("feeding.retry")}</button></div>}
          {!loading && !loadError && logs.length === 0 && <p>{t("feeding.noRecords")}</p>}
          <ul>
            {logs.slice(0, 10).map((log) => (
              <li key={log._id}>
                <time dateTime={log.fedAt}>{formatDateTime(log.fedAt)}</time>
                {log.period && <span className="station-feeding-period">{periodLabel(log.period)}</span>}
                <p>{t(log.food ? (log.water ? "feeding.foodAndWater" : "feeding.foodOnly") : (log.water ? "feeding.waterOnly" : "feeding.neitherRecorded"))}</p>
                {log.note && <p className="station-details-note" dir="auto">{log.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </dialog>
  );
}
