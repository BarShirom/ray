// Report.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { createReport } from "../../features/reports/reportsThunks";
import ReportForm from "../../components/reportForm/ReportForm";
import { type ReportType } from "../../features/reports/reportsSlice";
import { isPostgresPreview } from "../../preview";
import { uploadImages, type ImageUploads } from "../../api/media";
import { useMediaCapability } from "../../components/media/Media";
import { selectToken } from "../../features/auth/authSelectors";
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
  const token = useAppSelector(selectToken);
  const mediaEnabled = useMediaCapability();
  const uploads = useRef<ImageUploads>(new WeakMap());
  const locked = useRef(false);
  const [progress, setProgress] = useState("");

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

  const submitReport = useCallback(async () => {
    if (locked.current) return;
    setError(null);

    if (!description.trim()) {
      setError("Please describe the situation.");
      return;
    }
    if (!location) {
      setError("Please add location before submitting.");
      return;
    }

    locked.current = true;
    setSubmitting(true);
    try {
      let attachment: { media?: string[]; mediaAssetIds?: string[] } = {};
      if (isPostgresPreview) {
        if (mediaFiles.length && !mediaEnabled) throw new Error("Image uploads are disabled in local preview.");
        attachment = { mediaAssetIds: mediaFiles.length ? await uploadImages(mediaFiles, "report", token, uploads.current, setProgress) : [] };
      } else {
        const { uploadMedia } = await import("../../api/upload");
        attachment = { media: mediaFiles.length ? await uploadMedia(mediaFiles) : [] };
      }
      await dispatch(
        createReport({ description, location, type, ...attachment })
      ).unwrap();
      navigate("/map-page");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }, [description, location, type, mediaFiles, dispatch, navigate, token, mediaEnabled]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    void submitReport();
  };

  return (
    <div className="report-page">
      <section className="panel report-panel">
        <ReportForm
          pending={submitting}
          mediaEnabled={mediaEnabled}
          signedIn={!!token}
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
          {submitting && <span className="status-text" role="status">{progress || "Saving report..."}</span>}
          {error && <span className="status-text error">{error}</span>}
        </div>
      </section>
    </div>
  );
};

export default Report;
