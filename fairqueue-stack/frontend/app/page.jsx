"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? "https://fairqueue.onrender.com"
    : "http://localhost:8000");
const WS_BASE = API_BASE.replace(/^http(s?):\/\//, "ws$1://");
const AUTH_KEY = "fairqueue.auth";

async function api(path, options = {}) {
  const { token, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(fetchOptions.headers || {}),
    },
    ...fetchOptions,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || `HTTP ${res.status}`);
  return data;
}

function loadAuth() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
}

function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

function Button({ children, className = "", ...props }) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
    </button>
  );
}

// ─── Auth icon helpers (inline SVG, zero dependencies) ─────────────────────

function IconEye({ off = false }) {
  return off ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

// ─── Shared auth primitives ──────────────────────────────────────────────────

function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

function AuthNotice({ type, children }) {
  return (
    <div className={`auth-notice auth-notice--${type}`} role={type === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder = "••••••••", autoComplete = "current-password", disabled = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="auth-input-group">
      <input
        id={id}
        type={show ? "text" : "password"}
        className="auth-input"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        required
      />
      <button
        type="button"
        className="auth-input-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        <IconEye off={show} />
      </button>
    </div>
  );
}

function OtpInput({ value, onChange, autoFocusFirstCell = false }) {
  const inputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = value.padEnd(6, "").split("").slice(0, 6);

  // Imperatively focus after conditional mount — autoFocus attr only fires
  // on initial page load, not when a component mounts later via {otpSent && …}
  useEffect(() => {
    if (autoFocusFirstCell) {
      inputRefs[0].current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusFirstCell]);

  function handleChange(i, e) {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = char;
    onChange(next.join("").trimEnd());
    if (char && i < 5) inputRefs[i + 1].current?.focus();
  }

  function handleKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs[i - 1].current?.focus();
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs[focusIdx].current?.focus();
    e.preventDefault();
  }

  return (
    <div className="auth-otp-grid" role="group" aria-label="One-time password">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={inputRefs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          className={`auth-otp-cell${d ? " filled" : ""}`}
          value={d}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  );
}


// ─── AuthShell — shared card wrapper ────────────────────────────────────────

function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">FQ</div>
          <span className="auth-logo-name">FairQueue</span>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Login screen ────────────────────────────────────────────────────────────

function LoginScreen({ onAuth, onNavigate }) {
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

        <div className="auth-divider"><span>or</span></div>

        <button
          type="button"
          className="auth-btn auth-btn--outline"
          onClick={() => onNavigate("otp")}
          disabled={busy}
        >
          Login with OTP
        </button>

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

// ─── Signup screen ───────────────────────────────────────────────────────────

function SignupScreen({ onAuth, onNavigate }) {
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

// ─── OTP login screen ────────────────────────────────────────────────────────

function OtpScreen({ onAuth, onNavigate }) {
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
      setMessage("OTP sent to your email. Enter the 6-digit code below.");
      if (result.dev_otp) setDevOtp(result.dev_otp);
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
        {devOtp && <AuthNotice type="dev">Dev OTP: <strong>{devOtp}</strong></AuthNotice>}

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


// ─── Forgot password screen ──────────────────────────────────────────────────

function ForgotPasswordScreen({ onNavigate }) {
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
        {devOtp && <AuthNotice type="dev">Dev OTP: <strong>{devOtp}</strong></AuthNotice>}

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

// ─── AuthPanel — screen router ───────────────────────────────────────────────

function AuthPanel({ onAuth }) {
  const [authView, setAuthView] = useState("login");

  if (authView === "signup") return <SignupScreen onAuth={onAuth} onNavigate={setAuthView} />;
  if (authView === "otp")    return <OtpScreen    onAuth={onAuth} onNavigate={setAuthView} />;
  if (authView === "forgot") return <ForgotPasswordScreen         onNavigate={setAuthView} />;
  return <LoginScreen onAuth={onAuth} onNavigate={setAuthView} />;
}

function TrainCard({ train, onJoin }) {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{train.name}</h3>
          <div className="muted">#{train.number}</div>
        </div>
        <strong>{train.date}</strong>
      </div>
      <div className="route">
        <div>
          <strong>{train.departure}</strong>
          <div className="muted">{train.source}</div>
        </div>
        <div>
          <div className="route-line" />
          <div className="muted">{train.duration}</div>
        </div>
        <div className="right">
          <strong>{train.arrival}</strong>
          <div className="muted">{train.dest}</div>
        </div>
      </div>
      <p>{train.coaches * train.seats_per_coach} demo seats across {train.coaches} coaches.</p>
      <Button className="full" onClick={() => onJoin(train)}>
        Join Queue
      </Button>
    </article>
  );
}

function Metrics({ status }) {
  return (
    <div className="metric-grid">
      <div className="metric">
        <span>Status</span>
        <strong>{status.status}</strong>
      </div>
      <div className="metric">
        <span>Position</span>
        <strong>{status.position || 0}</strong>
      </div>
      <div className="metric">
        <span>Waiting</span>
        <strong>{status.queue_depth || 0}</strong>
      </div>
      <div className="metric">
        <span>ETA</span>
        <strong>{status.eta_seconds || 0}s</strong>
      </div>
    </div>
  );
}

function SeatPicker({ session, token, onLocked }) {
  const [seats, setSeats] = useState([]);
  const [error, setError] = useState("");
  const [busySeat, setBusySeat] = useState("");

  async function loadSeats() {
    try {
      const data = await api(`/trains/${session.trainId}/seats`);
      setSeats(data.seats);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSeats();
    const timer = setInterval(loadSeats, 2500);
    return () => clearInterval(timer);
  }, [session.trainId]);

  const coaches = useMemo(() => {
    const grouped = new Map();
    for (const seat of seats) {
      if (!grouped.has(seat.coach)) grouped.set(seat.coach, []);
      grouped.get(seat.coach).push(seat);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [seats]);

  async function lock(seat) {
    setBusySeat(seat.id);
    setError("");
    try {
      const result = await api("/seats/lock", {
        token,
        method: "POST",
        body: JSON.stringify({
          train_id: session.trainId,
          seat_id: seat.id,
        }),
      });
      onLocked({ seat, lock: result });
    } catch (err) {
      setError(err.message);
      await loadSeats();
    } finally {
      setBusySeat("");
    }
  }

  return (
    <section className="panel">
      <h2>Pick a Seat</h2>
      <p>Available seats can be locked once you are admitted. Locks use Redis `SET NX EX` and expire automatically.</p>
      {error && <div className="notice">{error}</div>}
      {coaches.map(([coach, list]) => (
        <div className="seat-section" key={coach}>
          <h3>{coach}</h3>
          <div className="seat-grid">
            {list
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => {
                const booked = seat.status === "booked";
                const locked = seat.locked && !booked;
                return (
                  <button
                    key={seat.id}
                    className={`seat ${locked ? "locked" : ""} ${booked ? "booked" : ""}`}
                    disabled={booked || locked || busySeat === seat.id}
                    onClick={() => lock(seat)}
                    title={booked ? "Booked" : locked ? `Locked by ${seat.locked_by}` : "Lock seat"}
                  >
                    {seat.seat_number}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

function Payment({ session, token, locked, onDone, onRelease }) {
  const [name, setName] = useState("Demo Passenger");
  const [age, setAge] = useState(30);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ttl, setTtl] = useState(locked.lock.ttl || 0);

  useEffect(() => {
    const timer = setInterval(() => setTtl((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/payment/process", {
        token,
        method: "POST",
        body: JSON.stringify({
          train_id: session.trainId,
          seat_id: locked.seat.id,
          passenger_name: name,
          passenger_age: Number(age),
        }),
      });
      onDone(result.booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Confirm Booking</h2>
      <p>Seat {locked.seat.label} is locked for this session. Mock payment finalizes the database booking atomically.</p>
      <div className="metric-grid">
        <div className="metric">
          <span>Seat</span>
          <strong>{locked.seat.label}</strong>
        </div>
        <div className="metric">
          <span>Lock TTL</span>
          <strong>{ttl}s</strong>
        </div>
        <div className="metric">
          <span>Fare</span>
          <strong>1499</strong>
        </div>
        <div className="metric">
          <span>Flow</span>
          <strong>Mock</strong>
        </div>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="form">
        <div className="field">
          <label>Passenger name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label>Passenger age</label>
          <input type="number" value={age} onChange={(event) => setAge(event.target.value)} />
        </div>
        <div className="row">
          <Button className="secondary" disabled={busy} onClick={onRelease}>
            Release
          </Button>
          <Button disabled={busy || ttl <= 0} onClick={pay}>
            Pay and Book
          </Button>
        </div>
      </div>
    </section>
  );
}

function BookingFlow({ auth }) {
  const [trains, setTrains] = useState([]);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [locked, setLocked] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const wsRef = useRef(null);

  useEffect(() => {
    api("/trains").then((data) => setTrains(data.trains)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!session || status?.status !== "waiting") return;
    const ws = new WebSocket(`${WS_BASE}/ws/queue?train_id=${session.trainId}&token=${encodeURIComponent(auth.token)}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const next = JSON.parse(event.data);
      setStatus(next);
      if (next.status === "admitted") ws.close();
    };
    ws.onerror = () => setError("WebSocket disconnected; use Refresh Status if needed.");
    return () => ws.close();
  }, [session, status?.status]);

  async function join(train) {
    setError("");
    setLocked(null);
    setBooking(null);
    try {
      const result = await api("/queue/join", {
        token: auth.token,
        method: "POST",
        body: JSON.stringify({ train_id: train.id }),
      });
      setSession({ userId: result.user_id, trainId: train.id, trainName: train.name });
      setStatus(result);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshStatus() {
    if (!session) return;
    const result = await api(`/queue/status?train_id=${session.trainId}`, { token: auth.token });
    setStatus(result);
  }

  async function release() {
    await api("/seats/release", {
      token: auth.token,
      method: "POST",
      body: JSON.stringify({ seat_id: locked.seat.id }),
    }).catch(() => null);
    setLocked(null);
  }

  function reset() {
    wsRef.current?.close();
    setSession(null);
    setStatus(null);
    setLocked(null);
    setBooking(null);
    setError("");
  }

  if (booking) {
    return (
      <section className="panel">
        <h2>Booking Confirmed</h2>
        <p>Payment {booking.payment_id} confirmed seat {booking.seat_label} for {booking.passenger.name}.</p>
        <Button onClick={reset}>Book Another</Button>
      </section>
    );
  }

  if (locked) {
    return <Payment session={session} token={auth.token} locked={locked} onDone={setBooking} onRelease={release} />;
  }

  if (session && status?.status === "admitted") {
    return <SeatPicker session={session} token={auth.token} onLocked={setLocked} />;
  }

  if (session) {
    return (
      <section className="panel">
        <h2>Waiting Room</h2>
        <p>Session {session.userId.slice(0, 8)} is queued for {session.trainName}. WebSocket updates arrive every 1.5 seconds.</p>
        {status && <Metrics status={status} />}
        {error && <div className="notice">{error}</div>}
        <div className="row">
          <Button className="secondary" onClick={refreshStatus}>
            Refresh Status
          </Button>
          <Button className="secondary" onClick={reset}>
            Start Over
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>FairQueue</h1>
            <p>
            A fairness-first ticket booking simulator inspired by high-concurrency systems like IRCTC Tatkal. Built to explore scalable queueing, concurrent booking control, and real-time traffic handling under heavy demand.
            </p>
          </div>
          <div className="panel">
            <h2>Distributed Systems Demo</h2>
            <p>Simulates virtual queueing, controlled batch admission, temporary seat locking, rate limiting, and live booking workflows using Redis, FastAPI, PostgreSQL, and Next.js.</p>
          </div>
        </div>
      </section>
      {error && <div className="notice">{error}</div>}
      <section className="grid trains">
        {trains.map((train) => (
          <TrainCard key={train.id} train={train} onJoin={join} />
        ))}
      </section>
    </>
  );
}

function Admin({ auth }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    if (auth.user.role !== "admin") return;
    try {
      const nextStats = await api("/admin/stats", { token: auth.token });
      setStats(nextStats);
      const userData = await api("/admin/users", { token: auth.token });
      setUsers(userData.users);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  async function reset() {
    await api("/admin/reset", { token: auth.token, method: "POST", body: JSON.stringify({}) });
    await load();
  }

  async function deleteUser(userId) {
    await api(`/admin/users/${userId}`, { token: auth.token, method: "DELETE" });
    await load();
  }

  if (auth.user.role !== "admin") {
    return (
      <section className="panel">
        <h2>Admin Only</h2>
        <p>Your account can book tickets, but admin stats and user deletion require an admin role.</p>
      </section>
    );
  }

  if (!stats) return <section className="panel">Loading admin stats...</section>;

  return (
    <section className="panel">
      <div className="row">
        <div>
          <h2>Admin Stats</h2>
          <p>Redis counters, queue depth, active locks, and Postgres totals.</p>
        </div>
        <Button className="danger" onClick={reset}>
          Reset Demo
        </Button>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="metric-grid">
        <div className="metric">
          <span>Joined</span>
          <strong>{stats.stats.total_joined}</strong>
        </div>
        <div className="metric">
          <span>Admitted</span>
          <strong>{stats.stats.total_admitted}</strong>
        </div>
        <div className="metric">
          <span>Booked</span>
          <strong>{stats.stats.total_booked}</strong>
        </div>
        <div className="metric">
          <span>Rate Limited</span>
          <strong>{stats.stats.total_rate_limited}</strong>
        </div>
      </div>
      <div className="list">
        {Object.entries(stats.queues).map(([trainId, queue]) => (
          <div className="row" key={trainId}>
            <span>{trainId}</span>
            <span>waiting {queue.waiting || 0} / admitted {queue.admitted || 0}</span>
          </div>
        ))}
        <div className="row">
          <span>Database</span>
          <span>
            {stats.db.trains} trains, {stats.db.seats_booked}/{stats.db.seats_total} seats booked, {stats.db.bookings} bookings
          </span>
        </div>
        <div className="row">
          <span>Active locks</span>
          <span>{stats.active_lock_count}</span>
        </div>
      </div>
      <h3>User Management</h3>
      <div className="list">
        {users.map((user) => (
          <div className="row" key={user.id}>
            <span>{user.email} ({user.role})</span>
            <Button className="danger" disabled={user.id === auth.user.id} onClick={() => deleteUser(user.id)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [tab, setTab] = useState("book");
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    setAuth(loadAuth());
  }, []);

  function logout() {
    clearAuth();
    setAuth(null);
    setTab("book");
  }

  if (!auth) return <AuthPanel onAuth={setAuth} />;

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <div className="brand-mark">FQ</div>
            <span>FairQueue</span>
          </div>
          <div className="muted hide-sm">{auth.user.email}</div>
          <nav className="tabs">
            <button className={`tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>
              Book
            </button>
            <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>
              Admin
            </button>
            <button className="tab" onClick={logout}>
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="shell">{tab === "book" ? <BookingFlow auth={auth} /> : <Admin auth={auth} />}</main>
    </>
  );
}
