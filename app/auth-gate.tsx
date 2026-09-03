"use client";

import { Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from "react";

import { claimLocalState } from "./auth/supabase-auth";
import { loadCloudState } from "@/lib/cloud-state";

const LoginScreen = lazy(() =>
  import("./login/login-screen").then((m) => ({ default: m.LoginScreen })),
);
const OnboardingFlow = lazy(() =>
  import("./onboarding/onboarding-flow").then((m) => ({ default: m.OnboardingFlow })),
);

/** A slow or hanging session check must never leave a blank screen forever. */
const SESSION_TIMEOUT_MS = 6000;
const STORAGE_KEY = "yascha-training-v1";
const ONBOARDED_PREFIX = "setline-onboarded-v1";

type Stage = "checking" | "login" | "setup" | "app";

type StateShape = {
  sessions?: unknown[];
  metrics?: unknown[];
  scheduleOverrides?: Record<string, unknown>;
} | null;

/** A plan, a schedule or logged sessions means this account is already set up. */
function isSetUp(state: StateShape): boolean {
  if (!state) return false;
  return Boolean(
    (state.sessions?.length ?? 0) > 0 ||
      (state.metrics?.length ?? 0) > 0 ||
      Object.keys(state.scheduleOverrides ?? {}).length > 0,
  );
}

function onboardedKey(email: string) {
  return `${ONBOARDED_PREFIX}:${email.toLowerCase()}`;
}

function readLocalState(): StateShape {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StateShape) : null;
  } catch {
    return null;
  }
}

export function markOnboarded(email: string) {
  try {
    window.localStorage.setItem(onboardedKey(email), "1");
  } catch {
    // The flag is only a fast path; cloud state remains the real answer.
  }
}

/**
 * Decides between the app, first-run setup and the login screen before
 * anything paints.
 *
 * It renders each in place rather than redirecting: a redirect costs a second
 * full page load, which on a phone is seconds of blank screen.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>("checking");
  const [email, setEmail] = useState("");

  /**
   * The cloud is the authority on whether setup already happened, not this
   * device. Opening the app on a phone after setting it up on a laptop must
   * land in the app, not run setup a second time over the top of real data.
   */
  const resolveStage = useCallback(async (accountEmail: string): Promise<Stage> => {
    if (accountEmail) {
      claimLocalState(accountEmail);
      try {
        if (window.localStorage.getItem(onboardedKey(accountEmail)) === "1") return "app";
      } catch {
        // Fall through to the network answer.
      }
    }

    // Supabase is the store that exists in every deployment; the D1 route only
    // exists on Cloudflare, so it is a fallback rather than the answer.
    try {
      const cloud = await loadCloudState();
      if (isSetUp((cloud?.state ?? null) as StateShape)) {
        if (accountEmail) markOnboarded(accountEmail);
        return "app";
      }
    } catch {
      // Fall through to the D1 route, then to this device.
    }

    try {
      const response = await fetch("/api/user-state", { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { authenticated?: boolean; state?: StateShape };
        if (payload.authenticated && isSetUp(payload.state ?? null)) {
          if (accountEmail) markOnboarded(accountEmail);
          return "app";
        }
      }
    } catch {
      // Offline: fall back to whatever this device already holds.
    }

    return isSetUp(readLocalState()) ? "app" : "setup";
  }, []);

  const admit = useCallback(
    (accountEmail?: string) => {
      const next = accountEmail ?? email;
      setEmail(next);
      setStage("checking");
      void resolveStage(next).then(setStage);
    },
    [email, resolveStage],
  );

  useEffect(() => {
    let settled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);

    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (settled) return;
        clearTimeout(timer);
        if (!response.ok) {
          settled = true;
          setStage("login");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          user?: { email?: string };
        };
        const accountEmail = payload.user?.email ?? "";
        setEmail(accountEmail);
        const next = await resolveStage(accountEmail);
        if (settled) return;
        settled = true;
        setStage(next);
      })
      // Timed out, offline, or no auth backend: show the app rather than
      // trapping someone behind a check that cannot answer.
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setStage(isSetUp(readLocalState()) ? "app" : "setup");
      });

    return () => {
      settled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [resolveStage]);

  if (stage === "checking") return null; // index.html paints the splash

  if (stage === "login") {
    return (
      <Suspense fallback={null}>
        <LoginScreen onAuthenticated={(accountEmail) => admit(accountEmail)} />
      </Suspense>
    );
  }

  if (stage === "setup") {
    return (
      <Suspense fallback={null}>
        <OnboardingFlow
          email={email}
          onDone={() => {
            if (email) markOnboarded(email);
            setStage("app");
          }}
        />
      </Suspense>
    );
  }

  return <>{children}</>;
}
