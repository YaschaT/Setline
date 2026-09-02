import { takeAuthChallenge } from "@/db/auth";
import { createSessionCookie } from "@/app/auth/session";
import { getRelyingParty } from "@/app/auth/webauthn";
import { GOOGLE_TOKEN_ENDPOINT, googleConfig, readIdToken, redirectUri } from "@/app/auth/google";

export const dynamic = "force-dynamic";

function fail(reason: string, origin: string) {
  return Response.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`, 302);
}

export async function GET(request: Request) {
  const { origin } = await getRelyingParty();
  const config = googleConfig();
  if (!config) return fail("Google-aanmelden is niet ingesteld.", origin);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail("Google-aanmelden is afgebroken.", origin);
  if (!code || !state) return fail("Google gaf een onvolledig antwoord.", origin);

  const challenge = await takeAuthChallenge(state, Date.now());
  if (!challenge || challenge.kind !== "oauth") return fail("Deze aanmeldpoging is verlopen.", origin);

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri(origin),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return fail("Google wees de aanmelding af.", origin);

    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) return fail("Google gaf geen identiteit terug.", origin);

    const identity = readIdToken(tokens.id_token);
    if (!identity) return fail("Google-identiteit kon niet gelezen worden.", origin);
    if (!identity.emailVerified) return fail("Dit Google-adres is niet geverifieerd.", origin);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${origin}/`,
        "Cache-Control": "no-store",
        "Set-Cookie": await createSessionCookie(identity.email),
      },
    });
  } catch {
    return fail("Aanmelden met Google is mislukt.", origin);
  }
}
