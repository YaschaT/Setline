"use client";

import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";

const LoginScreen = lazy(() =>
  import("./login/login-screen").then((m) => ({ default: m.LoginScreen })),
);

/** A slow or hanging session check must never leave a blank screen forever. */
const SESSION_TIMEOUT_MS = 6000;

/**
 * Decides between the app and the login screen before anything paints.
 *
 * It renders the login screen in place rather than redirecting: a redirect
 * costs a second full page load, which on a phone is seconds of blank screen.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let settled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

    const finish = (next: "allowed" | "denied") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      setState(next);
    };

    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => finish(response.ok ? "allowed" : "denied"))
      // Timed out, offline, or no auth backend: show the app rather than
      // trapping someone behind a check that cannot answer.
      .catch(() => finish("allowed"));

    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  if (state === "checking") return null; // index.html paints the splash
  if (state === "denied") {
    return (
      <Suspense fallback={null}>
        <LoginScreen />
      </Suspense>
    );
  }
  return <>{children}</>;
}
