import React from "react";
import type { ReportType } from "../../features/reports/reportsSlice";
import MapPreview from "../mapPreview/MapPreview";
import "./ReportForm.css";

interface ReportFormProps {
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
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
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
      <div className="field">
        <label htmlFor="media" className="label">
          Media (optional)
        </label>
        <input
          type="file"
          id="media"
          accept="image/*,video/*"
          multiple
          className="control"
          onChange={handleFileChange}
          aria-label="Add images or videos"
        />
        <p className="hint-text">
          Up to {MAX_FILES} files. Images & videos only. Max{" "}
          {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB each.
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
              {mediaFiles.map((f, i) =>
                f.type.startsWith("image/") ? (
                  <img
                    key={i}
                    className="media-thumb"
                    src={URL.createObjectURL(f)}
                    alt={`Selected ${i + 1}`}
                    onLoad={(e) =>
                      URL.revokeObjectURL((e.target as HTMLImageElement).src)
                    }
                  />
                ) : (
                  <video
                    key={i}
                    className="media-thumb"
                    controls
                    preload="metadata"
                    src={URL.createObjectURL(f)}
                    onLoadedData={(e) =>
                      URL.revokeObjectURL((e.target as HTMLVideoElement).src)
                    }
                  />
                )
              )}
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
    </form>
  );
}

