import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useAppDispatch } from "../../app/hooks";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./Map.css";

import { fetchReports } from "../../features/reports/reportsThunks";
import { selectAllReports } from "../../features/reports/reportsSelectors";
import ReportMarker from "../../components/reportMarker/ReportMarker";
import MapLegend from "../../components/mapLegend/MapLegend";

const Map = () => {
  const dispatch = useAppDispatch();
  const reports = useSelector(selectAllReports);

  // ✅ Fetch reports from DB on initial load
  useEffect(() => {
    dispatch(fetchReports());
  }, [dispatch]);

  const defaultCenter = { lat: 32.0853, lng: 34.7818 };
  const center =
    reports.length > 0 ? reports[reports.length - 1].location : defaultCenter;

  return (
    <div className="map-container">
      <div className="map-wrapper">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={13}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {reports.map((report) => (
            <ReportMarker key={report._id} report={report} />
          ))}
        </MapContainer>
      </div>

      <MapLegend />
    </div>
  );
};

export default Map;
