import React from "react";
import type { ReportType } from "../../features/reports/reportsSlice";
import MapPreview from "../mapPreview/MapPreview";
import "./ReportForm.css";

interface ReportFormProps {
  description: string;
  setDescription: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  useLocation: () => void;
  locationReady: boolean;
  location: { lat: number; lng: number } | null;
  setLocation: (value: { lat: number; lng: number }) => void;
  type: ReportType;
  setType: (value: ReportType) => void;
  mediaFiles: File[];
  setMediaFiles: (files: File[]) => void;
}

const MAX_FILES = 6; // sensible cap
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

const ReportForm = ({
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
}: ReportFormProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);

    // allow images & videos only, with a simple size guard
    const accepted = picked.filter(
      (f) =>
        (f.type.startsWith("image/") || f.type.startsWith("video/")) &&
        f.size <= MAX_FILE_SIZE
    );

    // merge with existing, keep first MAX_FILES
    const merged = [...mediaFiles, ...accepted].slice(0, MAX_FILES);
    setMediaFiles(merged);

    // allow re-selecting the same files later
    e.currentTarget.value = "";
  };

  const clearAllFiles = () => setMediaFiles([]);

  return (
    <div className="report-container">
      <h2>Make Street Cats Visible</h2>
      <p className="report-paragraph">
        Report. Help. Make an impact in real-time.
      </p>

      <form onSubmit={handleSubmit} className="report-form">
        <label htmlFor="type">Subject</label>
        <select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as ReportType)}
          className="type-select"
        >
          <option value="emergency">🚨 Emergency</option>
          <option value="food">🍲 I gave food</option>
          <option value="general">📍 General</option>
        </select>

        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          placeholder="Describe what you saw..."
          rows={4}
          className="report-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="form-row">
          <label htmlFor="location">Location</label>
          <button type="button" className="form-button" onClick={useLocation}>
            📍 {locationReady ? "Location Added ✅" : "Use Current Location"}
          </button>
          <p className="hint-text">
            (or click on the map to choose a different spot)
          </p>
          <MapPreview selectedLocation={location} onSelect={setLocation} />
        </div>

        <div className="form-row">
          <label htmlFor="media">Media (optional)</label>
          <input
            type="file"
            id="media"
            accept="image/*,video/*"
            multiple
            className="file-input"
            onChange={handleFileChange}
            aria-label="Add images or videos"
          />
          <p className="hint-text">
            Up to {MAX_FILES} files. Images & videos only. Max{" "}
            {Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB each.
          </p>

          {mediaFiles.length > 0 && (
            <div className="media-summary">
              <span>
                {mediaFiles.length} file{mediaFiles.length > 1 ? "s" : ""}{" "}
                selected
              </span>
              <button
                type="button"
                className="clear-all-button"
                onClick={clearAllFiles}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={!description.trim() || !locationReady}
        >
          Submit Report
        </button>
      </form>
    </div>
  );
};

export default ReportForm;
