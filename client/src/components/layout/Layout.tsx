import { useMediaCapability } from "../media/Media";
import { isPostgresPreview } from "../../preview";
import { Outlet } from "react-router-dom";
import Navbar from "../navbar/Navbar";
import "./Layout.css";

export default function Layout() {
  const mediaEnabled = useMediaCapability();
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
          <Navbar />
          {isPostgresPreview && <p role="status" style={{ margin: "4px 0", fontSize: "0.85rem" }}>Local PostgreSQL preview / synthetic data / {mediaEnabled ? "S3 images enabled" : "uploads disabled"}</p>}
        </div>
      </header>

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}

