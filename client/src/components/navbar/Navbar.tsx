import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./Navbar.css";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { logoutUser } from "../../features/auth/authThunks";
import { selectToken } from "../../features/auth/authSelectors";
import { t } from "../../i18n";

export default function Navbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector(selectToken);
  const isLoggedIn = Boolean(token);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);

  const closeMenu = () => setMenuOpen(false);
  const handleLogout = async () => {
    closeMenu();
    await dispatch(logoutUser());
    navigate("/");
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `nav-item ${isActive ? "is-active" : ""}`;

  return (
    <nav
      className="nav"
      aria-label={t("shell.navigation")}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          event.preventDefault();
          closeMenu();
          menuToggle.current?.focus();
        }
      }}
    >
      <div className="nav__brand">
        <img src="/logo/ray-logo.png" alt={t("shell.logoAlt")} className="nav__logo" />
        <span className="nav__title">{t("shell.brandTagline")}</span>
      </div>

      <button
        ref={menuToggle}
        type="button"
        className="nav-item nav__toggle"
        aria-controls="primary-navigation-items"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? t("shell.closeMenu") : t("shell.menu")}
      </button>

      <div id="primary-navigation-items" className={`nav__items ${menuOpen ? "nav__items--open" : ""}`}>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `nav-item nav-item--primary ${isActive ? "is-active" : ""}`
          }
          onClick={closeMenu}
        >
          {t("shell.newReport")}
        </NavLink>

        <NavLink to="/map-page" className={linkClass} onClick={closeMenu}>
          {t("shell.map")}
        </NavLink>

        {isLoggedIn ? (
          <>
            <NavLink to="/my-reports" className={linkClass} onClick={closeMenu}>
              {t("shell.assignedReports")}
            </NavLink>
            <button type="button" className="nav-item nav-item--ghost" onClick={handleLogout}>
              {t("auth.logout")}
            </button>
          </>
        ) : (
          <NavLink to="/register" className={linkClass} onClick={closeMenu}>
            {t("auth.register")}
          </NavLink>
        )}
      </div>
    </nav>
  );
}
