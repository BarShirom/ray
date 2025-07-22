import { Link, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { logoutUser } from "../../features/auth/authThunks";
import { selectToken } from "../../features/auth/authSelectors";
const Navbar = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const token = useAppSelector(selectToken);
  const isLoggedIn = Boolean(token);

  const handleLogout = () => {
    dispatch(logoutUser());
    navigate("/");
  };
  return (
    <nav className="navbar-container">
      <div className="navbar-brand">
        <h1>RAY</h1>
        <h3>Make Street Cats Visible</h3>
      </div>

      <div className="navbar-links">
        <Link to="/">Report</Link>
        <Link to="/map">Map</Link>
        <Link to="/about">About</Link>

        {isLoggedIn && (
          <>
            <Link to="/manage-reports">Manage Reports</Link>
            <button onClick={handleLogout}>Logout</button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
