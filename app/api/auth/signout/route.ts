import { clearSessionCookie } from "@/app/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { signedOut: true },
    { status: 200, headers: { "Cache-Control": "no-store", "Set-Cookie": clearSessionCookie() } },
  );
}
