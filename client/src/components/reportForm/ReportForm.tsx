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
 
  setMediaFiles,
}: ReportFormProps) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setMediaFiles(Array.from(files));
    }
  };

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
          />
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

// import type { ReportType } from "../../features/reports/reportsSlice";
// import MapPreview from "../mapPreview/MapPreview";
// import "./ReportForm.css";

// interface ReportFormProps {
//   description: string;
//   setDescription: (value: string) => void;
//   handleSubmit: (e: React.FormEvent) => void;
//   useLocation: () => void;
//   locationReady: boolean;
//   location: { lat: number; lng: number } | null;
//   setLocation: (value: { lat: number; lng: number }) => void;
//   type: ReportType;
//   setType: (value: ReportType) => void;
// }

// const ReportForm = ({
//   description,
//   setDescription,
//   handleSubmit,
//   useLocation,
//   locationReady,
//   location,
//   setLocation,
//   type,
//   setType,
// }: ReportFormProps) => {
//   return (
//     <div className="report-container">
//       <h2>Make Street Cats Visible</h2>
//       <p className="report-paragraph">
//         Report. Help. Make an impact in real-time.
//       </p>
//       <form onSubmit={handleSubmit} className="report-form">
//         <label htmlFor="type">Subject</label>
//         <select
//           id="type"
//           value={type}
//           onChange={(e) => setType(e.target.value as ReportType)}
//           className="type-select"
//         >
//           <option value="emergency">🚨 Emergency</option>
//           <option value="food">🍲 I gave food</option>
//           <option value="general">📍 General</option>
//         </select>

//         <label htmlFor="description">Description</label>
//         <textarea
//           id="description"
//           placeholder="Describe what you saw..."
//           rows={4}
//           className="report-textarea"
//           value={description}
//           onChange={(e) => setDescription(e.target.value)}
//         />

//         <div className="form-row">
//           <label htmlFor="location">Location</label>
//           <button type="button" className="form-button" onClick={useLocation}>
//             📍 {locationReady ? "Location Added ✅" : "Use Current Location"}
//           </button>
//           <p className="hint-text">
//             (or click on the map to choose a different spot)
//           </p>
//           <MapPreview selectedLocation={location} onSelect={setLocation} />
//         </div>

//         <div className="form-row">
//           <label htmlFor="image">Image (optional)</label>
//           <input
//             type="file"
//             id="image"
//             accept="image/*"
//             className="file-input"
//             onChange={(e) => {
//               const file = e.target.files?.[0];
//               if (file) {
//                 console.log("Selected image:", file);
//               }
//             }}
//           />
//         </div>

//         <button
//           type="submit"
//           className="submit-btn"
//           disabled={!description.trim() || !locationReady}
//         >
//           Submit Report
//         </button>
//       </form>
//     </div>
//   );
// };

// export default ReportForm;
