import { useEffect, useRef } from "react";
import { useStore } from "react-redux";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import type { RootState } from "../../app/store";
import { useApiRetryGate } from "../../api/useApiRetryGate";
import { selectIsLoggedIn } from "../../features/auth/authSelectors";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import { selectFeedingLogsForStation } from "../../features/feedingLogs/feedingLogsSelectors";
import { fetchFeedingSummaryForStation } from "../../features/feedingLogs/feedingLogsThunks";
import { selectStationKnownInactive } from "../../features/feedingStations/feedingStationsSelectors";
import type { FeedingStation } from "../../features/feedingStations/types";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import { formatNumber } from "../../i18n/formatters";
import FeedingCoordinationSummary from "../feedingStationDetails/FeedingCoordinationSummary";

/** Only the selected station's approved coarse summary is requested here. */
export default function StationSelectionSummary({ station }: { station: FeedingStation }) {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const session = useRef(captureSession(store.getState()));
  const mounted = useRef(true);
  const isLoggedIn = useAppSelector(selectIsLoggedIn);
  const knownInactive = useAppSelector(state => selectStationKnownInactive(state, station._id));
  const { summary, summaryLoading, summaryError } = useAppSelector(state => selectFeedingLogsForStation(state, station._id));
  const retryBlocked = useApiRetryGate(summaryError);
  const current = () => mounted.current && isSessionCurrent(store.getState(), session.current);

  useEffect(() => {
    mounted.current = true;
    if (isLoggedIn && isSessionCurrent(store.getState(), session.current)) {
      // Read current state so StrictMode replay does not duplicate a request or
      // turn a previous failure into an automatic retry on reselection.
      const latest = selectFeedingLogsForStation(store.getState(), station._id);
      if (!latest.summary && !latest.summaryLoading && !latest.summaryError) {
        dispatch(fetchFeedingSummaryForStation(station._id));
      }
    }
    return () => { mounted.current = false; };
  }, [dispatch, isLoggedIn, station._id, store]);

  if (!isLoggedIn || !isSessionCurrent(store.getState(), session.current)) return null;
  return <div className="map-selection-station">
    <p>{t(knownInactive || !station.active ? "map.inactiveStation" : "map.activeStation")}</p>
    <p className="station-details-counts">
      {Number.isFinite(station.estimatedCats) && <span>{t("stations.catsCount", { number: formatNumber(station.estimatedCats) })}</span>}
      {Number.isFinite(station.estimatedKittens) && <span>{t("stations.kittensCount", { number: formatNumber(station.estimatedKittens) })}</span>}
    </p>
    <p>{t("feeding.summaryMeaning")}</p>
    {summaryLoading && <p role="status">{t("feeding.summaryLoading")}</p>}
    {summaryError && <div role="alert">
      <p>{localizeError(summaryError, "feeding")}</p>
      <button type="button" className="btn" disabled={retryBlocked} onClick={() => {
        if (!current() || retryBlocked || selectFeedingLogsForStation(store.getState(), station._id).summaryError !== summaryError) return;
        dispatch(fetchFeedingSummaryForStation(station._id));
      }}>{t("feeding.retry")}</button>
    </div>}
    {summary && <FeedingCoordinationSummary summary={summary} />}
  </div>;
}
