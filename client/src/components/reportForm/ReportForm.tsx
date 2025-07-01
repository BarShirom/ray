import "./ReportForm.css"

interface ReportFormProps {
  description: string;
  setDescription: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
}

const ReportForm = ({ description, setDescription, handleSubmit }: ReportFormProps) => {
  return (
    <div className="report-container">
      <h2>Make Street Cats Visible</h2>
      <p className="report-paragraph">
        Report. Help. Make an impact in real-time.
      </p>
      <form onSubmit={handleSubmit} className="report-form">
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
          <button
            type="button"
            className="form-button"
            onClick={() => alert("Coming soon: Auto GPS or map picker")}
          >
            📍 Use Current Location
          </button>
        </div>

        <div className="form-row">
          <label htmlFor="image">Image (optional)</label>
          <input
            type="file"
            id="image"
            accept="image/*"
            className="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                console.log("Selected image:", file);
              }
            }}
          />
        </div>

        <button
          type="submit"
          className="submit-btn"
          disabled={!description.trim()}
        >
          Submit Report
        </button>
      </form>
    </div>
  );
};

export default ReportForm