import { isPostgresPreview } from "../../preview";
import React, { useState } from "react";
import { validateImages } from "../../api/media";
import { FilePreview } from "../media/Media";
import type { ReportType } from "../../features/reports/reportsSlice";
import MapPreview from "../mapPreview/MapPreview";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";
import "./ReportForm.css";

interface ReportFormProps {
  pending?: boolean;
  mediaEnabled?: boolean;
  signedIn?: boolean;
  description: string;
  setDescription: (value: string) => void;
  handleSubmit: React.FormEventHandler<HTMLFormElement>; 
  useLocation: () => void;
  locationReady: boolean;
  location: { lat: number; lng: number } | null;
  setLocation: (value: { lat: number; lng: number }) => void;
  type: ReportType;
  setType: (value: ReportType) => void;
  mediaFiles: File[];
  setMediaFiles: (files: File[]) => void;
}

const MAX_FILES = 6;
const MAX_FILE_SIZE = 50 * 1024 * 1024; 

export default function ReportForm({
  pending = false, mediaEnabled = false, signedIn = false,
  description,
  setDescription,
  handleSubmit,
  useLocation,
  locationReady,
  location,
  setLocation,
  type,
  setType,
  mediaFiles,
  setMediaFiles,
}: ReportFormProps) {
  const [fileError, setFileError] = useState("");
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (isPostgresPreview) {
      try { validateImages([...mediaFiles, ...picked], "report"); setMediaFiles([...mediaFiles, ...picked]); setFileError(""); } catch (error) { setFileError(localizeError(error, "upload")); }
      e.currentTarget.value = ""; return;
    }
    const accepted = picked.filter(
      (f) =>
        (f.type.startsWith("image/") || f.type.startsWith("video/")) &&
        f.size <= MAX_FILE_SIZE
    );
    const merged = [...mediaFiles, ...accepted].slice(0, MAX_FILES);
    setMediaFiles(merged);
    setFileError(accepted.length < picked.length ? t("reports.legacyMediaInvalid") : mediaFiles.length + accepted.length > MAX_FILES ? t("reports.legacyMediaCount") : "");
    e.currentTarget.value = "";
  };

  const clearAllFiles = () => { setMediaFiles([]); setFileError(""); };

  return (
    <form noValidate onSubmit={handleSubmit} className="report-form">
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12 }}>
      {/* Type chips */}
      <div className="field">
        <label className="label" id="report-type-label">{t("reports.subject")}</label>
        <div className="chip-group" role="radiogroup" aria-labelledby="report-type-label">
          {(["general", "food", "emergency"] as const).map((reportType) => (
            <label
              key={reportType}
              className={`chip ${type === reportType ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name="type"
                value={reportType}
                checked={type === reportType}
                onChange={() => setType(reportType)}
                className="sr-only"
              />
              {t(reportType === "emergency" ? "reports.emergencyChip" : reportType === "food" ? "reports.foodChip" : "reports.generalChip")}
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="field">
        <label htmlFor="description" className="label">
          {t("reports.description")}
        </label>
        <textarea
          id="description"
          placeholder={t("reports.descriptionPlaceholder")}
          dir="auto"
          rows={4}
          className="control"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Location */}
      <div className="field">
        <label className="label">{t("reports.location")}</label>
        <div className="row">
          <button type="button" className="btn" onClick={useLocation}>
            📍 {t(locationReady ? "reports.locationAdded" : "reports.useLocation")}
          </button>
          <span className="status">
            <span className={`status-dot ${locationReady ? "is-ready" : ""}`} />
            {t(locationReady ? "reports.locationReady" : "reports.locationMissing")}
          </span>
        </div>
        <p className="hint-text">
          {t("reports.chooseLocationHint")}
        </p>
        <MapPreview selectedLocation={location} onSelect={setLocation} />
      </div>

      {/* Media */}
      {isPostgresPreview && !mediaEnabled && <p>{t("reports.uploadsDisabled")}</p>}
      {isPostgresPreview && !signedIn && <p>{t("reports.signInForImages")}</p>}
      {fileError && <p role="alert">{fileError}</p>}
      <div className="field">
        <label htmlFor="media" className="label">
          {t(isPostgresPreview ? "reports.images" : "reports.media")}
        </label>
        <input
          disabled={pending || (isPostgresPreview && (!mediaEnabled || !signedIn))}
          type="file"
          id="media"
          accept={isPostgresPreview ? "image/jpeg,image/png,image/webp" : "image/*,video/*"}
          multiple
          className="control"
          onChange={handleFileChange}
          aria-label={t(isPostgresPreview ? "reports.addImages" : "reports.addMedia")}
        />
        <p className="hint-text">
          {isPostgresPreview ? t("reports.imageLimits") : t("reports.mediaLimits", { count: MAX_FILES, size: Math.round(MAX_FILE_SIZE / (1024 * 1024)) })}
        </p>

        {mediaFiles.length > 0 && (
          <>
            <div className="media-summary">
              <span>
                {t("reports.selectedFiles", { count: mediaFiles.length })}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={clearAllFiles}
              >
                {t("reports.clearFiles")}
              </button>
            </div>

            <div className="media-grid">
              {mediaFiles.map((file, index) => <FilePreview key={index} file={file} index={index} />)}
            </div>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!description.trim() || !locationReady}
        >
          {t("reports.submit")}
        </button>
      </div>
      </fieldset>
    </form>
  );
}

