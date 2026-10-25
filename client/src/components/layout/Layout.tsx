import { useMediaCapability } from "../media/Media";
import { isPostgresPreview } from "../../preview";
import { Outlet } from "react-router-dom";
import Navbar from "../navbar/Navbar";
import { t } from "../../i18n";
import "./Layout.css";

export default function Layout() {
  const mediaEnabled = useMediaCapability();
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
          <Navbar />
          {isPostgresPreview && (
            <p role="status" className="app__preview-banner">
              {mediaEnabled ? t("shell.previewMediaEnabled") : t("shell.previewMediaDisabled")}
            </p>
          )}
        </div>
      </header>

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}

