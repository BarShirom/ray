import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectToken, selectUserId } from "../../features/auth/authSelectors";
import { createReport } from "../../features/reports/reportsThunks";
import ReportForm from "../../components/reportForm/ReportForm";
import { type ReportType } from "../../features/reports/reportsSlice";
import "./Report.css";

const Report = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const token = useAppSelector(selectToken) ?? null;

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<null | { lat: number; lng: number }>(
    null
  );
  const [watchId, setWatchId] = useState<number | null>(null);
  const [type, setType] = useState<ReportType>("general");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ lat: latitude, lng: longitude });
      },
      () => alert("Could not fetch location (permission denied?)"),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    setWatchId(id);
  };

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return alert("Please describe the situation.");
    if (!location) return alert("Please add location before submitting.");



    dispatch(
      createReport({
        description,
        location,
        type,
        media: mediaFiles,
        token,
      })
    );

    navigate("/map");
  };

  return (
    <div className="report-main-container">
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

      {!userId && (
        <div className="register-login-container">
          <div className="register-container">
            <h3>Want to help even more?</h3>
            <p className="register-paragraph">
              Whether you're feeding, rescuing, a vet, or just someone who cares
              — join our community.
            </p>
            <div className="action-row">
              <button
                onClick={() => navigate("/register")}
                className="register-btn"
              >
                Register
              </button>
              <p className="login-paragraph">Already a member?</p>
              <button onClick={() => navigate("/login")} className="login-btn">
                Login
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Report;
