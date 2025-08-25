import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Report from "./pages/report/Report";
import "./App.css";
import Register from "./pages/register/Register";
import Login from "./pages/login/Login";
import UsersRoutes from "./routes/UsersRoutes";
import MyReports from "./pages/myReports/MyReports";
import PublicRoutes from "./routes/PublicRoutes";
import About from "./pages/about/About";
import MapPage from "./pages/mapPage/MapPage";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
         
          <Route path="map-page" element={<MapPage />} />
          <Route path="about" element={<About />} />
          <Route path="/" element={<Report />} />

          <Route element={<PublicRoutes />}>
            <Route path="register" element={<Register />} />
            <Route path="login" element={<Login />} />
          </Route>

          <Route element={<UsersRoutes />}>
            <Route path="my-reports" element={<MyReports />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
