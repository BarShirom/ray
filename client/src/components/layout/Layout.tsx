import { Outlet } from "react-router-dom";
import "./Layout.css"
import Navbar from "../navbar/Navbar";

const Layout = () => {
  return (
    <div className="layout-container">
        <Navbar/>
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
