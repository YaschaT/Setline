import { env } from "cloudflare:workers";

/**
 * Sends the one-time code.
 *
 * Resend is used when RESEND_API_KEY is present. Without it the code is
 * logged server-side so the flow is fully exercisable in development — it is
 * never returned to the client, which would defeat the second factor.
 */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  const apiKey = (env as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  const from = (env as { AUTH_EMAIL_FROM?: string }).AUTH_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      `[auth] RESEND_API_KEY/AUTH_EMAIL_FROM not set — not sending mail. ` +
        `Code for ${email}: ${code}`,
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is je Yascha Training code`,
      text:
        `Je code is ${code}.\n\n` +
        `Hij blijft 10 minuten geldig en werkt één keer.\n` +
        `Heb je dit niet aangevraagd? Dan kan je deze mail negeren.\n`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`E-mail versturen is mislukt (${response.status}). ${detail.slice(0, 200)}`);
  }
}
