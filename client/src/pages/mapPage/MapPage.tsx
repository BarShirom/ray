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
import Legend from "../../components/legend/Legend";
import type {
  Report,
  ReportType as TypeKey,
  ReportStatus as StatusKey,
} from "../../features/reports/reportsSlice";
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
    dispatch(fetchReports());
  }, [dispatch]);

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

  const onPrimary = (id: string, status: StatusKey) => {
    if (!token) return;
    if (status === "new") {
      dispatch(claimReport({ reportId: id }));
    } else if (status === "in-progress") {
      dispatch(resolveReport({ reportId: id }));
    }
  };

  return (
    <div className="map-layout">
      <aside className="panel side-left">
        <div className="feeding-stations-summary">
          <div className="section-title">Feeding stations</div>
          <p>Purple cat markers show community-cat feeding stations.</p>
          {stationsLoading && <p role="status">Loading feeding stations...</p>}
          {stationsError && (
            <div role="alert">
              <p>Could not load feeding stations: {stationsError}</p>
              <button type="button" onClick={() => dispatch(fetchFeedingStations())}>Retry</button>
            </div>
          )}
          {!stationsLoading && !stationsError && (
            <p role="status">{stations.length ? `${stations.length} feeding stations on the map` : "No feeding stations yet."}</p>
          )}
        </div>
        <div className="section-title">Report filters</div>

        <div className="filters" style={{ marginBottom: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("emergency")}
              onChange={onTypeChange("emergency")}
            />{" "}
            Emergency
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("food")}
              onChange={onTypeChange("food")}
            />{" "}
            Food
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeTypes.has("general")}
              onChange={onTypeChange("general")}
            />{" "}
            General
          </label>
        </div>

        <div className="legend-title" style={{ marginTop: 6 }}>
          Status
        </div>
        <div className="filters">
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("new")}
              onChange={onStatusChange("new")}
            />{" "}
            New
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("in-progress")}
              onChange={onStatusChange("in-progress")}
            />{" "}
            In progress
          </label>
          <label>
            <input
              type="checkbox"
              checked={activeStatuses.has("resolved")}
              onChange={onStatusChange("resolved")}
            />{" "}
            Resolved
          </label>
        </div>

        <div className="legend-wrap">
          <Legend counts={counts} />
        </div>
      </aside>

      <section className="panel map-center">
        <div className="station-map-toolbar">
          {creationMode && token ? (
            <><p role="status">{pickingLocation ? "Click or tap a point on the map for your station." : "Station location selected."}</p>
              <button className="btn" type="button" onClick={cancelCreation}>Cancel station creation</button></>
          ) : token ? (
            <button className="btn btn-brand" type="button" onClick={() => {
              dispatch(clearStationCreateError());
              setCreatedStation(null);
              setCreationMode(true);
              setPickingLocation(true);
            }}>Add Feeding Station</button>
          ) : <p><Link to="/login">Log in</Link> or <Link to="/register">sign up</Link> to add a feeding station.</p>}
          {createdStation && <p role="status">Created {createdStation.name}. <button className="btn" type="button" onClick={() => setSelectedStation(createdStation)}>View station</button></p>}
        </div>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom
          className="leaflet-root"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <StationViewport stations={stations} />
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
          <span>Nearby reports</span>
        </div>
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
