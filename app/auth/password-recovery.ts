"use client";

import { supabase } from "@/lib/supabase";

/**
 * Turns a "wachtwoord vergeten" link into a usable Supabase session.
 *
 * The browser client runs with `detectSessionInUrl: false`, so nothing is ever
 * picked up from the address bar by accident. A recovery link is the one case
 * where a token genuinely does arrive that way, so it is handled here:
 * deliberately, in one place, and only on the screen that is about to ask for a
 * new password. Auto-detection would instead sign the person straight into the
 * app on any page load and skip the new-password step entirely — which is the
 * bug this module exists to close.
 *
 * This client uses Supabase's implicit flow (the library default), which puts
 * the tokens in the URL *fragment*. A project switched to PKCE sends `?code=`
 * instead, so both are accepted and the link keeps working either way.
 */

export type RecoveryLink =
  | { kind: "none" }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string }
  | { kind: "error"; message: string };

const LINK_SPENT = "Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.";

/** Reads the link without touching any state, so callers can branch first. */
export function readRecoveryLink(): RecoveryLink {
  if (typeof window === "undefined") return { kind: "none" };

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const from = (key: string) => hash.get(key) ?? query.get(key);

  // Supabase reports a stale link by redirecting *with* an error rather than by
  // failing the request, so this has to be read before anything else.
  if (from("error_code") || from("error_description")) {
    return { kind: "error", message: LINK_SPENT };
  }

  if (from("type") === "recovery") {
    const accessToken = from("access_token") ?? "";
    const refreshToken = from("refresh_token") ?? "";
    if (accessToken && refreshToken) return { kind: "tokens", accessToken, refreshToken };
    return { kind: "error", message: LINK_SPENT };
  }

  const code = query.get("code");
  if (code) return { kind: "code", code };

  return { kind: "none" };
}

/**
 * Takes the token out of the address bar.
 *
 * A recovery token is a bearer credential: leaving it in the URL means it sits
 * in history, gets re-applied on refresh, and rides along in any link the page
 * opens. It is removed as soon as it has been exchanged.
 */
function scrubUrl(): void {
  try {
    window.history.replaceState({}, "", window.location.pathname);
  } catch {
    // A blocked history API is not a reason to abandon the reset.
  }
}

/**
 * Exchanges a recovery link for a session and returns the account it belongs to.
 * The session is deliberately short-lived: it exists only to authorize the
 * password change that immediately follows.
 */
export async function startRecovery(link: RecoveryLink): Promise<string> {
  if (!supabase) throw new Error("Accounts zijn nog niet aangesloten.");

  if (link.kind === "tokens") {
    const { data, error } = await supabase.auth.setSession({
      access_token: link.accessToken,
      refresh_token: link.refreshToken,
    });
    scrubUrl();
    // Every way a link can fail here — expired, already used, tampered with —
    // means the same thing to the person holding it, and Supabase says so in
    // words like "invalid JWT: unable to parse or verify signature". A thrown
    // network error is left alone so "check your internet" still gets through.
    if (error) throw new Error(LINK_SPENT);
    return data.user?.email ?? "";
  }

  if (link.kind === "code") {
    const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
    scrubUrl();
    if (error) throw new Error(LINK_SPENT);
    return data.user?.email ?? "";
  }

  throw new Error(LINK_SPENT);
}
