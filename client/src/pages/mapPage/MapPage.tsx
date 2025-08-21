// src/pages/mapPage/MapPage.tsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { MapContainer, TileLayer } from "react-leaflet";
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
import "./MapPage.css";

type TypeKey = "emergency" | "food" | "general";
type StatusKey = "in-progress" | "resolved"; // <-- no "new"
type LegendKey = TypeKey | StatusKey | "new"; // keep "new" for counts/legend if you want

const ALL_TYPES: TypeKey[] = ["emergency", "food", "general"];
const ALL_STATUSES: StatusKey[] = ["in-progress", "resolved"]; // <-- only these

export default function MapPage() {
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports);
  const token = useSelector(selectToken) ?? undefined;

  // checkbox-driven filters
  const [activeTypes, setActiveTypes] = useState<Set<TypeKey>>(
    () => new Set(ALL_TYPES)
  );
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusKey>>(
    () => new Set(ALL_STATUSES)
  );

  useEffect(() => {
    dispatch(fetchReports());
  }, [dispatch]);

  // handlers
  const onTypeChange = useCallback(
    (t: TypeKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setActiveTypes((prev) => {
        const next = new Set(prev);
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
        const next = new Set(prev);
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
      const t = r.type as TypeKey;
      c[t] = (c[t] ?? 0) + 1;

      
      if (r.status === "in-progress" || r.status === "resolved") {
        c[r.status] = (c[r.status] ?? 0) + 1;
      } else {
      
        c["new"] = (c["new"] ?? 0) + 1;
      }
    }
    return c;
  }, [reports]);

  // apply both filters (types + only the two statuses)
  const filteredReports = useMemo(
    () =>
      reports.filter(
        (r) =>
          activeTypes.has(r.type as TypeKey) &&
          activeStatuses.has(r.status as StatusKey)
      ),
    [reports, activeTypes, activeStatuses]
  );

  const defaultCenter = { lat: 32.0853, lng: 34.7818 };
  const centerSource = filteredReports.length ? filteredReports : reports;
  const center =
    centerSource.length > 0
      ? centerSource[centerSource.length - 1].location
      : defaultCenter;

  const onPrimary = (
    id: string,
    status: "new" | "in-progress" | "resolved"
  ) => {
    if (!token) return;
    if (status === "new") dispatch(claimReport({ reportId: id, token }));
    else if (status === "in-progress")
      dispatch(resolveReport({ reportId: id, token }));
  };

  return (
    <div className="map-layout">
      <aside className="panel side-left">
        <div className="section-title">Filters</div>

        {/* Type filters */}
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

        {/* Status filters (no "New") */}
        <div className="legend-title" style={{ marginTop: 6 }}>
          Status
        </div>
        <div className="filters">
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
          {filteredReports.map((report) => (
            <ReportMarker key={report._id} report={report} />
          ))}
        </MapContainer>
      </section>

      <aside className="panel side-right">
        <div className="list-header">
          <span>Nearby reports</span>
          <button className="btn" onClick={() => dispatch(fetchReports())}>
            Refresh
          </button>
        </div>
        <div className="report-list">
          {filteredReports.map((r) => (
            <ReportCard key={r._id} report={r} onPrimary={onPrimary} />
          ))}
        </div>
      </aside>
    </div>
  );
}

