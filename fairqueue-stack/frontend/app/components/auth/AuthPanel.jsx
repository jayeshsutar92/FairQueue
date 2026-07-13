import { useState } from "react";
import { LoginScreen } from "./LoginScreen";
import { SignupScreen } from "./SignupScreen";
import { OtpScreen } from "./OtpScreen";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

export function AuthPanel({ onAuth }) {
  const [authView, setAuthView] = useState("login");

  if (authView === "signup") return <SignupScreen onAuth={onAuth} onNavigate={setAuthView} />;
  if (authView === "otp")    return <OtpScreen    onAuth={onAuth} onNavigate={setAuthView} />;
  if (authView === "forgot") return <ForgotPasswordScreen         onNavigate={setAuthView} />;
  return <LoginScreen onAuth={onAuth} onNavigate={setAuthView} />;
}
