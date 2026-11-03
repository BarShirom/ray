import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectLogoutFailure, selectSessionId } from "../../features/auth/authSelectors";
import { logoutUser } from "../../features/auth/authThunks";
import { t } from "../../i18n";

export default function LogoutStorageWarning() {
  const dispatch = useAppDispatch();
  const failure = useAppSelector(selectLogoutFailure);
  const sessionId = useAppSelector(selectSessionId);
  if (!failure) return null;
  return (
    <section className="panel" role="alert" aria-labelledby="logout-storage-title">
      <h2 id="logout-storage-title">{t("auth.logoutStorageTitle")}</h2>
      <p>{t("auth.logoutStorageWarning")}</p>
      {failure.sessionId === sessionId ? <button className="btn" type="button" onClick={() => { void dispatch(logoutUser({ retrySessionId: failure.sessionId })); }}>
        {t("auth.retryLogout")}
      </button> : <p>{t("auth.logoutRetrySuperseded")}</p>}
    </section>
  );
}
