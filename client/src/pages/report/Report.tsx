// Report.tsx
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "react-redux";
import type { RootState } from "../../app/store";
import { captureSession, isSessionCurrent } from "../../features/auth/session";
import { isApiFailure, toApiFailure } from "../../api/errors";
import { invalidateSession } from "../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { createReport } from "../../features/reports/reportsThunks";
import ReportForm from "../../components/reportForm/ReportForm";
import { isValidMapLocation, type MapLocation as LatLng } from "../../components/mapPreview/location";
import { type ReportType } from "../../features/reports/reportsSlice";
import { isPostgresPreview } from "../../preview";
import { uploadImages, type ImageUploads } from "../../api/media";
import { useMediaCapability } from "../../components/media/Media";
import { selectToken, selectSessionId, selectUserId, selectAuthLoading } from "../../features/auth/authSelectors";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import "./Report.css";

const ReportContent = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const instanceSession = useRef(captureSession(store.getState()));
  const mounted = useRef(true);
  const current = useCallback(() => mounted.current && isSessionCurrent(store.getState(), instanceSession.current), [store]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const token = useAppSelector(selectToken);
  const mediaEnabled = useMediaCapability();
  const uploads = useRef<ImageUploads>(new WeakMap());
  const locked = useRef(false);
  const [progress, setProgress] = useState("");

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const watchId = useRef<number | null>(null);
  const locationIntent = useRef(0);
  const [type, setType] = useState<ReportType>("general");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopWatchingLocation = useCallback(() => {
    locationIntent.current++;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);
  useEffect(() => stopWatchingLocation, [stopWatchingLocation]);

  const handleSelectLocation = useCallback((next: LatLng | null) => {
    if (!current() || locked.current) return;
    stopWatchingLocation();
    setError(null);
    if (next !== null && !isValidMapLocation(next)) {
      setError(t("reports.locationInvalid"));
      return;
    }
    setLocation(next);
  }, [current, stopWatchingLocation]);

  const handleUseLocation = useCallback(() => {
    if (!current() || locked.current) return;
    stopWatchingLocation();
    const intent = locationIntent.current;
    setError(null);
    if (!navigator.geolocation) {
      setError(t("reports.locationUnavailable"));
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!current() || intent !== locationIntent.current) return;
        const { latitude, longitude } = pos.coords;
        const next = { lat: latitude, lng: longitude };
        if (isValidMapLocation(next)) setLocation(next);
        else setError(t("reports.locationInvalid"));
      },
      (err) => {
        if (!current() || intent !== locationIntent.current) return;
        setError(
          t(err.code === 1 ? "reports.locationDenied" : "reports.locationFailed")
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [current, stopWatchingLocation]);

  const submitReport = useCallback(async () => {
    if (locked.current || !current()) return;
    setError(null);

    if (!description.trim()) {
      setError(t("reports.descriptionRequired"));
      return;
    }
    if (!isValidMapLocation(location)) {
      setError(t(location ? "reports.locationInvalid" : "reports.locationRequired"));
      return;
    }
    if (isPostgresPreview && mediaFiles.length && !mediaEnabled) {
      setError(t("reports.uploadsDisabled"));
      return;
    }

    stopWatchingLocation();
    locked.current = true;
    setSubmitting(true);
    try {
      let attachment: { media?: string[]; mediaAssetIds?: string[] } = {};
      if (isPostgresPreview) {
        attachment = { mediaAssetIds: mediaFiles.length ? await uploadImages(mediaFiles, "report", token, uploads.current,
          message => { if (current()) setProgress(message); }, current) : [] };
      } else {
        const { uploadMedia } = await import("../../api/upload");
        attachment = { media: mediaFiles.length ? await uploadMedia(mediaFiles) : [] };
      }
      if (!current()) return;
      await dispatch(
        createReport({ description, location, type, ...attachment })
      ).unwrap();
      if (current()) navigate("/map-page");
    } catch (err: unknown) {
      if (current()) {
        const failure = isApiFailure(err) ? err : toApiFailure(err, { context: "report", sessionId: instanceSession.current.id, requestId: "report-submit" });
        if (failure.status === 401) dispatch(invalidateSession({ sessionId: instanceSession.current.id }));
        else setError(localizeError(failure, "report"));
      }
    } finally {
      locked.current = false;
      if (current()) setSubmitting(false);
    }
  }, [description, location, type, mediaFiles, dispatch, navigate, token, mediaEnabled, current, stopWatchingLocation]);

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
          location={location}
          setLocation={handleSelectLocation}
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

export default function Report() {
  const sessionId = useAppSelector(selectSessionId);
  const userId = useAppSelector(selectUserId);
  const loading = useAppSelector(selectAuthLoading);
  return <ReportContent key={`${sessionId}:${userId ?? "guest"}:${loading}`} />;
}
