import { useState } from "react";
import { api, saveAuth } from "../../lib/api";
import { AuthShell, AuthNotice, PasswordInput, Spinner } from "./ui";

export function SignupScreen({ onAuth, onNavigate }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, name, password }),
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
          <h2 className="auth-title">Create account</h2>
          <p className="auth-subtitle">Join FairQueue and book your seat</p>
        </div>

        {error && <AuthNotice type="error">{error}</AuthNotice>}

        <form className="auth-form" onSubmit={submit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              type="text"
              className="auth-input"
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              disabled={busy}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
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
            <label className="auth-label" htmlFor="signup-password">Password</label>
            <PasswordInput
              id="signup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={busy}
            />
          </div>

          <button className="auth-btn" type="submit" disabled={busy || !email || !password}>
            {busy && <Spinner />}
            Create account
          </button>
        </form>

        <p className="auth-footer-text">
          Already have an account?{" "}
          <button type="button" className="auth-link" onClick={() => onNavigate("login")}>
            Sign in
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
