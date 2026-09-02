/** Shared helpers for the one-time-code flow. */

const CODE_LENGTH = 6;

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 5;

/** Uniform over 000000-999999; rejection sampling avoids modulo bias. */
export function generateCode(): string {
  const limit = 10 ** CODE_LENGTH;
  const ceiling = Math.floor(0xffffffff / limit) * limit;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= ceiling);
  return String(value % limit).padStart(CODE_LENGTH, "0");
}

/** Binding the address into the hash stops a code being replayed for another. */
export async function hashCode(email: string, code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${email}:${code}`),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  // Deliberately permissive: delivery is the real validator.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function isCodeShaped(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value);
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
