import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { useAppDispatch } from "../../app/hooks";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { fetchFeedingStations } from "../../features/feedingStations/feedingStationsThunks";
import {
  selectAllFeedingStations,
  selectFeedingStationsLoading,
  selectFeedingStationsError,
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
import { selectToken } from "../../features/auth/authSelectors";
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
import { reportTypeLabel, statusLabel } from "../../i18n/formatters";
import "./MapPage.css";

type LegendKey = TypeKey | StatusKey;

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
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || stations.length === 0) return;
    map.fitBounds(stations.map((station) => [station.location.lat, station.location.lng]), {
      padding: [24, 24],
      maxZoom: 13,
    });
    fitted.current = true;
  }, [map, stations]);

  return null;
}

export default function MapPage() {
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports) as Report[];
  const stations = useSelector(selectAllFeedingStations);
  const stationsLoading = useSelector(selectFeedingStationsLoading);
  const stationsError = useSelector(selectFeedingStationsError);
  const [selectedStation, setSelectedStation] = useState<FeedingStation | null>(null);
  const token = (useSelector(selectToken) ?? null) as string | null;
  const [creationMode, setCreationMode] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [creationLocation, setCreationLocation] = useState<FeedingStation["location"] | null>(null);
  const [createdStation, setCreatedStation] = useState<FeedingStation | null>(null);
  const [reportsError, setReportsError] = useState("");
  const [reportsLoading, setReportsLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadReports = useCallback(async () => {
    setReportsError("");
    setReportsLoading(true);
    try { await dispatch(fetchReports()).unwrap(); }
    catch (error) { setReportsError(localizeError(error, "report")); }
    finally { setReportsLoading(false); }
  }, [dispatch]);

  const cancelCreation = () => {
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
    dispatch(fetchFeedingStations());
    void loadReports();
  }, [dispatch, loadReports]);

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

  const defaultCenter = { lat: 32.0853, lng: 34.7818 };
  const centerSource = filteredReports.length ? filteredReports : reports;
  const center = stations[0]?.location ?? (
    centerSource.length > 0
      ? centerSource[centerSource.length - 1].location
      : defaultCenter);

  const onPrimary = async (id: string, status: StatusKey) => {
    if (!token) return;
    setActionError("");
    try {
      if (status === "new") await dispatch(claimReport({ reportId: id })).unwrap();
      else if (status === "in-progress") await dispatch(resolveReport({ reportId: id })).unwrap();
    } catch (error) { setActionError(localizeError(error, "report")); }
  };

  return (
    <div className="map-layout">
      <aside className="panel side-left">
        <div className="feeding-stations-summary">
          <div className="section-title">{t("map.stations")}</div>
          <p>{t("map.stationMarkers")}</p>
          {stationsLoading && <p role="status">{t("map.loadingStations")}</p>}
          {stationsError && (
            <div role="alert">
              <p>{localizeError(stationsError, "station")}</p>
              <button type="button" onClick={() => dispatch(fetchFeedingStations())}>{t("map.retry")}</button>
            </div>
          )}
          {!stationsLoading && !stationsError && (
            <p role="status">{t("map.stationCount", { count: stations.length })}</p>
          )}
        </div>
        <div className="section-title">{t("map.reportFilters")}</div>

        <div className="filters" style={{ marginBottom: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("emergency")}
              onChange={onTypeChange("emergency")}
            />{" "}
            {reportTypeLabel("emergency")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("food")}
              onChange={onTypeChange("food")}
            />{" "}
            {reportTypeLabel("food")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("general")}
              onChange={onTypeChange("general")}
            />{" "}
            {reportTypeLabel("general")}
          </label>
        </div>

        <div className="legend-title" style={{ marginTop: 6 }}>
          {t("map.status")}
        </div>
        <div className="filters">
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("new")}
              onChange={onStatusChange("new")}
            />{" "}
            {statusLabel("new")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("in-progress")}
              onChange={onStatusChange("in-progress")}
            />{" "}
            {statusLabel("in-progress")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("resolved")}
              onChange={onStatusChange("resolved")}
            />{" "}
            {statusLabel("resolved")}
          </label>
        </div>

        <div className="legend-wrap">
          <Legend counts={counts} />
        </div>
      </aside>

      <section className="panel map-center">
        <div className="station-map-toolbar">
          {creationMode && token ? (
            <><p role="status">{t(pickingLocation ? "map.chooseStationLocation" : "map.stationLocationSelected")}</p>
              <button className="btn" type="button" onClick={cancelCreation}>{t("map.cancelCreation")}</button></>
          ) : token ? (
            <button className="btn btn-brand" type="button" onClick={() => {
              dispatch(clearStationCreateError());
              setCreatedStation(null);
              setCreationMode(true);
              setPickingLocation(true);
            }}>{t("map.addStation")}</button>
          ) : <div><p>{t("map.stationSignInRequired")}</p><div className="station-auth-links"><Link to="/login">{t("map.login")}</Link><Link to="/register">{t("map.register")}</Link></div></div>}
          {createdStation && <p role="status">{t("map.createdStation")} <bdi>{createdStation.name}</bdi> <button className="btn" type="button" onClick={() => setSelectedStation(createdStation)}>{t("map.viewStation")}</button></p>}
        </div>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          zoomControl={false}
          scrollWheelZoom
          className="leaflet-root"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <StationViewport stations={stations} />
          <LocalizedMapControls />
          {creationMode && token && <StationLocationPicker enabled={pickingLocation} location={creationLocation} onSelect={(location) => {
            setCreationLocation(location);
            setPickingLocation(false);
          }} />}
          {stations.map((station) => (
            <FeedingStationMarker key={station._id} station={station} onSelect={setSelectedStation} />
          ))}
          {filteredReports.map((report) => (
            <ReportMarker key={report._id} report={report} />
          ))}
        </MapContainer>
      </section>

      <aside className="panel side-right">
        <div className="list-header">
          <span>{t("map.reports")}</span>
        </div>
        {reportsLoading && <p role="status">{t("map.loadingReports")}</p>}
        {reportsError && <div role="alert"><p>{reportsError}</p><button type="button" onClick={() => void loadReports()}>{t("map.retry")}</button></div>}
        {actionError && <p role="alert">{actionError}</p>}
        {!reportsLoading && !reportsError && !filteredReports.length && <p>{t("map.noReports")}</p>}
        <div className="report-list">
          {filteredReports.map((r) => (
            <ReportCard key={r._id} report={r} onPrimary={onPrimary} />
          ))}
        </div>
      </aside>
      {selectedStation && (
        <FeedingStationDetails key={selectedStation._id} station={selectedStation} onClose={() => setSelectedStation(null)} />
      )}
      {creationMode && token && <CreateFeedingStation open={!pickingLocation} location={creationLocation}
        onCancel={cancelCreation} onChangeLocation={() => setPickingLocation(true)} onCreated={(station) => {
          cancelCreation();
          setCreatedStation(station);
        }} />}
    </div>
  );
}
