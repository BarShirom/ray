import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import { selectIsLoggedIn } from "../features/auth/authSelectors";

const UsersRoutes = () => {
  const isLoggedIn = useAppSelector(selectIsLoggedIn);

  return isLoggedIn ? <Outlet /> : <Navigate to="/" replace />;
};

export default UsersRoutes;
