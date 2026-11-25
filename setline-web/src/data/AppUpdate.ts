// Keeps an open app on the newest version.
//
// A tab left open, or the home-screen app iOS keeps alive in the background,
// goes on running the code it first loaded: it never asks for the page again.
// So the app asks for /version.json — when it comes back on screen, and every
// ten minutes while it is — and compares it with the build it is running.
// A newer one reloads the app at once when that is safe (back on screen, no
// workout open); during a workout it waits, and a small banner offers it.
import { useEffect, useRef, useState } from "react";

const everyMs = 10 * 60 * 1000;
const backOnScreenGapMs = 30 * 1000;

async function newestBuild(): Promise<string | undefined> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { build?: unknown };
    return typeof body.build === "string" ? body.build : undefined;
  } catch {
    return undefined;
  }
}

/** `true` once a newer version is deployed than the one running. `busy`: a workout is open, so no reload now. */
export function useAppUpdate(busy: boolean): { ready: boolean; reload: () => void } {
  const [ready, setReady] = useState(false);
  // Read when a check lands, never a reason to check: a workout ending is not
  // the app coming back on screen, and must not reload it under someone.
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    // Only a deployed build has a /version.json to compare with.
    if (!import.meta.env.PROD) return;
    let lastCheck = 0;
    const check = async (backOnScreen: boolean) => {
      lastCheck = Date.now();
      const newest = await newestBuild();
      if (newest === undefined || newest === __SETLINE_BUILD__) return;
      if (backOnScreen && !busyRef.current) {
        window.location.reload();
        return;
      }
      setReady(true);
    };
    // Opened from the background: the moment to update without anyone noticing.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > backOnScreenGapMs) void check(true);
    };
    void check(true);
    const timer = window.setInterval(() => void check(false), everyMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  return { ready, reload: () => window.location.reload() };
}
