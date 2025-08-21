import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from "../../features/auth/authThunks";

export default function Login() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await dispatch(loginUser({ email, password })).unwrap();
      navigate("/map-page");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : "Login failed. Please check your details.";
      setErr(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="panel auth-panel">
        {err && <div className="alert">{err}</div>}

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                className="control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          {/* Left-aligned submit button */}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !email || !password}
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <p className="hint">
            No account?{" "}
            <Link to="/register" className="link">
              Sign up
            </Link>
          </p>
        </form>
      </section>
    </div>
  );
}
