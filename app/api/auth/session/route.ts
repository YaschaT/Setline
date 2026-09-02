import { getCurrentUser } from "@/app/auth/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json(
    user ? { authenticated: true, user } : { authenticated: false },
    { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } },
  );
}
