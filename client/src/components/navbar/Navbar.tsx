import { NavLink, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { logoutUser } from "../../features/auth/authThunks";
import { selectToken, selectName } from "../../features/auth/authSelectors";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector(selectToken);
  const userName = useAppSelector(selectName);
  const isLoggedIn = Boolean(token);
  console.log("navbar token =", token);
  console.log("userName =", userName);

  const handleLogout = async () => {
    await dispatch(logoutUser());
    navigate("/");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? "is-active" : ""}`;

  return (
    <nav className="nav">
      <div className="nav__brand">
        <img src="/logo/ray-logo.png" alt="Ray Logo" className="nav__logo" />
        <span className="nav__title">Ray - Make Stray Cats Visible</span>
      </div>

      <div className="nav__spacer" />

      <div className="nav__items">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `nav-item nav-item--primary ${isActive ? "is-active" : ""}`
          }
        >
          New report
        </NavLink>

        <NavLink to="/map-page" className={linkClass}>
          Map
        </NavLink>

        {isLoggedIn ? (
          <>
            <NavLink to="/my-reports" className={linkClass}>
              My reports
            </NavLink>
            <button className="nav-item nav-item--ghost" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <NavLink to="/register" className={linkClass}>
            Sign up
          </NavLink>
        )}
      </div>
    </nav>
  );
}
