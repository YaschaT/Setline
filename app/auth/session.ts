import { env } from "cloudflare:workers";

import {
  SESSION_COOKIE_NAME,
  base64UrlEncode,
  clearedSessionCookie,
  createSessionToken,
  readCookie,
  readSessionToken,
  sessionCookie,
} from "@/lib/auth-core";

/**
 * Worker-side session handling.
 *
 * The signing itself lives in lib/auth-core so the Worker routes and the
 * Vercel Edge functions cannot drift apart; only the secret lookup is
 * platform-specific.
 */

/**
 * Dev fallback: a per-isolate random key. Sessions do not survive a worker
 * restart without AUTH_SECRET, which is the point — a hard-coded default
 * secret must never ship.
 */
let devSecret: string | null = null;

function secret(): string {
  const configured = (env as { AUTH_SECRET?: string }).AUTH_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (configured) {
    throw new Error("AUTH_SECRET is set but shorter than 32 characters.");
  }
  if (!devSecret) {
    devSecret = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    console.warn(
      "[auth] AUTH_SECRET is not set. Using an ephemeral development key; " +
        "sessions will not survive a restart. Set AUTH_SECRET before deploying.",
    );
  }
  return devSecret;
}

export async function createSessionCookie(email: string): Promise<string> {
  return sessionCookie(await createSessionToken(email, secret()));
}

export function clearSessionCookie(): string {
  return clearedSessionCookie();
}

/** Returns the verified email, or null for a missing, tampered or expired cookie. */
export async function verifySessionCookie(header: string | null): Promise<string | null> {
  const token = readCookie(header, SESSION_COOKIE_NAME);
  if (!token) return null;
  try {
    return await readSessionToken(token, secret());
  } catch {
    return null;
  }
}

export { readCookie, SESSION_COOKIE_NAME };
