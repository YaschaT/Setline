import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client for Setline.
 *
 * Both values are public by design: the URL is public and the anon key is the
 * publishable key, gated by row-level security and shipped in the browser
 * bundle either way. They are still read from the environment with no
 * hardcoded fallback, so a misconfigured deploy fails loudly at the login
 * screen instead of silently pointing at someone else's project.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Gates every account feature honestly rather than failing at the first click. */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Left off deliberately. Password-recovery links *do* arrive with a
        // token in the URL, but auto-detection would adopt it on any page load
        // and skip the "choose a new password" step. app/auth/password-recovery.ts
        // reads that link explicitly instead, on the one screen that should.
        detectSessionInUrl: false,
      },
    })
  : null;
