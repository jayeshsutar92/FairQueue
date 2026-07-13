import { useState } from "react";
import { api } from "../../lib/api";
import { AuthShell, AuthNotice, PasswordInput, Spinner, IconArrowLeft } from "./ui";

export function ForgotPasswordScreen({ onNavigate }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1); // 1 = enter email, 2 = enter OTP, 3 = new password

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
      if (result.dev_otp) {
        setDevOtp(result.dev_otp);
        setMessage(`Your OTP is: ${result.dev_otp}`);
      } else {
        setMessage("Reset code sent to your email");
      }
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function proceedToNewPassword() {
    if (otp.length < 6) { setError("Please enter the complete 6-digit code"); return; }
    setError("");
    setMessage("");
    setStep(3);
  }

  async function submit(e) {
    e.preventDefault();
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

  const subtitles = {
    1: "Enter your email to receive a reset code",
    2: "Enter the 6-digit code sent to your email",
    3: "Choose a new password",
  };

  return (
    <AuthShell>
      <div className="auth-screen">
        <button type="button" className="auth-back" onClick={() => onNavigate("login")}>
          <IconArrowLeft /> Back to login
        </button>

        <div className="auth-header">
          <h2 className="auth-title">Forgot password?</h2>
          <p className="auth-subtitle">{subtitles[step]}</p>
        </div>

        {error && <AuthNotice type="error">{error}</AuthNotice>}
        {message && <AuthNotice type="success">{message}</AuthNotice>}


        {step === 1 && (
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
        )}

        {step === 2 && (
          <div className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="forgot-otp">OTP</label>
              <input
                id="forgot-otp"
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
            <button
              type="button"
              className="auth-btn"
              onClick={proceedToNewPassword}
              disabled={otp.length < 6}
            >
              Verify code
            </button>
            <button
              type="button"
              className="auth-btn auth-btn--outline"
              onClick={() => { setStep(1); setOtp(""); setMessage(""); setError(""); setDevOtp(""); }}
              disabled={busy}
            >
              Back — resend code
            </button>
          </div>
        )}

        {step === 3 && (
          <form className="auth-form" onSubmit={submit} noValidate>
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

            <button className="auth-btn" type="submit" disabled={busy || !newPassword}>
              {busy && <Spinner />}
              Reset password
            </button>

            <button
              type="button"
              className="auth-btn auth-btn--outline"
              onClick={() => { setStep(2); setError(""); }}
              disabled={busy}
            >
              Back — change code
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
