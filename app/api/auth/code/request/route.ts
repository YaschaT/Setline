import {
  consumeOutstandingAuthCodes,
  countRecentAuthCodes,
  deleteExpiredAuthCodes,
  insertAuthCode,
} from "@/db/auth";
import { sendLoginCode } from "@/app/auth/email";
import {
  CODE_TTL_MS,
  MAX_SENDS_PER_HOUR,
  generateCode,
  hashCode,
  normalizeEmail,
} from "@/app/auth/otp";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let email: string | null = null;
  try {
    const payload = (await request.json()) as { email?: unknown };
    email = normalizeEmail(payload.email);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Ongeldige aanvraag." }, 400);
  }

  if (!email) {
    return json({ error: "INVALID_EMAIL", message: "Dat e-mailadres klopt niet." }, 400);
  }

  try {
    const now = Date.now();
    await deleteExpiredAuthCodes(now);

    if ((await countRecentAuthCodes(email, now - 60 * 60 * 1000)) >= MAX_SENDS_PER_HOUR) {
      return json(
        { error: "RATE_LIMITED", message: "Te veel codes aangevraagd. Probeer het over een uur opnieuw." },
        429,
      );
    }

    const code = generateCode();
    await consumeOutstandingAuthCodes(email, now);
    await insertAuthCode({
      id: crypto.randomUUID(),
      email,
      codeHash: await hashCode(email, code),
      expiresAt: now + CODE_TTL_MS,
      createdAt: now,
    });

    await sendLoginCode(email, code);

    // Never echo the code, and never reveal whether the address is known.
    return json({ sent: true, expiresInSeconds: CODE_TTL_MS / 1000 });
  } catch (error) {
    return json(
      {
        error: "CODE_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "Code versturen is mislukt.",
      },
      500,
    );
  }
}
