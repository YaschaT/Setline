import { searchFood } from "../lib/food-search";
import { requestEmail } from "./v/_identity";
import { json } from "./v/_shared";

export const config = { runtime: "edge" };

/**
 * Product search, for whichever client is asking.
 *
 * Two ways in, one identity. The web app arrives with the signed session
 * cookie it already has; the iOS app arrives with its Supabase access token,
 * which is checked against Supabase itself rather than taken on its face —
 * the same rule `api/v/auth/supabase.ts` follows. Neither client carries a
 * copy of the search: they both get this one.
 */
export default async function handler(request: Request) {
  const email = await requestEmail(request);
  if (!email) {
    return json({ error: "UNAUTHENTICATED", message: "Log in om producten te zoeken." }, 401);
  }

  const outcome = await searchFood(new URL(request.url).searchParams.get("q"));
  return json(outcome.body, outcome.status);
}
