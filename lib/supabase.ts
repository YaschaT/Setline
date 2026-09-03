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
        // Setline has no OAuth redirect: nothing ever arrives with tokens in
        // the URL, so parsing it would only be a way to be surprised.
        detectSessionInUrl: false,
      },
    })
  : null;
