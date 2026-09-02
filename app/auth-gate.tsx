"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Sends unauthenticated visitors to /login before the app renders.
 *
 * The app holds personal training data, so it should not paint before we know
 * who is looking. While the check is in flight nothing is rendered, which also
 * avoids a flash of the dashboard on a signed-out device.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed">("checking");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          setState("allowed");
          return;
        }
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
      })
      .catch(() => {
        // No auth backend reachable (offline, or a host without one): fall
        // back to the app rather than trapping someone on a login screen
        // that cannot succeed.
        if (!cancelled) setState("allowed");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return <div style={{ minHeight: "100dvh", background: "#060908" }} aria-hidden="true" />;
  }
  return <>{children}</>;
}
