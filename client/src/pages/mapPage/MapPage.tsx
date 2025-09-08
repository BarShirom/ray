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
import type {
  Report,
  ReportType as TypeKey,
  ReportStatus as StatusKey,
} from "../../features/reports/reportsSlice";
import "./MapPage.css";

type LegendKey = TypeKey | StatusKey;

const ALL_TYPES: TypeKey[] = ["emergency", "food", "general"];
const ALL_STATUSES: StatusKey[] = ["new", "in-progress", "resolved"];

// Normalize server variants: "in progress", "in_progress" -> "in-progress"
const normStatus = (s: StatusKey | string): StatusKey => {
  const k = String(s ?? "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  return (
    k === "new" || k === "in-progress" || k === "resolved" ? k : "new"
  ) as StatusKey;
};

export default function MapPage() {
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports) as Report[];
  const token = (useSelector(selectToken) ?? null) as string | null;

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

  // legend counts
  const counts = useMemo(() => {
    const c: Partial<Record<LegendKey, number>> = {};
    for (const r of reports) {
      c[r.type] = (c[r.type] ?? 0) + 1;
      const st: StatusKey = normStatus(r.status);
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [reports]);

  // filtered list (types + statuses)
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
  const center =
    centerSource.length > 0
      ? centerSource[centerSource.length - 1].location
      : defaultCenter;

  const onPrimary = (id: string, status: StatusKey) => {
    if (!token) return;
    if (status === "new") {
      dispatch(claimReport({ reportId: id, token }));
    } else if (status === "in-progress") {
      dispatch(resolveReport({ reportId: id, token }));
    }
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

        {/* Status filters */}
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
