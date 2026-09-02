import { env } from "cloudflare:workers";

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

/* ---------------------------------------------------------------- *
 * One-time codes
 * ---------------------------------------------------------------- */

export type AuthCodeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  consumed_at: number | null;
};

export async function insertAuthCode(row: {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: number;
  createdAt: number;
}) {
  await database()
    .prepare(
      `INSERT INTO auth_codes (id, email, code_hash, expires_at, attempts, consumed_at, created_at)
       VALUES (?1, ?2, ?3, ?4, 0, NULL, ?5)`,
    )
    .bind(row.id, row.email, row.codeHash, row.expiresAt, row.createdAt)
    .run();
}

/** Newest unconsumed, unexpired code for an address. */
export async function getLiveAuthCode(email: string, now: number) {
  return database()
    .prepare(
      `SELECT id, email, code_hash, expires_at, attempts, consumed_at
       FROM auth_codes
       WHERE email = ?1 AND consumed_at IS NULL AND expires_at > ?2
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(email, now)
    .first<AuthCodeRow>();
}

export async function countRecentAuthCodes(email: string, since: number): Promise<number> {
  const row = await database()
    .prepare(`SELECT COUNT(*) AS n FROM auth_codes WHERE email = ?1 AND created_at > ?2`)
    .bind(email, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function bumpAuthCodeAttempts(id: string) {
  await database()
    .prepare(`UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?1`)
    .bind(id)
    .run();
}

export async function consumeAuthCode(id: string, at: number) {
  await database()
    .prepare(`UPDATE auth_codes SET consumed_at = ?2 WHERE id = ?1`)
    .bind(id, at)
    .run();
}

/** Invalidate outstanding codes so a fresh send supersedes the old one. */
export async function consumeOutstandingAuthCodes(email: string, at: number) {
  await database()
    .prepare(`UPDATE auth_codes SET consumed_at = ?2 WHERE email = ?1 AND consumed_at IS NULL`)
    .bind(email, at)
    .run();
}

export async function deleteExpiredAuthCodes(before: number) {
  await database().prepare(`DELETE FROM auth_codes WHERE expires_at < ?1`).bind(before).run();
}

/* ---------------------------------------------------------------- *
 * WebAuthn challenges
 * ---------------------------------------------------------------- */

export type AuthChallengeRow = {
  id: string;
  challenge: string;
  email: string | null;
  kind: string;
  expires_at: number;
};

export async function insertAuthChallenge(row: {
  id: string;
  challenge: string;
  email: string | null;
  kind: "authentication" | "registration" | "oauth";
  expiresAt: number;
}) {
  await database()
    .prepare(
      `INSERT INTO auth_challenges (id, challenge, email, kind, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5)`,
    )
    .bind(row.id, row.challenge, row.email, row.kind, row.expiresAt)
    .run();
}

export async function takeAuthChallenge(id: string, now: number) {
  const row = await database()
    .prepare(
      `SELECT id, challenge, email, kind, expires_at
       FROM auth_challenges
       WHERE id = ?1 AND expires_at > ?2`,
    )
    .bind(id, now)
    .first<AuthChallengeRow>();

  // Single use, whatever the outcome of verification.
  if (row) {
    await database().prepare(`DELETE FROM auth_challenges WHERE id = ?1`).bind(id).run();
  }
  return row;
}

export async function deleteExpiredAuthChallenges(before: number) {
  await database().prepare(`DELETE FROM auth_challenges WHERE expires_at < ?1`).bind(before).run();
}

/* ---------------------------------------------------------------- *
 * Passkey credentials
 * ---------------------------------------------------------------- */

export type AuthCredentialRow = {
  id: string;
  user_email: string;
  public_key: string;
  counter: number;
  transports: string | null;
  label: string | null;
};

export async function insertAuthCredential(row: {
  id: string;
  userEmail: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  label: string | null;
  createdAt: number;
}) {
  await database()
    .prepare(
      `INSERT INTO auth_credentials
         (id, user_email, public_key, counter, transports, label, created_at, last_used_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`,
    )
    .bind(row.id, row.userEmail, row.publicKey, row.counter, row.transports, row.label, row.createdAt)
    .run();
}

export async function getAuthCredential(id: string) {
  return database()
    .prepare(
      `SELECT id, user_email, public_key, counter, transports, label
       FROM auth_credentials
       WHERE id = ?1`,
    )
    .bind(id)
    .first<AuthCredentialRow>();
}

export async function listAuthCredentials(userEmail: string): Promise<AuthCredentialRow[]> {
  const result = await database()
    .prepare(
      `SELECT id, user_email, public_key, counter, transports, label
       FROM auth_credentials
       WHERE user_email = ?1`,
    )
    .bind(userEmail)
    .all<AuthCredentialRow>();
  return (result.results ?? []) as AuthCredentialRow[];
}

export async function touchAuthCredential(id: string, counter: number, at: number) {
  await database()
    .prepare(`UPDATE auth_credentials SET counter = ?2, last_used_at = ?3 WHERE id = ?1`)
    .bind(id, counter, at)
    .run();
}

export async function deleteAuthCredential(id: string, userEmail: string) {
  await database()
    .prepare(`DELETE FROM auth_credentials WHERE id = ?1 AND user_email = ?2`)
    .bind(id, userEmail)
    .run();
}
