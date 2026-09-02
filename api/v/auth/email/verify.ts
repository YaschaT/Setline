import { createSessionToken, readMagicLinkToken, sessionCookie } from "../../../../lib/auth-core";
import { originOf, secret } from "../../_shared";

export const config = { runtime: "edge" };

/** Consumes the magic link and starts the session. */
export default async function handler(request: Request) {
  const origin = originOf(request);
  const token = new URL(request.url).searchParams.get("token");

  const bounce = (reason: string) =>
    Response.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`, 302);

  if (!token) return bounce("Deze link is onvolledig.");

  let key: string;
  try {
    key = secret();
  } catch {
    return bounce("Server is niet volledig ingesteld (AUTH_SECRET ontbreekt).");
  }

  const email = await readMagicLinkToken(token, key);
  if (!email) return bounce("Deze link is niet geldig of verlopen. Vraag een nieuwe aan.");

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/`,
      "Cache-Control": "no-store",
      "Set-Cookie": sessionCookie(await createSessionToken(email, key)),
    },
  });
}
