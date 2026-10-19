import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Hash, Inbox, KeyRound, LoaderCircle, Lock, Mail, Send } from "lucide-react";
import { api } from "../lib/api.js";

/**
 * "Forgot password": the student enters their email, receives a 6-digit code by email, then enters the
 * code with a new password. onDone receives { token, user } (they are signed in with the new password).
 */
export default function ResetPassword({ initialEmail = "", onDone, onCancel }) {
  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until "Send a new code" is allowed
  const codeRef = useRef(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async (e) => {
    e?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.forgotPassword(email);
      setNotice(res.message);
      setWait(res.resendAfterSeconds || 45);
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError("");
    if (code.length !== 6) return setError("Enter the 6-digit code from the email.");
    if (password.length < 8) return setError("Your new password must be at least 8 characters.");
    setBusy(true);
    try {
      onDone(await api.resetPassword(email, code, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="reset" onSubmit={step === "email" ? sendCode : reset}>
      <div className="reset-head">
        <span className="reset-icon">{step === "email" ? <KeyRound size={20} /> : <Mail size={20} />}</span>
        <div>
          <h2>{step === "email" ? "Reset your password" : "Check your email"}</h2>
          <p className="muted">
            {step === "email"
              ? "We'll email you a 6-digit code to set a new password."
              : `Enter the code we sent to ${email.trim()} and choose a new password.`}
          </p>
        </div>
      </div>

      {step === "email" ? (
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
              autoFocus
            />
          </div>
        </label>
      ) : (
        <>
          {notice && (
            <div className="notice">
              <Inbox size={16} /> <span>{notice}</span>
            </div>
          )}
          <label className="field">
            <span>6-digit code</span>
            <div className="input-icon">
              <Hash size={16} />
              <input
                ref={codeRef}
                className="code-field"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                required
              />
            </div>
          </label>
          <label className="field">
            <span>New password</span>
            <div className="input-icon">
              <Lock size={16} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small className={password.length >= 8 ? "hint ok" : "hint"}>
              {password.length >= 8 ? <Check size={13} /> : null}
              At least 8 characters{password.length > 0 && password.length < 8 ? ` (${8 - password.length} more)` : ""}
            </small>
          </label>
        </>
      )}

      {error && <div className="alert">{error}</div>}

      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? <LoaderCircle size={16} className="spin" /> : step === "email" ? <Send size={16} /> : <Check size={16} />}
        {step === "email" ? "Email me a code" : "Save new password"}
      </button>

      {step === "code" && (
        <div className="reset-links">
          <button type="button" className="link" onClick={() => sendCode()} disabled={wait > 0 || busy}>
            {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
            }}
          >
            Use another email
          </button>
        </div>
      )}

      <button type="button" className="link reset-back" onClick={onCancel}>
        <ArrowLeft size={15} /> Back to sign in
      </button>
    </form>
  );
}
