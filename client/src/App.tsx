import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/home/Home";
import "./App.css";
import Register from "./pages/register/Register";
import Login from "./pages/login/Login";
import UsersRoutes from "./routes/UsersRoutes";
import Dashboard from "./pages/dashboard/Dashboard";
import PublicRoutes from "./routes/PublicRoutes";
import Map from "./pages/map/Map";
import About from "./pages/about/About";

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route element={<PublicRoutes />}>
            <Route path="/" element={<Home />} />
            <Route path="register" element={<Register />} />
            <Route path="login" element={<Login />} />
            <Route path="map" element={<Map />} />
            <Route path="about" element={<About />} />
          </Route>

          <Route element={<UsersRoutes />}>
            <Route path="dashboard" element={<Dashboard />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
