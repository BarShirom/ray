import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import "./Home.css";
import ReportForm from "../../components/reportForm/ReportForm";
import {
  type ReportType,
  type ReportStatus,
  addReport,
} from "../../features/reports/reportsSlice";
import { selectUserId } from "../../features/auth/authSelectors";

const Home = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const userId = useSelector(selectUserId);

  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<null | { lat: number; lng: number }>(
    null
  );
  const [watchId, setWatchId] = useState<number | null>(null);
  const [type, setType] = useState<ReportType>("general");

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return alert("Please describe the situation.");
    if (!location)
      return alert(
        "Please click 📍 or choose a spot on the map before submitting."
      );

    const newReport = {
      id: uuidv4(),
      description,
      location,
      type,
      status: "new" as ReportStatus,
      createdAt: new Date().toISOString(),
      createdBy: userId ?? null,
    };

    dispatch(addReport(newReport));
    navigate("/map");
  };

  return (
    <div className="home-container">
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
      />

      <div className="register-login-container">
        <div className="register-container">
          <h3>Want to help even more?</h3>
          <p className="register-paragraph">
            Whether you're feeding, rescuing, a vet, or just someone who cares —
            join our community.
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
    </div>
  );
};

export default Home;
