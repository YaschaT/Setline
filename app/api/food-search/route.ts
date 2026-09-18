import { getCurrentUser } from "@/app/auth/current-user";
import { searchFood } from "@/lib/food-search";

export const dynamic = "force-dynamic";

/**
 * The Cloudflare-side door to one shared search (`lib/food-search.ts`).
 *
 * The Vercel twin (`api/food-search.ts`) is the one iOS and the deployed web
 * app use; both call the same code, so neither can drift from the other.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "UNAUTHENTICATED", message: "Log in om producten te zoeken." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const outcome = await searchFood(new URL(request.url).searchParams.get("q"));
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
