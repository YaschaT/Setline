import { createSessionCookie } from "@/app/auth/session";
import { normalizeEmail } from "@/app/auth/otp";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Exchanges a Supabase access token for our own signed session cookie.
 *
 * The token is never trusted on its face: we hand it back to Supabase's
 * /auth/v1/user endpoint, which is the authority on whether it is valid,
 * unexpired and whose it is. Only the e-mail Supabase confirms is written into
 * the cookie, so the rest of the app keeps authorizing on one verified
 * identity — see app/auth/current-user.ts.
 */
export async function POST(request: Request) {
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
      {
        error: "AUTH_NOT_CONFIGURED",
        message: "Accounts zijn nog niet aangesloten op deze server.",
      },
      503,
    );
  }

  let email: string | null = null;
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return json(
        { error: "INVALID_TOKEN", message: "Deze aanmelding is niet meer geldig. Meld je opnieuw aan." },
        401,
      );
    }
    const user = (await response.json()) as { email?: unknown };
    email = normalizeEmail(user.email);
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

  // Confirmation is deliberately not required here: it is enforced (or not) by
  // the Supabase project itself, which refuses to issue a session for an
  // unconfirmed address when the setting is on. Setline runs it off, because
  // Supabase's built-in mailer is rate-limited enough to lock a single user out
  // of their own app.
  //
  // The trade-off to know about: e-mail is the key every row in D1 is stored
  // under, so with confirmation off, an address that has never registered could
  // be claimed by whoever registers it first. Turn confirmation back on in the
  // Supabase dashboard if Setline ever serves more than one person.

  return json(
    { authenticated: true, user: { email, displayName: email } },
    200,
    { "Set-Cookie": await createSessionCookie(email) },
  );
}
