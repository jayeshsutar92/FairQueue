import { useState } from "react";
import { api, saveAuth } from "../../lib/api";
import { AuthShell, AuthNotice, Spinner, IconArrowLeft, authSuccessMessage } from "./ui";

export function OtpScreen({ onAuth, onNavigate }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  async function sendOtp() {
    if (!email) return;
    setBusy(true);
    setError("");
    setMessage("");
    setDevOtp("");
    try {
      const result = await api("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      if (result.dev_otp) {
        setDevOtp(result.dev_otp);
        setMessage(`Your OTP is: ${result.dev_otp}`);
      } else {
        setMessage(authSuccessMessage(result.message));
      }
      setOtpSent(true);
      setOtp("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (otp.length < 6) { setError("Please enter the complete 6-digit OTP"); return; }
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      const next = { token: result.access_token, user: result.user };
      saveAuth(next);
      onAuth(next);
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
          <h2 className="auth-title">OTP Login</h2>
          <p className="auth-subtitle">We&apos;ll send a one-time code to your email</p>
        </div>

        {error && <AuthNotice type="error">{error}</AuthNotice>}
        {message && <AuthNotice type="success">{message}</AuthNotice>}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="otp-email">Email address</label>
            <div className="auth-input-row">
              <input
                id="otp-email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setOtpSent(false); setOtp(""); setMessage(""); setDevOtp(""); }}
                autoComplete="email"
                disabled={busy}
                required
              />
              <button
                type="button"
                className="auth-btn auth-btn--sm auth-btn--outline"
                onClick={sendOtp}
                disabled={busy || !email}
              >
                {busy && !otpSent ? <Spinner /> : null}
                {otpSent ? "Resend" : "Send OTP"}
              </button>
            </div>
          </div>

          {otpSent && (
            <>
              <div className="auth-field">
                <label className="auth-label" htmlFor="otp-input">OTP</label>
                <input
                  id="otp-input"
                  type="text"
                  className="auth-input"
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                  required
                />
              </div>
              <button className="auth-btn" type="submit" disabled={busy || otp.length < 6}>
                {busy && <Spinner />}
                Verify &amp; Sign in
              </button>
            </>
          )}
        </form>
      </div>
    </AuthShell>
  );
}
