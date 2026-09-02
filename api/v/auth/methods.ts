import { googleConfig, json } from "../_shared";

export const config = { runtime: "edge" };

/** The login screen offers only what this deployment can actually complete. */
export default async function handler() {
  return json({
    google: googleConfig() !== null,
    code: Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM),
    passkey: false,
  });
}
