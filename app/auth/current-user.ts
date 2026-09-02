import { headers } from "next/headers";

import { verifySessionCookie } from "./session";

export type CurrentUser = {
  email: string;
  displayName: string;
};

/**
 * Single entry point for "who is calling".
 *
 * One mechanism: our own signed session cookie, set by Google sign-in, an
 * e-mail code, or a passkey. All three resolve to a verified e-mail address,
 * which is what every row in the database keys on.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const requestHeaders = await headers();
  const email = await verifySessionCookie(requestHeaders.get("cookie"));
  if (!email) return null;
  return { email, displayName: email };
}
