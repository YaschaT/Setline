import { readCookie, readSessionToken, SESSION_COOKIE_NAME } from "../../lib/auth-core";
import { secret } from "./_shared";

/**
 * Who is asking, for any route both clients use. The web app arrives with
 * the signed session cookie it already has; the iOS app arrives with its
 * Supabase access token, checked against Supabase itself rather than taken
 * on its face — the same rule `api/v/auth/supabase.ts` follows.
 */
export async function requestEmail(request: Request): Promise<string | null> {
  return (await emailFromCookie(request)) ?? (await emailFromBearer(request));
}

export async function emailFromCookie(request: Request): Promise<string | null> {
  try {
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    return token ? await readSessionToken(token, secret()) : null;
  } catch {
    return null;
  }
}

/** Supabase is the authority on whose token this is, and whether it still is. */
export async function emailFromBearer(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const accessToken = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!accessToken) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { email?: unknown };
    return typeof user.email === "string" ? user.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}
