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
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import "./Report.css";

type LatLng = { lat: number; lng: number };

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
      setError(t("reports.locationUnavailable"));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
      },
      (err) =>
        setError(
          t(err.code === 1 ? "reports.locationDenied" : "reports.locationFailed")
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
      setError(t("reports.descriptionRequired"));
      return;
    }
    if (!location) {
      setError(t("reports.locationRequired"));
      return;
    }
    if (isPostgresPreview && mediaFiles.length && !mediaEnabled) {
      setError(t("reports.uploadsDisabled"));
      return;
    }

    locked.current = true;
    setSubmitting(true);
    try {
      let attachment: { media?: string[]; mediaAssetIds?: string[] } = {};
      if (isPostgresPreview) {
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
      setError(localizeError(err, "report"));
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
        <h1 className="report-title">{t("reports.title")}</h1>
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
          {submitting && <span className="status-text" role="status">{progress || t("reports.saving")}</span>}
          {error && <span className="status-text error" role="alert">{error}</span>}
        </div>
      </section>
    </div>
  );
};

export default Report;
