import { useState } from "react";
import { api, saveAuth } from "../../lib/api";
import { AuthShell, AuthNotice, PasswordInput, Spinner } from "./ui";

export function LoginScreen({ onAuth, onNavigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
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
        <div className="auth-header">
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-subtitle">Sign in to your FairQueue account</p>
        </div>

        {error && <AuthNotice type="error">{error}</AuthNotice>}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={busy}
              required
            />
          </div>

          <div className="auth-field">
            <div className="auth-label-row">
              <label className="auth-label" htmlFor="login-password">Password</label>
              <button type="button" className="auth-link auth-link--sm" onClick={() => onNavigate("forgot")}>
                Forgot password?
              </button>
            </div>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </div>

          <button className="auth-btn" type="submit" disabled={busy || !email || !password}>
            {busy && <Spinner />}
            Sign in
          </button>
        </form>

        <p className="auth-footer-text">
          Don&apos;t have an account?{" "}
          <button type="button" className="auth-link" onClick={() => onNavigate("signup")}>
            Sign up
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
