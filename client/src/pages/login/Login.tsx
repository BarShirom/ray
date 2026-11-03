import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useEffect } from "react";
import { useStore } from "react-redux";
import type { RootState } from "../../app/store";
import { ownsBrowserAuthority } from "../../features/auth/session";
import "./Login.css";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { selectAuthError } from "../../features/auth/authSelectors";
import { loginUser } from "../../features/auth/authThunks";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";

export default function Login() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const navigate = useNavigate();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const authError = useAppSelector(selectAuthError);
  const visibleError = err ?? authError;
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const mounted = useRef(true);
  const submitting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mounted.current || submitting.current || loading) return;
    setErr(null);
    const errors = {
      email: !email ? t("auth.emailRequired") : emailInput.current?.validity.typeMismatch ? t("auth.emailInvalid") : undefined,
      password: !password ? t("auth.passwordRequired") : undefined,
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      (errors.email ? emailInput : passwordInput).current?.focus();
      return;
    }
    submitting.current = true;
    setLoading(true);
    let submittedSessionId: string | null = null;
    try {
      const request = dispatch(loginUser({ email, password }));
      const attemptSessionId = store.getState().auth.sessionId;
      submittedSessionId = attemptSessionId;
      const result = await request;
      const auth = store.getState().auth;
      if (!mounted.current || !ownsBrowserAuthority(auth.sessionId)) return;
      if (loginUser.fulfilled.match(result) && auth.completedAttemptId === request.requestId) navigate("/map-page");
      else if (loginUser.rejected.match(result) && auth.sessionId === attemptSessionId && !result.meta.aborted) {
        setErr(localizeError(result.payload, "login"));
      }
    } catch (error: unknown) {
      if (mounted.current && submittedSessionId === store.getState().auth.sessionId
        && ownsBrowserAuthority(submittedSessionId)) setErr(localizeError(error, "login"));
    } finally {
      if (mounted.current) { submitting.current = false; setLoading(false); }
    }
  };

  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="auth-title">{t("auth.login")}</h1>
        {visibleError && <div className="alert" role="alert">{visibleError}</div>}
        <form className="auth-form" onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email" className="label">{t("auth.email")}</label>
            <input
              ref={emailInput}
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              className="control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              required
            />
            {fieldErrors.email && <p id="email-error" className="field-error" role="alert">{fieldErrors.email}</p>}
          </div>
          <div className="field">
            <label htmlFor="password" className="label">{t("auth.password")}</label>
            <div className="input-with-button">
              <input
                ref={passwordInput}
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                dir="auto"
                autoComplete="current-password"
                className="control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error" : undefined}
                required
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-pressed={showPw}
              >
                {showPw ? t("auth.hide") : t("auth.show")}
              </button>
            </div>
            {fieldErrors.password && <p id="password-error" className="field-error" role="alert">{fieldErrors.password}</p>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || !email || !password}>
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
          <p className="hint">
            {t("auth.noAccount")}{" "}
            <Link to="/register" className="link">{t("auth.register")}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
