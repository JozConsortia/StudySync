import { useState } from "react";
import { Check, Eye, EyeOff, LoaderCircle, Lock, Mail, User } from "lucide-react";
import { api } from "../lib/api.js";
import Logo from "./Logo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import BotAvatar from "./BotAvatar.jsx";
import ResetPassword from "./ResetPassword.jsx";

export default function AuthScreen({ onAuth, theme, onToggleTheme }) {
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  const switchMode = (next = isRegister ? "login" : "register") => {
    setMode(next);
    setError("");
  };

  return (
    <div className="auth-screen">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="auth-theme" />
      <div className="auth-intro">
        <Logo large />
        <h1>Turn any exam paper into worked solutions.</h1>
        <p>
          Upload a PDF or a photo of a past paper. StudySync reads every question with OCR and explains each answer
          step by step, so you understand the method, not just the result.
        </p>
        <div className="auth-bot">
          <BotAvatar size={52} />
          <div className="auth-bot-bubble">
            Hi, I&apos;m <strong>StudySync Bot</strong>. Snap a paper, type a question or just ask me out loud, and
            I&apos;ll walk you through the answer. I can read it to you too.
          </div>
        </div>
      </div>

      {mode === "forgot" ? (
        <div className="card auth-card">
          <ResetPassword initialEmail={email} onDone={onAuth} onCancel={() => switchMode("login")} />
        </div>
      ) : (
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-switch" role="tablist" aria-label="Sign in or create an account">
          <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? "active" : ""} onClick={() => switchMode("login")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? "active" : ""} onClick={() => switchMode("register")}>
            Create account
          </button>
        </div>
        <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
        <p className="muted">{isRegister ? "It takes less than a minute." : "Sign in to continue studying."}</p>

        {isRegister && (
          <label className="field">
            <span>Full name</span>
            <div className="input-icon">
              <User size={16} />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                placeholder="e.g. Thandi Mokoena"
                required
              />
            </div>
          </label>
        )}
        <label className="field">
          <span>Email address</span>
          <div className="input-icon">
            <Mail size={16} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
        </label>
        <label className="field">
          <span>Password</span>
          <div className="input-icon">
            <Lock size={16} />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder={isRegister ? "Create a password (8+ characters)" : "Enter your password"}
              minLength={isRegister ? 8 : undefined}
              required
            />
            <button
              type="button"
              className="input-action"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {isRegister && (
            <small className={password.length >= 8 ? "hint ok" : "hint"}>
              {password.length >= 8 ? <Check size={13} /> : null}
              At least 8 characters{password.length > 0 && password.length < 8 ? ` (${8 - password.length} more)` : ""}
            </small>
          )}
          {!isRegister && (
            <button type="button" className="link forgot-link" onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          )}
        </label>

        {error && <div className="alert">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy && <LoaderCircle size={16} className="spin" />}
          {isRegister ? "Create account" : "Sign in"}
        </button>

        <p className="switch-mode">
          {isRegister ? "Already have an account?" : "New to StudySync?"}{" "}
          <button type="button" className="link" onClick={() => switchMode()}>
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
      )}
    </div>
  );
}
