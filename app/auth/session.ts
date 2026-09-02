import { env } from "cloudflare:workers";

/**
 * Stateless signed session cookie.
 *
 * Payload is `{email, exp}` base64url-encoded and HMAC-SHA256 signed, so a
 * session needs no table and no read on every request. Rotating AUTH_SECRET
 * invalidates every outstanding session, which is the revocation lever.
 */

const COOKIE_NAME = "yascha_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = { email: string; exp: number };

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

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Length-independent comparison; both inputs are our own base64url output. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionCookie(email: string): Promise<string> {
  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(
    await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body)),
  );
  const token = `${body}.${signature}`;

  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** Returns the verified email, or null for a missing, tampered or expired cookie. */
export async function verifySessionCookie(header: string | null): Promise<string | null> {
  const token = readCookie(header, COOKIE_NAME);
  if (!token) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: string;
  try {
    expected = base64UrlEncode(
      await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(body)),
    );
  } catch {
    return null;
  }
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
