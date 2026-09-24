import { isPostgresPreview } from "../../preview";
import React, { useState } from "react";
import { validateImages } from "../../api/media";
import { FilePreview } from "../media/Media";
import type { ReportType } from "../../features/reports/reportsSlice";
import MapPreview from "../mapPreview/MapPreview";
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
      try { validateImages([...mediaFiles, ...picked], "report"); setMediaFiles([...mediaFiles, ...picked]); setFileError(""); } catch (error) { setFileError((error as Error).message); }
      e.currentTarget.value = ""; return;
    }
    const accepted = picked.filter(
      (f) =>
        (f.type.startsWith("image/") || f.type.startsWith("video/")) &&
        f.size <= MAX_FILE_SIZE
    );
    const merged = [...mediaFiles, ...accepted].slice(0, MAX_FILES);
    setMediaFiles(merged);
    e.currentTarget.value = "";
  };

  const clearAllFiles = () => setMediaFiles([]);

  return (
    <form onSubmit={handleSubmit} className="report-form">
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 12 }}>
      {/* Type chips */}
      <div className="field">
        <label className="label">Subject</label>
        <div className="chip-group" role="radiogroup" aria-label="Report type">
          {(["general", "food", "emergency"] as const).map((t) => (
            <label
              key={t}
              className={`chip ${type === t ? "is-selected" : ""}`}
              aria-pressed={type === t}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              {t === "emergency"
                ? "🚨 Emergency"
                : t === "food"
                ? "🍲 I gave food"
                : "📍 General"}
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="field">
        <label htmlFor="description" className="label">
          Description
        </label>
        <textarea
          id="description"
          placeholder="Describe what you saw..."
          rows={4}
          className="control"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Location */}
      <div className="field">
        <label className="label">Location</label>
        <div className="row">
          <button type="button" className="btn" onClick={useLocation}>
            📍 {locationReady ? "Location Added ✅" : "Use Current Location"}
          </button>
          <span className="status">
            <span className={`status-dot ${locationReady ? "is-ready" : ""}`} />
            {locationReady ? "Location ready" : "Location not set"}
          </span>
        </div>
        <p className="hint-text">
          (or click on the map to choose a different spot)
        </p>
        <MapPreview selectedLocation={location} onSelect={setLocation} />
      </div>

      {/* Media */}
      {isPostgresPreview && !mediaEnabled && <p>Uploads unavailable in local preview. Continue without media.</p>}
      {isPostgresPreview && <p>Sign in to add images. Guests can submit reports without images.</p>}
      {fileError && <p role="alert">{fileError}</p>}
      <div className="field">
        <label htmlFor="media" className="label">
          Media (optional)
        </label>
        <input
          disabled={pending || (isPostgresPreview && (!mediaEnabled || !signedIn))}
          type="file"
          id="media"
          accept={isPostgresPreview ? "image/jpeg,image/png,image/webp" : "image/*,video/*"}
          multiple
          className="control"
          onChange={handleFileChange}
          aria-label="Add images or videos"
        />
        <p className="hint-text">
          {isPostgresPreview ? "Up to 3 JPEG, PNG or WebP images, 8 MiB each. No animated images." : `Up to ${MAX_FILES} images or videos, ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB each.`}
        </p>

        {mediaFiles.length > 0 && (
          <>
            <div className="media-summary">
              <span>
                {mediaFiles.length} file{mediaFiles.length > 1 ? "s" : ""}{" "}
                selected
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={clearAllFiles}
              >
                Clear all
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
          Submit report
        </button>
      </div>
      </fieldset>
    </form>
  );
}

