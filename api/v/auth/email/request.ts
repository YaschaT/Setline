import { createMagicLinkToken, normalizeEmail } from "../../../../lib/auth-core";
import { json, originOf, secret } from "../../_shared";

export const config = { runtime: "edge" };

/**
 * Sends a signed magic link. Stateless: the link itself carries a short-lived
 * HMAC-signed token, so no row has to be stored and no database is needed.
 */
export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "METHOD" }, 405);

  let email: string | null = null;
  try {
    const body = (await request.json()) as { email?: unknown };
    email = normalizeEmail(body.email);
  } catch {
    return json({ error: "BAD_REQUEST", message: "Ongeldige aanvraag." }, 400);
  }
  if (!email) return json({ error: "INVALID_EMAIL", message: "Dat e-mailadres klopt niet." }, 400);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    return json(
      {
        error: "EMAIL_NOT_CONFIGURED",
        message: "E-mailaanmelden is nog niet ingesteld. Gebruik Google.",
      },
      501,
    );
  }

  try {
    const origin = originOf(request);
    const token = await createMagicLinkToken(email, secret());
    const link = `${origin}/api/auth/email/verify?token=${encodeURIComponent(token)}`;

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Je aanmeldlink voor Yascha Training",
        text:
          `Klik om aan te melden:\n\n${link}\n\n` +
          `De link blijft 15 minuten geldig.\n` +
          `Heb je dit niet aangevraagd? Dan kan je deze mail negeren.\n`,
      }),
    });
    if (!sent.ok) {
      return json({ error: "SEND_FAILED", message: "De mail kon niet verstuurd worden." }, 502);
    }

    // Never reveal whether the address is known.
    return json({ sent: true, mode: "link", expiresInSeconds: 900 });
  } catch {
    return json({ error: "SEND_FAILED", message: "Versturen is mislukt." }, 500);
  }
}
