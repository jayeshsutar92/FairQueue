import { useState } from "react";
import { api } from "../../lib/api";
import { AuthShell, AuthNotice, PasswordInput, OtpInput, Spinner, IconArrowLeft } from "./ui";

export function ForgotPasswordScreen({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1); // 1 = enter email, 2 = enter OTP + new password

  async function requestReset() {
    if (!email) return;
    setBusy(true);
    setError("");
    setMessage("");
    setDevOtp("");
    try {
      const result = await api("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message || "Reset code sent to your email");
      if (result.dev_otp) setDevOtp(result.dev_otp);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (otp.length < 6) { setError("Please enter the complete 6-digit code"); return; }
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ email, otp, new_password: newPassword }),
      });
      onNavigate("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="auth-screen">
        <button type="button" className="auth-back" onClick={() => onNavigate("login")}>
          <IconArrowLeft /> Back to login
        </button>

        <div className="auth-header">
          <h2 className="auth-title">Forgot password?</h2>
          <p className="auth-subtitle">
            {step === 1
              ? "Enter your email to receive a reset code"
              : "Enter the code and choose a new password"}
          </p>
        </div>

        {error && <AuthNotice type="error">{error}</AuthNotice>}
        {message && <AuthNotice type="success">{message}</AuthNotice>}
        {devOtp && (
          <button
            type="button"
            className="auth-notice auth-notice--dev"
            style={{ cursor: "pointer", width: "100%", textAlign: "left" }}
            title="Click to auto-fill reset code"
            onClick={() => setOtp(devOtp)}
          >
            🛠 Dev OTP (click to fill): <strong style={{ letterSpacing: "0.15em" }}>{devOtp}</strong>
          </button>
        )}

        {step === 1 ? (
          <div className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="forgot-email">Email address</label>
              <input
                id="forgot-email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={busy}
              />
            </div>
            <button
              type="button"
              className="auth-btn"
              onClick={requestReset}
              disabled={busy || !email}
            >
              {busy && <Spinner />}
              Send reset code
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="auth-field">
              <label className="auth-label">6-digit reset code</label>
              <OtpInput value={otp} onChange={setOtp} />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="forgot-newpw">New password</label>
              <PasswordInput
                id="forgot-newpw"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                disabled={busy}
              />
            </div>

            <button className="auth-btn" type="submit" disabled={busy || otp.length < 6 || !newPassword}>
              {busy && <Spinner />}
              Reset password
            </button>

            <button
              type="button"
              className="auth-btn auth-btn--outline"
              onClick={() => { setStep(1); setOtp(""); setMessage(""); setError(""); }}
              disabled={busy}
            >
              Back — resend code
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
