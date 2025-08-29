import { Outlet } from "react-router-dom";
import Navbar from "../navbar/Navbar";
import "./Layout.css";

export default function Layout() {
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
          <Navbar />
        </div>
      </header>

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}

