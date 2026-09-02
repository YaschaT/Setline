import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

import { getAuthCredential, takeAuthChallenge, touchAuthCredential } from "@/db/auth";
import { createSessionCookie } from "@/app/auth/session";
import { getRelyingParty } from "@/app/auth/webauthn";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const FAILED = { error: "PASSKEY_REJECTED", message: "Face ID is niet gelukt. Probeer een e-mailcode." };

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      challengeId?: unknown;
      response?: AuthenticationResponseJSON;
    };
    if (typeof payload.challengeId !== "string" || !payload.response) return json(FAILED, 400);

    const challenge = await takeAuthChallenge(payload.challengeId, Date.now());
    if (!challenge || challenge.kind !== "authentication") return json(FAILED, 400);

    const credential = await getAuthCredential(payload.response.id);
    if (!credential) return json(FAILED, 400);

    // A challenge issued for one address must not authenticate another.
    if (challenge.email && challenge.email !== credential.user_email) return json(FAILED, 400);

    const { rpID, origin } = await getRelyingParty();
    const verification = await verifyAuthenticationResponse({
      response: payload.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: Uint8Array.from(atob(credential.public_key), (c) => c.charCodeAt(0)),
        counter: credential.counter,
        transports: credential.transports
          ? (JSON.parse(credential.transports) as AuthenticatorTransport[])
          : undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) return json(FAILED, 401);

    await touchAuthCredential(
      credential.id,
      verification.authenticationInfo.newCounter,
      Date.now(),
    );

    return json(
      { authenticated: true, user: { email: credential.user_email, displayName: credential.user_email } },
      200,
      { "Set-Cookie": await createSessionCookie(credential.user_email) },
    );
  } catch {
    return json(FAILED, 400);
  }
}
