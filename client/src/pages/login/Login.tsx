import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from "../../features/auth/authThunks";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
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
    setLoading(true);
    try {
      await dispatch(loginUser({ email, password })).unwrap();
      navigate("/map-page");
    } catch (error: unknown) {
      setErr(localizeError(error, "login"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="login-title">
        <h1 id="login-title" className="auth-title">{t("auth.login")}</h1>
        {err && <div className="alert" role="alert">{err}</div>}
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
