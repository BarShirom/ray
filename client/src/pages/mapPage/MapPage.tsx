import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSelector, useStore } from "react-redux";
import { Link } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { fetchFeedingStations } from "../../features/feedingStations/feedingStationsThunks";
import {
  selectAllFeedingStations,
  selectFeedingStationsLoading,
  selectFeedingStationsError,
  selectStationAuthorizationRevision,
} from "../../features/feedingStations/feedingStationsSelectors";
import type { FeedingStation } from "../../features/feedingStations/types";
import FeedingStationMarker from "../../components/feedingStationMarker/FeedingStationMarker";
import FeedingStationDetails from "../../components/feedingStationDetails/FeedingStationDetails";
import CreateFeedingStation from "../../components/createFeedingStation/CreateFeedingStation";
import StationLocationPicker from "../../components/createFeedingStation/StationLocationPicker";
import { clearStationCreateError } from "../../features/feedingStations/feedingStationsSlice";
import {
  fetchReports,
  claimReport,
  resolveReport,
} from "../../features/reports/reportsThunks";
import { selectAllReports } from "../../features/reports/reportsSelectors";
import { selectToken, selectSessionId, selectUserId, selectAuthLoading } from "../../features/auth/authSelectors";
import type { RootState } from "../../app/store";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import { useApiRetryGate } from "../../api/useApiRetryGate";
import ReportMarker from "../../components/reportMarker/ReportMarker";
import ReportCard from "../../components/reportCard/ReportCard";
import LocalizedMapControls from "../../components/mapPreview/LocalizedMapControls";
import Legend from "../../components/legend/Legend";
import type {
  Report,
  ReportType as TypeKey,
  ReportStatus as StatusKey,
} from "../../features/reports/reportsSlice";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import { formatNumber, reportTypeLabel, statusLabel } from "../../i18n/formatters";
import { DEFAULT_STATION_VIEW, stationViewport } from "./stationViewport";
import "./MapPage.css";

type LegendKey = TypeKey | StatusKey;
type MapScope = "all" | "reports" | "stations";

const ALL_TYPES: TypeKey[] = ["emergency", "food", "general"];
const ALL_STATUSES: StatusKey[] = ["new", "in-progress", "resolved"];

const normStatus = (s: StatusKey | string): StatusKey => {
  const k = String(s ?? "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return (
    k === "new" || k === "in-progress" || k === "resolved" ? k : "new"
  ) as StatusKey;
};

function StationViewport({ stations }: { stations: FeedingStation[] }) {
  const map = useMap();
  const viewport = useRef<ReturnType<typeof stationViewport> | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", t("map.mapSurface"));
    const current = stationViewport(map);
    viewport.current = current;
    return () => { current.dispose(); viewport.current = null; };
  }, [map]);
  useEffect(() => { viewport.current?.fit(stations); }, [stations]);

  return null;
}

export default function MapPage() {
  const sessionId = useSelector(selectSessionId);
  const actorId = useSelector(selectUserId);
  const authLoading = useSelector(selectAuthLoading);
  const authorizationRevision = useSelector(selectStationAuthorizationRevision);
  // Remount Leaflet itself, not just markers: its camera, bounds, fit ref,
  // picker, popups and native dialogs all belong to this authorization epoch.
  return <SessionMap key={`${sessionId}:${actorId ?? "guest"}:${authLoading ? "pending" : "ready"}:${authorizationRevision}`} />;
}

function SessionMap() {
  const store = useStore<RootState>();
  const instanceSession = useRef(captureSession(store.getState()));
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports) as Report[];
  const stations = useSelector(selectAllFeedingStations);
  const stationsLoading = useSelector(selectFeedingStationsLoading);
  const stationsError = useSelector(selectFeedingStationsError);
  const retryBlocked = useApiRetryGate(stationsError);
  const [selectedStation, setSelectedStation] = useState<FeedingStation | null>(null);
  const token = (useSelector(selectToken) ?? null) as string | null;
  const [creationMode, setCreationMode] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [creationLocation, setCreationLocation] = useState<FeedingStation["location"] | null>(null);
  const [createdStation, setCreatedStation] = useState<FeedingStation | null>(null);
  const creationOpener = useRef<HTMLButtonElement | null>(null);
  const pickerControl = useRef<HTMLButtonElement | null>(null);
  const creationActive = useRef(false);
  const returnCreationFocus = useRef(false);
  const [reportsError, setReportsError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [scope, setScope] = useState<MapScope>("all");
  const [stationActivity, setStationActivity] = useState({ active: true, inactive: true });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useLayoutEffect(() => {
    const current = mounted.current && isSessionCurrent(store.getState(), instanceSession.current);
    if (!current) {
      returnCreationFocus.current = false;
      creationOpener.current = null;
      return;
    }
    if (creationMode && pickingLocation) {
      pickerControl.current?.focus();
    } else if (!creationMode && returnCreationFocus.current) {
      // React has now re-enabled the surviving trigger. No queued work may
      // restore a previous account's opener or focus a detached control.
      returnCreationFocus.current = false;
      const opener = creationOpener.current;
      creationOpener.current = null;
      if (opener?.isConnected && !opener.disabled) opener.focus();
    }
  }, [creationMode, pickingLocation, store]);

  const loadReports = useCallback(async () => {
    // The first StrictMode effect owns the existing request and its callbacks.
    // A deduplicated dispatch must not become a visible ConditionError.
    if (store.getState().reports.publicRequestId) return;
    setReportsError("");
    setReportsLoading(true);
    try { await dispatch(fetchReports()).unwrap(); }
    catch (error) { if (mounted.current) setReportsError(localizeError(error, "report")); }
    finally { if (mounted.current) setReportsLoading(false); }
  }, [dispatch, store]);

  const cancelCreation = () => {
    if (!creationActive.current || !mounted.current || !isSessionCurrent(store.getState(), instanceSession.current)) return;
    creationActive.current = false;
    returnCreationFocus.current = true;
    setCreationMode(false);
    setPickingLocation(false);
    setCreationLocation(null);
    dispatch(clearStationCreateError());
  };

  const [activeTypes, setActiveTypes] = useState<Set<TypeKey>>(
    () => new Set(ALL_TYPES)
  );
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusKey>>(
    () => new Set(ALL_STATUSES)
  );

  useEffect(() => {
    if (token) dispatch(fetchFeedingStations());
    void loadReports();
  }, [dispatch, loadReports, token]);

  const onTypeChange = useCallback(
    (t: TypeKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setActiveTypes((prev) => {
        const next = new Set<TypeKey>(prev);
        if (e.target.checked) next.add(t);
        else next.delete(t);
        return next;
      });
    },
    []
  );

  const onStatusChange = useCallback(
    (s: StatusKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setActiveStatuses((prev) => {
        const next = new Set<StatusKey>(prev);
        if (e.target.checked) next.add(s);
        else next.delete(s);
        return next;
      });
    },
    []
  );

  const counts = useMemo(() => {
    const c: Partial<Record<LegendKey, number>> = {};
    for (const r of reports) {
      c[r.type] = (c[r.type] ?? 0) + 1;
      const st: StatusKey = normStatus(r.status);
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [reports]);

  const filteredReports = useMemo(
    () =>
      reports.filter(
        (r) =>
          activeTypes.has(r.type) && activeStatuses.has(normStatus(r.status))
      ),
    [reports, activeTypes, activeStatuses]
  );

  const visibleReports = scope === "stations" ? [] : filteredReports;
  const visibleStations = token && scope !== "reports"
    ? stations.filter(station => station.active ? stationActivity.active : stationActivity.inactive)
    : [];
  const visibleLoading = (scope !== "stations" && reportsLoading) || (token && scope !== "reports" && stationsLoading);
  const visibleError = (scope !== "stations" && reportsError) || (token && scope !== "reports" && stationsError);
  // Alternate domains in the list so a long collection cannot bury the other
  // domain. Order within each API collection is preserved; no distance inferred.
  const results: ({ kind: "report"; report: Report } | { kind: "station"; station: FeedingStation })[] = [];
  for (let index = 0; index < Math.max(visibleReports.length, visibleStations.length); index++) {
    if (visibleReports[index]) results.push({ kind: "report", report: visibleReports[index] });
    if (visibleStations[index]) results.push({ kind: "station", station: visibleStations[index] });
  }


  const onPrimary = async (id: string, status: StatusKey) => {
    const session = instanceSession.current;
    if (!token || !mounted.current || !isSessionCurrent(store.getState(), session)) return;
    setActionError("");
    try {
      if (status === "new") await dispatch(claimReport({ reportId: id })).unwrap();
      else if (status === "in-progress") await dispatch(resolveReport({ reportId: id })).unwrap();
    } catch (error) { if (mounted.current && session && isSessionCurrent(store.getState(), session)) setActionError(localizeError(error, "report")); }
  };

  return (
    <div className="map-layout" dir="rtl" onKeyDownCapture={event => {
      // Native form/details dialogs own their Escape handling. Capture picker
      // Escape before Leaflet's keyboard listener can consume it.
      if (event.key === "Escape" && creationMode && pickingLocation && !selectedStation) {
        event.preventDefault();
        event.stopPropagation();
        cancelCreation();
      }
    }}>
      <header className="map-shell-header">
        <div className="map-heading-row">
          <h1>{t("map.title")}</h1>
          <div className="map-navigation-links">
            <a className="btn" href="#map-support">{t("map.filtersAndLegend")}</a>
            <a className="btn map-list-link" href="#map-results">{t("map.listAlternative")}</a>
          </div>
        </div>
        <div className="map-domain-controls" role="group" aria-label={t("map.scopeLabel")}>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>{t("map.scopeAll")}</button>
          <button type="button" aria-pressed={scope === "reports"} onClick={() => setScope("reports")}>{t("map.scopeReports")}</button>
          <button type="button" aria-pressed={scope === "stations"} onClick={() => setScope("stations")}>{t("map.scopeStations")}</button>
        </div>
        <div className="map-care-actions">
          <Link className="btn btn-brand" to="/">{t("shell.newReport")}</Link>
          {token ? <button className="btn btn-brand" type="button" disabled={creationMode} onClick={event => {
            if (creationActive.current || !mounted.current || !isSessionCurrent(store.getState(), instanceSession.current)) return;
            creationOpener.current = event.currentTarget;
            returnCreationFocus.current = false;
            creationActive.current = true;
            dispatch(clearStationCreateError());
            setCreatedStation(null);
            setCreationMode(true);
            setPickingLocation(true);
          }}>{t("map.addStation")}</button> : <Link className="btn btn-brand" to="/login">{t("map.stationCareSignIn")}</Link>}
        </div>
      </header>

      <section className="map-center" aria-labelledby="community-map-title" id="community-map">
        <h2 className="map-section-heading" id="community-map-title" tabIndex={-1}>{t("map.mapSurface")}</h2>
        <div className="station-map-toolbar">
          {creationMode && token && <><p role="status">{t(pickingLocation ? "map.chooseStationLocation" : "map.stationLocationSelected")}</p>
            <button className="btn" type="button" onClick={cancelCreation}>{t("map.cancelCreation")}</button></>}
          {createdStation && <p role="status">{t("map.createdStation")} <bdi>{createdStation.name}</bdi> <button className="btn" type="button" onClick={() => setSelectedStation(createdStation)}>{t("map.viewStation")}</button></p>}
        </div>
        <MapContainer
          center={DEFAULT_STATION_VIEW.center}
          zoom={DEFAULT_STATION_VIEW.zoom}
          zoomControl={false}
          scrollWheelZoom
          className="leaflet-root"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <StationViewport stations={visibleStations} />
          <LocalizedMapControls />
          {creationMode && token && <StationLocationPicker enabled={pickingLocation} location={creationLocation} selectionButtonRef={pickerControl} onSelect={(location) => {
            if (!creationActive.current || !mounted.current || !isSessionCurrent(store.getState(), instanceSession.current)) return;
            setCreationLocation(location);
            setPickingLocation(false);
          }} />}
          {visibleStations.map(station => <FeedingStationMarker key={station._id} station={station} onSelect={setSelectedStation} />)}
          {visibleReports.map(report => <ReportMarker key={report._id} report={report} />)}
        </MapContainer>
      </section>

      <aside className="map-sidebar">
        <div className="map-support" id="map-support" tabIndex={-1}>
          <details className="map-filter-panel">
            <summary>{t("map.filtersAndLegend")}</summary>
            <div className="map-filter-groups">
              <fieldset>
                <legend>{t("map.reportFilters")}</legend>
                <div className="map-filter-options">
                  {ALL_TYPES.map(type => <label key={type}><input type="checkbox" checked={activeTypes.has(type)} onChange={onTypeChange(type)} />{reportTypeLabel(type)}</label>)}
                </div>
              </fieldset>
              <fieldset>
                <legend>{t("map.status")}</legend>
                <div className="map-filter-options">
                  {ALL_STATUSES.map(status => <label key={status}><input type="checkbox" checked={activeStatuses.has(status)} onChange={onStatusChange(status)} />{statusLabel(status)}</label>)}
                </div>
              </fieldset>
              <fieldset disabled={!token}>
                <legend>{t("map.stationActivity")}</legend>
                <div className="map-filter-options">
                  <label><input type="checkbox" checked={stationActivity.active} onChange={event => setStationActivity(previous => ({ ...previous, active: event.target.checked }))} />{t("map.activeStations")}</label>
                  <label><input type="checkbox" checked={stationActivity.inactive} onChange={event => setStationActivity(previous => ({ ...previous, inactive: event.target.checked }))} />{t("map.inactiveStations")}</label>
                </div>
              </fieldset>
            </div>
            <Legend counts={counts} compact />
          </details>
          <p className="map-result-status" role="status" aria-atomic="true">
            {t("map.visibleReports", { count: visibleReports.length })}
            {token && <>, {t("map.visibleStations", { count: visibleStations.length })}</>}
          </p>
          {!token && scope !== "reports" && <div className="map-access-notice">
            <p>{t("map.stationSignInRequired")}</p>
            <div className="station-auth-links"><Link to="/login">{t("map.login")}</Link><Link to="/register">{t("map.register")}</Link></div>
          </div>}
          <div className="map-data-status">
            {scope !== "stations" && reportsLoading && <p role="status">{t("map.loadingReports")}</p>}
            {scope !== "stations" && reportsError && <div role="alert"><p>{reportsError}</p><button className="btn" type="button" onClick={() => void loadReports()}>{t("map.retry")}</button></div>}
            {token && scope !== "reports" && stationsLoading && <p role="status">{t("map.loadingStations")}</p>}
            {token && scope !== "reports" && stationsError && <div role="alert"><p>{localizeError(stationsError, "station")}</p><button className="btn" type="button" disabled={retryBlocked} onClick={() => dispatch(fetchFeedingStations())}>{t("map.retry")}</button></div>}
            {actionError && <p role="alert">{actionError}</p>}
          </div>
        </div>
        <section className="map-results" id="map-results" aria-labelledby="map-results-title" tabIndex={-1}>
          <div className="map-heading-row">
            <h2 id="map-results-title">{t("map.listTitle")}</h2>
            <a className="btn" href="#community-map-title">{t("map.returnToMap")}</a>
          </div>
          {!results.length && !visibleLoading && !visibleError && (token || scope !== "stations") && <p>{t("map.noResults")}</p>}
          <ul className="map-result-list" aria-label={t("map.listTitle")}>
            {results.map(result => result.kind === "report" ? <li key={`report:${result.report._id}`} data-report-id={result.report._id}>
              <span className="map-result-kind">{t("map.scopeReports")}</span>
              <ReportCard report={result.report} onPrimary={onPrimary} />
            </li> : <li key={`station:${result.station._id}`} data-station-id={result.station._id}>
              <span className="map-result-kind">{t("map.scopeStations")}</span>
              <article className="map-station-card">
                <h3 dir="auto">{result.station.name}</h3>
                <p className="map-station-activity">{t(result.station.active ? "map.activeStation" : "map.inactiveStation")}</p>
                <p>{t("stations.catsCount", { number: formatNumber(result.station.estimatedCats) })}<br />{t("stations.kittensCount", { number: formatNumber(result.station.estimatedKittens) })}</p>
                <button className="btn" type="button" aria-label={t("map.stationDetails", { name: result.station.name })} onClick={event => {
                  event.currentTarget.focus({ preventScroll: true });
                  setSelectedStation(result.station);
                }}>{t("stations.details")}</button>
              </article>
            </li>)}
          </ul>
        </section>
      </aside>
      {token && selectedStation && (
        <FeedingStationDetails key={selectedStation._id} station={selectedStation} onClose={() => setSelectedStation(null)} />
      )}
      {creationMode && token && <CreateFeedingStation open={!pickingLocation} location={creationLocation}
        onCancel={cancelCreation} onChangeLocation={() => {
          if (creationActive.current && mounted.current && isSessionCurrent(store.getState(), instanceSession.current)) setPickingLocation(true);
        }} onCreated={(station) => {
          cancelCreation();
          setCreatedStation(station);
        }} />}
    </div>
  );
}
