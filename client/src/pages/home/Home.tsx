import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Home.css";
import ReportForm from "../../components/reportForm/ReportForm";

const Home = () => {
  const navigate = useNavigate();
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return alert("Please describe the situation.");
    console.log("Guest report:", description);
    navigate("/view-map");
  };

  return (
    <div className="home-container">
      <ReportForm
        description={description}
        setDescription={setDescription}
        handleSubmit={handleSubmit}
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
