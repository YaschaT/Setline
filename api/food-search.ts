import { readCookie, readSessionToken, SESSION_COOKIE_NAME } from "../lib/auth-core";
import { searchFood } from "../lib/food-search";
import { json, secret } from "./v/_shared";

export const config = { runtime: "edge" };

/**
 * Product search, for whichever client is asking.
 *
 * Two ways in, one identity. The web app arrives with the signed session
 * cookie it already has; the iOS app arrives with its Supabase access token,
 * which is checked against Supabase itself rather than taken on its face —
 * the same rule `api/v/auth/supabase.ts` follows. Neither client carries a
 * copy of the search: they both get this one.
 */
export default async function handler(request: Request) {
  const email = (await emailFromCookie(request)) ?? (await emailFromBearer(request));
  if (!email) {
    return json({ error: "UNAUTHENTICATED", message: "Log in om producten te zoeken." }, 401);
  }

  const outcome = await searchFood(new URL(request.url).searchParams.get("q"));
  return json(outcome.body, outcome.status);
}

async function emailFromCookie(request: Request): Promise<string | null> {
  try {
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    return token ? await readSessionToken(token, secret()) : null;
  } catch {
    return null;
  }
}

/** Supabase is the authority on whose token this is, and whether it still is. */
async function emailFromBearer(request: Request): Promise<string | null> {
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
