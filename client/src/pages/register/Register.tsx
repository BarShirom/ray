import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Register.css";
import { useAppDispatch } from "../../app/hooks";
import { registerUser } from "../../features/auth/authThunks";

export default function Register() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    company: "",
  });

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((s) => ({ ...s, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      // unwrap throws if rejected — simpler error handling
      await dispatch(registerUser(formData)).unwrap();
      navigate("/map-page");
    } catch (err: unknown) {
     const message =
       err instanceof Error
         ? err.message
         : typeof err === "string"
         ? err
         : "Registration failed. Please try again.";
     setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
 

      <section className="panel auth-panel">
        {error && <div className="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="firstName" className="label">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              className="control"
              value={formData.firstName}
              onChange={handleChange}
              autoComplete="given-name"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="lastName" className="label">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              className="control"
              value={formData.lastName}
              onChange={handleChange}
              autoComplete="family-name"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="control"
              value={formData.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="input-with-button">
              <input
                id="password"
                name="password"
                type={showPw ? "text" : "password"}
                className="control"
                value={formData.password}
                onChange={handleChange}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="reveal"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <p className="hint">Minimum 6 characters.</p>
          </div>

          <div className="field">
            <label htmlFor="company" className="label">
              Company (optional)
            </label>
            <input
              id="company"
              name="company"
              className="control"
              value={formData.company}
              onChange={handleChange}
              autoComplete="organization"
            />
          </div>

          <div className="actions">
       
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create account"}
            </button>
          </div>

          <p className="hint">
            Already have an account?{" "}
            <Link to="/login" className="link">
              Log in
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}

