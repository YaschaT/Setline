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
  const { data, error } = await client().auth.signUp({ email, password });
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

const STORAGE_KEY = "yascha-training-v1";
const ONBOARDED_PREFIX = "setline-onboarded-v1";

/**
 * Clears both sessions and this device's copy of the training data.
 *
 * Dropping the local copy matters: it is keyed to nobody in particular, so
 * leaving it behind would show one account's sessions to the next person who
 * signs in here — and worse, the sync effect would then push those sessions up
 * under the new account and overwrite their real data. The cloud copy is
 * untouched, so signing back in restores everything.
 */
export async function signOutEverywhere(): Promise<void> {
  try {
    if (supabase) await supabase.auth.signOut();
  } finally {
    // The cookie must go even if Supabase is unreachable.
    await fetch("/api/auth/signout", { method: "POST", cache: "no-store" }).catch(() => {});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(ONBOARDED_PREFIX)) window.localStorage.removeItem(key);
      }
    } catch {
      // Private browsing or a locked store: the session cookie is already gone,
      // which is what actually ends the session.
    }
  }
}

export { isSupabaseConfigured };
