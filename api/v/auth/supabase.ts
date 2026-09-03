import { createSessionToken, sessionCookie } from "../../../lib/auth-core";
import { json, secret } from "../_shared";

export const config = { runtime: "edge" };

/**
 * Exchanges a Supabase access token for our own signed session cookie.
 *
 * Vercel-side twin of app/api/auth/supabase/route.ts. The token is never
 * trusted on its face: Supabase's own /auth/v1/user endpoint is the authority
 * on whether it is valid, unexpired and whose it is. Only the e-mail Supabase
 * confirms is written into the cookie, so every route keeps authorizing on one
 * verified identity.
 */
export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED", message: "Ongeldige aanvraag." }, 405);
  }

  let accessToken: unknown;
  try {
    const payload = (await request.json()) as { accessToken?: unknown };
    accessToken = payload.accessToken;
  } catch {
    return json({ error: "BAD_REQUEST", message: "Ongeldige aanvraag." }, 400);
  }

  if (typeof accessToken !== "string" || !accessToken) {
    return json({ error: "BAD_REQUEST", message: "Ongeldige aanvraag." }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return json(
      { error: "AUTH_NOT_CONFIGURED", message: "Accounts zijn nog niet aangesloten op deze server." },
      503,
    );
  }

  let email: string | null = null;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: anonKey },
      cache: "no-store",
    });
    if (!response.ok) {
      return json(
        { error: "INVALID_TOKEN", message: "Deze aanmelding is niet meer geldig. Meld je opnieuw aan." },
        401,
      );
    }
    const user = (await response.json()) as { email?: unknown };
    email = typeof user.email === "string" ? user.email.trim().toLowerCase() : null;
  } catch {
    return json(
      { error: "AUTH_UNREACHABLE", message: "We krijgen geen verbinding met de accountservice." },
      502,
    );
  }

  if (!email) {
    return json(
      { error: "NO_EMAIL", message: "Dit account heeft geen e-mailadres om je data aan te koppelen." },
      400,
    );
  }

  // Confirmation is enforced by the Supabase project itself, which refuses to
  // issue a session for an unconfirmed address when that setting is on.
  return json(
    { authenticated: true, user: { email, displayName: email } },
    200,
    { "Set-Cookie": sessionCookie(await createSessionToken(email, secret())) },
  );
}
