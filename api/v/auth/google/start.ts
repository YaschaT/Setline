import { signPayload } from "../../../../lib/auth-core";
import { googleConfig, originOf, secret } from "../../_shared";

export const config = { runtime: "edge" };

/**
 * Stateless CSRF: `state` is a short-lived signed token rather than a stored
 * row, so this needs no database. The callback verifies the signature and the
 * expiry before exchanging the code.
 */
export default async function handler(request: Request) {
  const origin = originOf(request);
  const google = googleConfig();

  if (!google) {
    return Response.redirect(
      `${origin}/login?error=${encodeURIComponent("Google-aanmelden is nog niet ingesteld op deze server.")}`,
      302,
    );
  }

  let state: string;
  try {
    state = await signPayload({ k: "oauth", exp: Math.floor(Date.now() / 1000) + 600 }, secret());
  } catch {
    return Response.redirect(
      `${origin}/login?error=${encodeURIComponent("Server is niet volledig ingesteld (AUTH_SECRET ontbreekt).")}`,
      302,
    );
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", google.clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return Response.redirect(url.toString(), 302);
}
