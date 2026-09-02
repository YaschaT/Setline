import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { insertAuthCredential, takeAuthChallenge } from "@/db/auth";
import { getCurrentUser } from "@/app/auth/current-user";
import { getRelyingParty } from "@/app/auth/webauthn";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const FAILED = { error: "PASSKEY_REGISTER_REJECTED", message: "Face ID instellen is niet gelukt." };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return json({ error: "UNAUTHENTICATED", message: "Meld je eerst aan met een e-mailcode." }, 401);
  }

  try {
    const payload = (await request.json()) as {
      challengeId?: unknown;
      response?: RegistrationResponseJSON;
      label?: unknown;
    };
    if (typeof payload.challengeId !== "string" || !payload.response) return json(FAILED, 400);

    const challenge = await takeAuthChallenge(payload.challengeId, Date.now());
    if (!challenge || challenge.kind !== "registration") return json(FAILED, 400);
    if (challenge.email !== user.email) return json(FAILED, 400);

    const { rpID, origin } = await getRelyingParty();
    const verification = await verifyRegistrationResponse({
      response: payload.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) return json(FAILED, 400);

    const { credential } = verification.registrationInfo;
    await insertAuthCredential({
      id: credential.id,
      userEmail: user.email,
      publicKey: toBase64(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      label: typeof payload.label === "string" ? payload.label.slice(0, 60) : null,
      createdAt: Date.now(),
    });

    return json({ registered: true, credentialId: credential.id });
  } catch (error) {
    return json(
      { ...FAILED, detail: error instanceof Error ? error.message : undefined },
      400,
    );
  }
}
