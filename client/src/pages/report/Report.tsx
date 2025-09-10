// Report.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectToken } from "../../features/auth/authSelectors";
import { createReport } from "../../features/reports/reportsThunks";
import ReportForm from "../../components/reportForm/ReportForm";
import { type ReportType } from "../../features/reports/reportsSlice";
import { uploadMedia } from "../../api/upload";
import "./Report.css";

type LatLng = { lat: number; lng: number };

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Failed to create report.";
}

const Report = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectToken) ?? null;

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [type, setType] = useState<ReportType>("general");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUseLocation = useCallback(() => {
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
      },
      (err) =>
        setError(
          err.message || "Could not fetch location (permission denied?)"
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
    setWatchId(id);
  }, []);

  useEffect(() => {
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [watchId]);

  // Async worker that does the real submit
  const submitReport = useCallback(async () => {
    setError(null);

    if (!description.trim()) {
      setError("Please describe the situation.");
      return;
    }
    if (!location) {
      setError("Please add location before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const mediaUrls = mediaFiles.length ? await uploadMedia(mediaFiles) : [];
      console.log("createReport token →", token);
      await dispatch(
        createReport({ description, location, type, media: mediaUrls, token })
      ).unwrap();
      navigate("/map-page");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [description, location, type, mediaFiles, token, dispatch, navigate]);

  // React expects a void-returning event handler
  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void submitReport(); // fire and forget the async work
  };

  return (
    <div className="report-page">
      <section className="panel report-panel">
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
        <div className="report-status">
          {submitting && <span className="status-text">Uploading…</span>}
          {error && <span className="status-text error">{error}</span>}
        </div>
      </section>
    </div>
  );
};

export default Report;
