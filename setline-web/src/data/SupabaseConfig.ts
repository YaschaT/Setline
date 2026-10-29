// SupabaseConfig.swift. Supabase project configuration, read at build time.
//
// Both values are public by design (they ship in the bundle), the same ones
// the iOS app reads from Setline.xcconfig. When either is missing the app
// says accounts are not connected rather than offering a form that cannot work.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export const SupabaseConfig = {
  fromBundle(): SupabaseConfig | undefined {
    const raw = (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ?? "";
    const key = (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? "";
    if (!raw || !key) return undefined;
    return { url: (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/$/, ""), anonKey: key };
  },
};

/**
 * Where the web app with the shared product search and meal scan lives. This
 * app is served from that same site, so it is this origin ("" → "/api/…").
 */
export interface WebAppConfig {
  url: string;
}

export const WebAppConfig = {
  fromBundle(): WebAppConfig | undefined {
    return { url: "" };
  },
};
