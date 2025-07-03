import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { useAppDispatch } from "../../app/hooks";
import { loginUser } from "../../features/auth/authThunks";

const Login = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    try {
      const resultAction = await dispatch(loginUser({ email, password }));

      if (loginUser.rejected.match(resultAction)) {
        setErrorMsg((resultAction.payload as string) || "Login failed");
        return;
      }

      navigate("/dashboard");
    } catch (err) {
      console.log("❌ Login error:", err);
      setErrorMsg("Something went wrong");
    }
  };

  return (
    <div className="login-container">
      <h2>Login</h2>
      <form onSubmit={handleSubmit} className="login-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {errorMsg && <p className="error-message">{errorMsg}</p>}

        <button type="submit">Login</button>
      </form>
    </div>
  );
};

export default Login;
