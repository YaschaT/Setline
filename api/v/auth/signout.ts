import { clearedSessionCookie } from "../../../lib/auth-core";
import { json } from "../_shared";

export const config = { runtime: "edge" };

export default async function handler() {
  return json({ signedOut: true }, 200, { "Set-Cookie": clearedSessionCookie() });
}
