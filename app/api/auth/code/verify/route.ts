import { bumpAuthCodeAttempts, consumeAuthCode, getLiveAuthCode } from "@/db/auth";
import { createSessionCookie } from "@/app/auth/session";
import { MAX_ATTEMPTS, hashCode, isCodeShaped, normalizeEmail, timingSafeEqualHex } from "@/app/auth/otp";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

const INVALID = { error: "INVALID_CODE", message: "Deze code is niet geldig of verlopen." };

export async function POST(request: Request) {
  let email: string | null = null;
  let code: unknown;
  try {
    const payload = (await request.json()) as { email?: unknown; code?: unknown };
    email = normalizeEmail(payload.email);
    code = payload.code;
  } catch {
    return json({ error: "BAD_REQUEST", message: "Ongeldige aanvraag." }, 400);
  }

  if (!email || !isCodeShaped(code)) return json(INVALID, 400);

  try {
    const now = Date.now();
    const row = await getLiveAuthCode(email, now);
    // Same response for "no code", "wrong code" and "expired": no oracle.
    if (!row) return json(INVALID, 400);

    if (row.attempts >= MAX_ATTEMPTS) {
      await consumeAuthCode(row.id, now);
      return json(
        { error: "TOO_MANY_ATTEMPTS", message: "Te veel pogingen. Vraag een nieuwe code aan." },
        429,
      );
    }

    if (!timingSafeEqualHex(row.code_hash, await hashCode(email, code))) {
      await bumpAuthCodeAttempts(row.id);
      return json(INVALID, 400);
    }

    await consumeAuthCode(row.id, now);
    return json(
      { authenticated: true, user: { email, displayName: email } },
      200,
      { "Set-Cookie": await createSessionCookie(email) },
    );
  } catch (error) {
    return json(
      {
        error: "CODE_VERIFY_FAILED",
        message: error instanceof Error ? error.message : "Verifiëren is mislukt.",
      },
      500,
    );
  }
}
