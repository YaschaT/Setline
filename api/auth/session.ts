import { readCookie, readSessionToken, SESSION_COOKIE_NAME } from "../../lib/auth-core";
import { json, secret } from "../_shared";

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  try {
    const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
    const email = token ? await readSessionToken(token, secret()) : null;
    return email
      ? json({ authenticated: true, user: { email, displayName: email } })
      : json({ authenticated: false }, 401);
  } catch {
    return json({ authenticated: false }, 401);
  }
}
