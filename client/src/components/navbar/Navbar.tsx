import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useEffect, useState } from "react";

const Navbar = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem("persist:root");
    if (!storedUser) return;

    try {
      const parsed = JSON.parse(storedUser);
      const auth = parsed.auth ? JSON.parse(parsed.auth) : null;
      if (auth?.user?.token) {
        setIsLoggedIn(true);
      }
    } catch (error) {
      console.log("Error parsing user from localStorage", error);
    }
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    navigate("/");
  };

  return (
    <nav className="navbar-container">
      <div className="navbar-brand">
        <h1>RAY</h1>
        <h3>Make Street Cats Visible</h3>
      </div>

      <div className="navbar-links">
        <Link to="/">Home</Link>
        <Link to="/map">Map</Link>
        <Link to="/about">About</Link>

        {isLoggedIn && (
          <>
            <Link to="/dashboard">Dashboard</Link>
            <button onClick={handleLogout}>Logout</button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
