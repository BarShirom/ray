import { StationMediaImage } from "../media/StationMediaImage";
import { useEffect, useRef, useState } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectIsLoggedIn } from "../../features/auth/authSelectors";
import type { RootState } from "../../app/store";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import { selectFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsSelectors";
import { createFeedingLog, fetchFeedingLogsForStation, fetchFeedingSummaryForStation } from "../../features/feedingLogs/feedingLogsThunks";
import { fetchFeedingStationDetail } from "../../features/feedingStations/feedingStationsThunks";
import { selectFeedingStationDetailState, selectStationKnownInactive } from "../../features/feedingStations/feedingStationsSelectors";
import type { FeedingPeriod } from "../../features/feedingLogs/types";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import { formatDateTime, formatNumber, periodLabel } from "../../i18n/formatters";
import { localizeError } from "../../i18n/errors";
import FeedingCoordinationSummary from "./FeedingCoordinationSummary";
import { useApiRetryGate } from "../../api/useApiRetryGate";
import "./FeedingStationDetails.css";

export default function FeedingStationDetails({ station, onClose }: {
  station: FeedingStation;
  onClose: () => void;
}) {
  const store = useStore<RootState>();
  const instanceSession = useRef(captureSession(store.getState()));
  const dispatch = useAppDispatch();
  const isLoggedIn = useAppSelector(selectIsLoggedIn);
  const { data: logs, loading, submitting, loadError, submitError, nextCursor, summary, summaryLoading, summaryError } =
    useAppSelector((state) => selectFeedingLogsForStation(state, station._id));
  const detail = useAppSelector(state => selectFeedingStationDetailState(state, station._id));
  const knownInactive = useAppSelector(state => selectStationKnownInactive(state, station._id));
  const presentedStation = detail.data ?? station;
  const detailRetryBlocked = useApiRetryGate(detail.error);
  const summaryRetryBlocked = useApiRetryGate(summaryError);
  const historyRetryBlocked = useApiRetryGate(loadError);
  const submitRetryBlocked = useApiRetryGate(submitError);
  const dialog = useRef<HTMLDialogElement>(null);
  const openingControl = useRef<HTMLElement | null>(null);
  const closing = useRef(false);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState<FeedingPeriod | "">("");
  const [food, setFood] = useState(true);
  const [water, setWater] = useState(false);
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (dialog.current && !dialog.current.open) {
      openingControl.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current.showModal();
    }
    const element = dialog.current;
    return () => { mounted.current = false; element?.close(); };
  }, []);

  const closeDetails = () => {
    if (!mounted.current || closing.current) return;
    closing.current = true;
    // Close before React removes the element so native modal/focus cleanup runs.
    dialog.current?.close();
    if (openingControl.current?.isConnected) openingControl.current.focus({ preventScroll: true });
    onClose();
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    dispatch(fetchFeedingStationDetail(station._id));
    dispatch(fetchFeedingSummaryForStation(station._id));
    dispatch(fetchFeedingLogsForStation(station._id));
  }, [dispatch, station._id, isLoggedIn]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isLoggedIn || selectStationKnownInactive(store.getState(), station._id) || !presentedStation.active || !presentedStation.permissions.canFeed || submitting || submitRetryBlocked) return;
    const session = instanceSession.current;
    if (!mounted.current || !isSessionCurrent(store.getState(), session)) return;
    setSuccess(false);
    const result = await dispatch(createFeedingLog({
      stationId: station._id,
      data: { period: period || undefined, food, water, note: note.trim() || undefined },
    }));
    if (mounted.current && isSessionCurrent(store.getState(), session) && createFeedingLog.fulfilled.match(result)) {
      setSuccess(true);
      setShowForm(false);
      setPeriod("");
      setFood(true);
      setWater(false);
      setNote("");
    }
  };

  if (!isLoggedIn) return null;
  return (
    <dialog
      ref={dialog}
      className="station-details"
      aria-labelledby="station-details-title"
      onCancel={(event) => { event.preventDefault(); closeDetails(); }}
      onClose={(event) => {
        // StrictMode can reopen the dialog before cleanup's queued close event.
        // Only a currently closed dialog represents a native dismissal.
        if (!event.currentTarget.open) closeDetails();
      }}
    >
      <header className="station-details-header">
        <div>
          <small>{t("stations.singular")}</small>
          <h2 id="station-details-title" dir="auto">{presentedStation.name}</h2>
        </div>
        <button type="button" className="btn" onClick={closeDetails} aria-label={t("stations.closeDetails")}>{t("stations.close")}</button>
      </header>
      <div className="station-details-body">
        {detail.loading && <p role="status">{t("stations.loading")}</p>}
        {detail.error && <div role="alert"><p>{localizeError(detail.error, "station")}</p><button className="btn" type="button" disabled={detailRetryBlocked} onClick={() => dispatch(fetchFeedingStationDetail(station._id))}>{t("feeding.retry")}</button></div>}
        {detail.data?.image && <StationMediaImage className="station-details-image" src={detail.data.image} alt={presentedStation.name} />}
        <p className="station-details-counts">
          <span>{t("stations.catsCount", { number: formatNumber(station.estimatedCats) })}</span>
          <span>{t("stations.kittensCount", { number: formatNumber(station.estimatedKittens) })}</span>
        </p>
        {detail.data?.notes && <p className="station-details-note" dir="auto">{detail.data.notes}</p>}
        <section aria-labelledby="feeding-summary-title">
          <h3 id="feeding-summary-title">{t("feeding.summary")}</h3>
          <p>{t("feeding.summaryMeaning")}</p>
          {summaryLoading && <p role="status">{t("feeding.summaryLoading")}</p>}
          {summaryError && <div role="alert"><p>{localizeError(summaryError, "feeding")}</p><button className="btn" type="button" disabled={summaryRetryBlocked} onClick={() => dispatch(fetchFeedingSummaryForStation(station._id))}>{t("feeding.retry")}</button></div>}
          {summary && <FeedingCoordinationSummary summary={summary} />}
        </section>

        {success && <p className="station-details-success" role="status">{t("feeding.recorded")}</p>}
        {knownInactive || !presentedStation.active || !presentedStation.permissions.canFeed ? <p>{t("feeding.inactive")}</p> : !showForm ? (
          <button className="btn btn-brand" type="button" disabled={submitting} onClick={() => { setSuccess(false); setShowForm(true); }}>
            {t(submitting ? "feeding.saving" : "feeding.fedHere")}
          </button>
        ) : (
          <form className="station-feeding-form" onSubmit={submit} aria-label={t("feeding.record")} noValidate>
            <fieldset disabled={submitting || submitRetryBlocked}>
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
          <h3 id="feeding-history-title">{t("feeding.ownHistory")}</h3>
          <p>{t("feeding.ownHistoryPrivacy")}</p>
          {loading && <p role="status">{t("feeding.loading")}</p>}
          {loadError && <div role="alert"><p>{localizeError(loadError, "feeding")}</p><button className="btn" type="button" disabled={historyRetryBlocked} onClick={() => dispatch(fetchFeedingLogsForStation(station._id))}>{t("feeding.retry")}</button></div>}
          {!loading && !loadError && logs.length === 0 && <p>{t("feeding.ownNoRecords")}</p>}
          <ul>
            {logs.map((log) => (
              <li key={log._id}>
                <time dateTime={log.fedAt}>{formatDateTime(log.fedAt)}</time>
                {log.period && <span className="station-feeding-period">{periodLabel(log.period)}</span>}
                <p>{t(log.food ? (log.water ? "feeding.foodAndWater" : "feeding.foodOnly") : (log.water ? "feeding.waterOnly" : "feeding.neitherRecorded"))}</p>
                {log.note && <p className="station-details-note" dir="auto">{log.note}</p>}
              </li>
            ))}
          </ul>
          {nextCursor && <button className="btn" type="button" disabled={loading || historyRetryBlocked} onClick={() => dispatch(fetchFeedingLogsForStation({ stationId: station._id, append: true }))}>{t("feeding.loadMore")}</button>}
        </section>
      </div>
    </dialog>
  );
}
