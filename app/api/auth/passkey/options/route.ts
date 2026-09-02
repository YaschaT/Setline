import { generateAuthenticationOptions } from "@simplewebauthn/server";

import { insertAuthChallenge, listAuthCredentials } from "@/db/auth";
import { normalizeEmail } from "@/app/auth/otp";
import { CHALLENGE_TTL_MS, getRelyingParty } from "@/app/auth/webauthn";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Challenge for signing in with an existing passkey. */
export async function POST(request: Request) {
  try {
    let email: string | null = null;
    try {
      const payload = (await request.json()) as { email?: unknown };
      email = normalizeEmail(payload.email);
    } catch {
      email = null;
    }

    const { rpID } = await getRelyingParty();

    // With no address we issue a discoverable-credential (usernameless)
    // challenge; the authenticator tells us who it is at verification time.
    const credentials = email ? await listAuthCredentials(email) : [];

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials: credentials.map((credential) => ({
        id: credential.id,
        transports: credential.transports
          ? (JSON.parse(credential.transports) as AuthenticatorTransport[])
          : undefined,
      })),
    });

    const challengeId = crypto.randomUUID();
    await insertAuthChallenge({
      id: challengeId,
      challenge: options.challenge,
      email,
      kind: "authentication",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    return json({ challengeId, options });
  } catch (error) {
    return json(
      {
        error: "PASSKEY_OPTIONS_FAILED",
        message: error instanceof Error ? error.message : "Kon Face ID niet starten.",
      },
      500,
    );
  }
}
