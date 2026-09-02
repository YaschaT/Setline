import { googleConfig } from "@/app/auth/google";

export const dynamic = "force-dynamic";

/** Lets the login screen show only the methods this deployment can actually
 *  complete, instead of offering a button that dead-ends. */
export async function GET() {
  return Response.json(
    { google: googleConfig() !== null, code: true, passkey: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
