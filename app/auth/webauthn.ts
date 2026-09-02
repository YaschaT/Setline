import { headers } from "next/headers";

/**
 * Relying-party identity, derived from the request rather than hard-coded so
 * the same build works on localhost, the Sites domain and any preview host.
 * A passkey is bound to its RP ID, so this must match the origin the user
 * enrolled on.
 */
export async function getRelyingParty() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost";
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return {
    rpID: host.split(":")[0],
    origin: `${proto}://${host}`,
    rpName: "Yascha Training",
  };
}

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const CHALLENGE_COOKIE = "yascha_webauthn";
