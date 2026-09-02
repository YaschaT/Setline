import { insertAuthChallenge } from "@/db/auth";
import { CHALLENGE_TTL_MS, getRelyingParty } from "@/app/auth/webauthn";
import { GOOGLE_AUTH_ENDPOINT, googleConfig, redirectUri } from "@/app/auth/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const { origin } = await getRelyingParty();

  const config = googleConfig();
  if (!config) {
    // Send them back to a usable screen rather than a raw error document.
    return Response.redirect(
      `${origin}/login?error=${encodeURIComponent("Google-aanmelden is nog niet ingesteld op deze server.")}`,
      302,
    );
  }

  // `state` is single-use and stored server-side: it is the CSRF defence.
  const state = crypto.randomUUID();
  await insertAuthChallenge({
    id: state,
    challenge: state,
    email: null,
    kind: "oauth",
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return Response.redirect(url.toString(), 302);
}
