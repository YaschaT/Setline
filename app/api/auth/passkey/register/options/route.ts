import { generateRegistrationOptions } from "@simplewebauthn/server";

import { insertAuthChallenge, listAuthCredentials } from "@/db/auth";
import { getCurrentUser } from "@/app/auth/current-user";
import { CHALLENGE_TTL_MS, getRelyingParty } from "@/app/auth/webauthn";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Enrolling a passkey requires an existing session: you prove who you are first. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return json({ error: "UNAUTHENTICATED", message: "Meld je eerst aan met een e-mailcode." }, 401);
  }

  try {
    const { rpID, rpName } = await getRelyingParty();
    const existing = await listAuthCredentials(user.email);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.displayName,
      attestationType: "none",
      // Platform authenticator + resident key is what makes this Face ID
      // rather than a security key, and what enables usernameless sign-in.
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
      excludeCredentials: existing.map((credential) => ({ id: credential.id })),
    });

    const challengeId = crypto.randomUUID();
    await insertAuthChallenge({
      id: challengeId,
      challenge: options.challenge,
      email: user.email,
      kind: "registration",
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });

    return json({ challengeId, options });
  } catch (error) {
    return json(
      {
        error: "PASSKEY_REGISTER_OPTIONS_FAILED",
        message: error instanceof Error ? error.message : "Kon Face ID niet instellen.",
      },
      500,
    );
  }
}
