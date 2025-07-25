import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import { selectIsLoggedIn } from "../features/auth/authSelectors";

const PublicRoutes = () => {
  const isLoggedIn = useAppSelector(selectIsLoggedIn);

  return isLoggedIn ? <Navigate to="/map" replace /> : <Outlet />;
};

export default PublicRoutes;
