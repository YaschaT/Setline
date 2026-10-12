import { providerFor, scanMeal, validRequest } from "../lib/meal-scan";
import { requestEmail } from "./v/_identity";
import { json } from "./v/_shared";

export const config = { runtime: "edge" };

/**
 * The meal photo scan, for whichever client is asking. Signed-in only: the
 * model is paid from the project's monthly credit, which everyone shares.
 */
export default async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED", message: "POST a photo." }, 405);
  const email = await requestEmail(request);
  if (!email) return json({ error: "UNAUTHENTICATED", message: "Sign in to scan a meal." }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const scan = validRequest(body);
  if (!scan) return json({ error: "BAD_REQUEST", message: "Send a photo or a line about what you ate." }, 400);

  // On Vercel the project's own OIDC token arrives with the request: the AI
  // Gateway takes it, so no key has to be kept anywhere.
  const provider = providerFor(process.env, request.headers.get("x-vercel-oidc-token"));
  const outcome = await scanMeal(scan, provider);
  return json(outcome.body, outcome.status);
}
