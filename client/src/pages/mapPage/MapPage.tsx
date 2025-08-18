import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { MapContainer, TileLayer } from "react-leaflet";
import {
  fetchReports,
  claimReport,
  resolveReport,
} from "../../features/reports/reportsThunks";
import { selectAllReports } from "../../features/reports/reportsSelectors";
import { selectToken } from "../../features/auth/authSelectors"; // <-- add
import ReportMarker from "../../components/reportMarker/ReportMarker";
import ReportCard from "../../components/reportCard/ReportCard";
import Legend from "../../components/legend/Legend";
import "./MapPage.css";

export default function MapPage() {
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports);
  const token = useSelector(selectToken); // <-- add

  useEffect(() => {
    dispatch(fetchReports());
  }, [dispatch]);

  const defaultCenter = { lat: 32.0853, lng: 34.7818 };
  const center =
    reports.length > 0 ? reports[reports.length - 1].location : defaultCenter;

  const onPrimary = (
    id: string,
    status: "new" | "in-progress" | "resolved"
  ) => {
    if (!token) return; // could open login, or toast
    if (status === "new") dispatch(claimReport({ reportId: id, token }));
    else if (status === "in-progress")
      dispatch(resolveReport({ reportId: id, token }));
    // else: navigate to details if you have a details route
  };

  return (
    <div className="map-layout">
      <aside className="panel side-left">
        <div className="section-title">Filters</div>
        <div className="filters">
          <label>
            <input type="checkbox" /> Emergency
          </label>
          <label>
            <input type="checkbox" /> Food
          </label>
          <label>
            <input type="checkbox" /> General
          </label>
        </div>
        <div className="legend-wrap">
          <Legend />
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
          {reports.map((report) => (
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
          {reports.map((r) => (
            <ReportCard key={r._id} report={r} onPrimary={onPrimary} />
          ))}
        </div>
      </aside>
    </div>
  );
}
