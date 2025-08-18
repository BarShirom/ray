// src/pages/report/Report.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectToken } from "../../features/auth/authSelectors";
import { createReport } from "../../features/reports/reportsThunks";
import ReportForm from "../../components/reportForm/ReportForm";
import { type ReportType } from "../../features/reports/reportsSlice";
import "./Report.css";

const Report = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectToken) ?? null;

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<null | { lat: number; lng: number }>(
    null
  );
  const [watchId, setWatchId] = useState<number | null>(null);
  const [type, setType] = useState<ReportType>("general");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
      },
      () => alert("Could not fetch location (permission denied?)"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    setWatchId(id);
  };

  useEffect(() => {
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [watchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return alert("Please describe the situation.");
    if (!location) return alert("Please add location before submitting.");

    dispatch(
      createReport({ description, location, type, media: mediaFiles, token })
    );
    navigate("/map-page");
  };

  return (
    <div className="report-page">


      <section className="panel report-panel">
        {/* Your form component; CSS below styles its internals generically */}
        <ReportForm
          description={description}
          setDescription={setDescription}
          handleSubmit={handleSubmit}
          useLocation={handleUseLocation}
          locationReady={!!location}
          location={location}
          setLocation={setLocation}
          type={type}
          setType={setType}
          mediaFiles={mediaFiles}
          setMediaFiles={setMediaFiles}
        />
      </section>
    </div>
  );
};

export default Report;
