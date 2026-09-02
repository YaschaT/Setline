import {
  base64UrlDecode,
  createSessionToken,
  sessionCookie,
  verifyPayload,
} from "../../../../lib/auth-core";
import { googleConfig, originOf, secret } from "../../_shared";

export const config = { runtime: "edge" };

function fail(origin: string, reason: string) {
  return Response.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`, 302);
}

/** Reads the id_token payload. Safe without a signature check ONLY because it
 *  came straight from Google's token endpoint over TLS with our client secret
 *  (OpenID Connect Core §3.1.3.7). Never do this for a browser-supplied token. */
function readIdToken(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as {
      email?: string;
      email_verified?: boolean | string;
    };
    if (!claims.email) return null;
    return {
      email: claims.email.toLowerCase(),
      verified: claims.email_verified === true || claims.email_verified === "true",
    };
  } catch {
    return null;
  }
}

export default async function handler(request: Request) {
  const origin = originOf(request);
  const google = googleConfig();
  if (!google) return fail(origin, "Google-aanmelden is niet ingesteld.");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return fail(origin, "Google-aanmelden is afgebroken.");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail(origin, "Google gaf een onvolledig antwoord.");

  let key: string;
  try {
    key = secret();
  } catch {
    return fail(origin, "Server is niet volledig ingesteld (AUTH_SECRET ontbreekt).");
  }

  const stateClaims = await verifyPayload<{ k: string; exp: number }>(state, key);
  if (!stateClaims || stateClaims.k !== "oauth" || stateClaims.exp * 1000 < Date.now()) {
    return fail(origin, "Deze aanmeldpoging is verlopen. Probeer opnieuw.");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: google.clientId,
        client_secret: google.clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return fail(origin, "Google wees de aanmelding af.");

    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) return fail(origin, "Google gaf geen identiteit terug.");

    const identity = readIdToken(tokens.id_token);
    if (!identity) return fail(origin, "Google-identiteit kon niet gelezen worden.");
    if (!identity.verified) return fail(origin, "Dit Google-adres is niet geverifieerd.");

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/`,
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(await createSessionToken(identity.email, key)),
      },
    });
  } catch {
    return fail(origin, "Aanmelden met Google is mislukt.");
  }
}
