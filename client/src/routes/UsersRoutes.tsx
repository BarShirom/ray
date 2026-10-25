import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import { selectAuthLoading, selectIsLoggedIn } from "../features/auth/authSelectors";
import { t } from "../i18n";

const UsersRoutes = () => {
  const isLoggedIn = useAppSelector(selectIsLoggedIn);
  const loading = useAppSelector(selectAuthLoading);

  if (loading) return <p role="status">{t("auth.checking")}</p>;

  return isLoggedIn ? <Outlet /> : <Navigate to="/" replace />;
};

export default UsersRoutes;
