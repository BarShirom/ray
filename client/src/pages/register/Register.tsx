import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Register.css";
import { useAppDispatch } from "../../app/hooks";
import { registerUser } from "../../features/auth/authThunks";
import { t } from "../../i18n";
import { localizeError } from "../../i18n/errors";

type FieldErrors = Partial<Record<"firstName" | "lastName" | "email" | "password", string>>;

export default function Register() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", password: "", company: "" });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const emailInput = formRef.current?.elements.namedItem("email") as HTMLInputElement | null;
    const errors: FieldErrors = {
      firstName: !formData.firstName ? t("auth.firstNameRequired") : undefined,
      lastName: !formData.lastName ? t("auth.lastNameRequired") : undefined,
      email: !formData.email ? t("auth.emailRequired") : emailInput?.validity.typeMismatch ? t("auth.emailInvalid") : undefined,
      password: !formData.password ? t("auth.passwordRequired") : formData.password.length < 6 ? t("auth.passwordTooShort") : undefined,
    };
    setFieldErrors(errors);
    const firstInvalid = (Object.keys(errors) as (keyof FieldErrors)[]).find((key) => errors[key]);
    if (firstInvalid) {
      (formRef.current?.elements.namedItem(firstInvalid) as HTMLInputElement | null)?.focus();
      return;
    }
    setLoading(true);
    try {
      await dispatch(registerUser(formData)).unwrap();
      navigate("/map-page");
    } catch (err: unknown) {
      setError(localizeError(err, "register"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="panel auth-panel" aria-labelledby="register-title">
        <h1 id="register-title" className="auth-title">{t("auth.register")}</h1>
        {error && <div className="alert" role="alert">{error}</div>}
        <form ref={formRef} className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="firstName" className="label">{t("auth.firstName")}</label>
            <input
              id="firstName"
              name="firstName"
              dir="auto"
              className="control"
              value={formData.firstName}
              onChange={handleChange}
              autoComplete="given-name"
              aria-invalid={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
              required
            />
            {fieldErrors.firstName && <p id="firstName-error" className="field-error" role="alert">{fieldErrors.firstName}</p>}
          </div>
          <div className="field">
            <label htmlFor="lastName" className="label">{t("auth.lastName")}</label>
            <input
              id="lastName"
              name="lastName"
              dir="auto"
              className="control"
              value={formData.lastName}
              onChange={handleChange}
              autoComplete="family-name"
              aria-invalid={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
              required
            />
            {fieldErrors.lastName && <p id="lastName-error" className="field-error" role="alert">{fieldErrors.lastName}</p>}
          </div>
          <div className="field">
            <label htmlFor="email" className="label">{t("auth.email")}</label>
            <input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              className="control"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
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
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                dir="auto"
                className="control"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? "password-error password-hint" : "password-hint"}
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
            <p id="password-hint" className="hint">{t("auth.passwordHint")}</p>
          </div>
          <div className="field">
            <label htmlFor="company" className="label">{t("auth.company")}</label>
            <input
              id="company"
              name="company"
              dir="auto"
              className="control"
              value={formData.company}
              onChange={handleChange}
              autoComplete="organization"
            />
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
            </button>
          </div>
          <p className="hint">
            {t("auth.existingAccount")}{" "}
            <Link to="/login" className="link">{t("auth.login")}</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
