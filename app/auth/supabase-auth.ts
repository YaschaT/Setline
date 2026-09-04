"use client";

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export class AuthNotConfiguredError extends Error {
  constructor() {
    super("Accounts zijn nog niet aangesloten. Zet NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_ANON_KEY en herstart de app.");
    this.name = "AuthNotConfiguredError";
  }
}

function client() {
  if (!supabase) throw new AuthNotConfiguredError();
  return supabase;
}

/**
 * Hands the verified Supabase identity to our own backend, which mints the
 * first-party signed session cookie every server route already authorizes on.
 *
 * Supabase is the front door; `app/auth/current-user.ts` stays the single
 * answer to "who is calling", so /api/user-state, photos and the coach keep
 * working untouched.
 */
async function adoptSession(accessToken: string): Promise<void> {
  const response = await fetch("/api/auth/supabase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "Je bent aangemeld, maar de sessie kon niet worden opgezet.";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      // Keep the fallback message.
    }
    throw new Error(message);
  }
}

export type SignUpResult = {
  /** False when the project requires e-mail confirmation: Supabase still returns
   *  a user, so callers must check this rather than the user object. */
  hasSession: boolean;
};

export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    // Without this, Supabase sends people to whatever Site URL the project was
    // created with — which is localhost until someone changes it by hand.
    options: { emailRedirectTo: `${window.location.origin}/login` },
  });
  if (error) throw error;
  if (data.session) {
    await adoptSession(data.session.access_token);
    return { hasSession: true };
  }
  return { hasSession: false };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("Aanmelden lukte, maar er kwam geen sessie terug.");
  await adoptSession(data.session.access_token);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}

/**
 * Sets the new password once a recovery link has been exchanged for a session,
 * then mints the first-party cookie so the person lands in the app already
 * signed in rather than being asked to type the password they just chose.
 */
export async function updatePassword(password: string): Promise<string> {
  const { data, error } = await client().auth.updateUser({ password });
  if (error) throw error;

  const { data: sessionData } = await client().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error("Je wachtwoord is aangepast, maar de sessie kon niet worden opgezet. Meld je aan met je nieuwe wachtwoord.");
  }
  await adoptSession(accessToken);
  return data.user?.email ?? "";
}

const ONBOARDED_PREFIX = "setline-onboarded-v1";

/**
 * Clears both sessions, and nothing else.
 *
 * An earlier version wiped this device's training data on sign-out to stop one
 * account inheriting another's. That was the wrong trade: the Vercel build has
 * no server-side store, so the local copy is sometimes the only copy, and
 * signing out threw it away. Ownership is handled where it belongs instead —
 * the data is tagged with the account that wrote it, and only dropped when a
 * *different* account signs in. See claimLocalState.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
  } finally {
    // The cookie must go even if Supabase is unreachable.
    await fetch("/api/auth/signout", { method: "POST", cache: "no-store" }).catch(() => {});
  }
}

const STORAGE_KEY = "yascha-training-v1";
const OWNER_KEY = "setline-account-v1";

/**
 * Hands this device's saved data to whoever just signed in.
 *
 * Same account as last time: keep everything, so settings survive a sign-out.
 * Different account: drop it, so nobody sees the previous person's sessions and
 * the sync never pushes them up under the wrong account.
 */
export function claimLocalState(email: string): void {
  const account = email.trim().toLowerCase();
  if (!account) return;
  try {
    const previous = window.localStorage.getItem(OWNER_KEY);
    if (previous && previous !== account) {
      window.localStorage.removeItem(STORAGE_KEY);
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(ONBOARDED_PREFIX)) window.localStorage.removeItem(key);
      }
    }
    window.localStorage.setItem(OWNER_KEY, account);
  } catch {
    // Private browsing: the session cookie still governs access.
  }
}

export { isSupabaseConfigured };
