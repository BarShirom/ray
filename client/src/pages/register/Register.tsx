import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Register.css";
import { useAppDispatch } from "../../app/hooks";
import { registerUser } from "../../features/auth/authThunks";

const Register = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    company: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const resultAction = await dispatch(registerUser(formData));
      if (registerUser.rejected.match(resultAction)) {
        setError((resultAction.payload as string) || "Registration failed");
        return;
      }

      
      navigate("/map");
    } catch (err) {
      console.error("❌ Register error:", err);
      setError("Something went wrong");
    }
  };

  return (
    <div className="register-container">
      <h2>Register</h2>
      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="register-form">
        <input
          name="firstName"
          type="text"
          placeholder="First Name"
          value={formData.firstName}
          onChange={handleChange}
          required
        />
        <input
          name="lastName"
          type="text"
          placeholder="Last Name"
          value={formData.lastName}
          onChange={handleChange}
          required
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
        />
        <input
          name="company"
          type="text"
          placeholder="Company (optional)"
          value={formData.company}
          onChange={handleChange}
        />
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default Register;
