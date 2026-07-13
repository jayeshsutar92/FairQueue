import { useState, useRef, useEffect } from "react";

export function Button({ children, className = "", ...props }) {
  return (
    <button className={`btn ${className}`} {...props}>
      {children}
    </button>
  );
}

// ─── Auth icon helpers (inline SVG, zero dependencies) ─────────────────────

export function IconEye({ off = false }) {
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

export function IconArrowLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

// ─── Shared auth primitives ──────────────────────────────────────────────────

export function Spinner() {
  return <span className="auth-spinner" aria-hidden="true" />;
}

export function AuthNotice({ type, children }) {
  return (
    <div className={`auth-notice auth-notice--${type}`} role={type === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function authSuccessMessage(message) {
  const messages = {
    otp_sent: "OTP sent. Check your email for the 6-digit code.",
    if_account_exists_otp_sent: "If an account exists, an OTP has been sent to your email.",
    otp_verified: "OTP verified.",
  };
  return messages[message] || message || "Success";
}

export function PasswordInput({ id, value, onChange, placeholder = "••••••••", autoComplete = "current-password", disabled = false }) {
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

export function OtpInput({ value, onChange, autoFocusFirstCell = false }) {
  const inputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = value.padEnd(6, "").split("").slice(0, 6);

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

export function AuthShell({ children }) {
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
