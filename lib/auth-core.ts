/**
 * Platform-neutral auth primitives.
 *
 * Pure Web Crypto, no Cloudflare or Node imports, so the same code runs in a
 * Worker, a Vercel Edge function and the browser-side test harness. Anything
 * that needs a binding (D1, env lookup) stays in the caller.
 */

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Constant-time compare over our own base64url output. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Signs an arbitrary payload as `<body>.<signature>`. */
export async function signPayload(payload: unknown, secret: string): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)),
  );
  return `${body}.${signature}`;
}

/** Verifies a token produced by signPayload. Returns null on any mismatch. */
export async function verifyPayload<T>(token: string, secret: string): Promise<T | null> {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let expected: string;
  try {
    expected = base64UrlEncode(
      await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body)),
    );
  } catch {
    return null;
  }
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- *
 * Sessions
 * ---------------------------------------------------------------- */

export const SESSION_COOKIE_NAME = "yascha_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = { email: string; exp: number };

export async function createSessionToken(email: string, secret: string): Promise<string> {
  return signPayload(
    { email, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS } satisfies SessionPayload,
    secret,
  );
}

export async function readSessionToken(token: string, secret: string): Promise<string | null> {
  const payload = await verifyPayload<SessionPayload>(token, secret);
  if (!payload || typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload.email;
}

export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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

/* ---------------------------------------------------------------- *
 * Magic links — a stateless alternative to a stored one-time code
 * ---------------------------------------------------------------- */

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export type MagicLinkPayload = { email: string; exp: number; nonce: string };

export async function createMagicLinkToken(email: string, secret: string): Promise<string> {
  return signPayload(
    {
      email,
      exp: Math.floor(Date.now() / 1000) + MAGIC_LINK_TTL_SECONDS,
      nonce: base64UrlEncode(crypto.getRandomValues(new Uint8Array(12))),
    } satisfies MagicLinkPayload,
    secret,
  );
}

export async function readMagicLinkToken(token: string, secret: string): Promise<string | null> {
  const payload = await verifyPayload<MagicLinkPayload>(token, secret);
  if (!payload || typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload.email;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
