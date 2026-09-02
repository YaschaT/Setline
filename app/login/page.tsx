import type { Metadata } from "next";

import { LoginScreen } from "./login-screen";
import "./login.css";

export const metadata: Metadata = {
  title: "Aanmelden — Yascha Training",
  description: "Meld je aan om je trainingsdata op elk toestel te synchroniseren.",
};

export default function LoginPage() {
  return <LoginScreen />;
}
