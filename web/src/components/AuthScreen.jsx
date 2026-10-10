import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "../lib/api.js";
import Logo from "./Logo.jsx";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = isRegister ? await api.register(fullName, email, password) : await api.login(email, password);
      onAuth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setError("");
  };

  return (
    <div className="auth-screen">
      <div className="auth-intro">
        <Logo large />
        <h1>Turn any exam paper into worked solutions.</h1>
        <p>
          Upload a PDF or a photo of a past paper. StudySync reads every question with OCR and explains each answer
          step by step, so you understand the method, not just the result.
        </p>
      </div>

      <form className="card auth-card" onSubmit={submit}>
        <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">{isRegister ? "It takes less than a minute." : "Sign in to continue studying."}</p>

        {isRegister && (
          <label className="field">
            <span>Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? 8 : undefined}
            required
          />
          {isRegister && <small className="muted">At least 8 characters.</small>}
        </label>

        {error && <div className="alert">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {isRegister ? "Create account" : "Sign in"}
        </button>

        <p className="switch-mode">
          {isRegister ? "Already have an account?" : "New to StudySync?"}{" "}
          <button type="button" className="link" onClick={switchMode}>
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </div>
  );
}
