import { env } from "cloudflare:workers";

/**
 * Google sign-in, OAuth 2.0 authorization-code flow.
 *
 * The verified Google address becomes the session email, so a Google sign-in
 * and an e-mail-code sign-in land on the exact same rows: `user_states` and
 * `progress_photos` key on that address either way.
 */

export type GoogleConfig = { clientId: string; clientSecret: string };

export function googleConfig(): GoogleConfig | null {
  const e = env as { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string };
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET };
}

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/** Decodes the id_token payload. Safe without signature checks ONLY because
 *  the token came straight from Google's token endpoint over TLS, using our
 *  client secret (OpenID Connect Core §3.1.3.7). Never do this for a token
 *  received from a browser. */
export function readIdToken(idToken: string): { email: string; emailVerified: boolean; name?: string } | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const claims = JSON.parse(json) as {
      email?: string;
      email_verified?: boolean | string;
      name?: string;
    };
    if (!claims.email) return null;
    return {
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true || claims.email_verified === "true",
      name: claims.name,
    };
  } catch {
    return null;
  }
}
