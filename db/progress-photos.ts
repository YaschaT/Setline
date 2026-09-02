import { env } from "cloudflare:workers";

export type ProgressPhotoRow = {
  id: string;
  captured_on: string;
  weight: number;
  object_key: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  owner_email: string | null;
};

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

const SCREENSHOT_SERVICE_EMAIL = "sites-screenshot-service-noreply@chatgpt.com";

export async function claimLegacyProgressPhotos(ownerEmail: string) {
  // Automated Site previews must never become the owner of legacy uploads.
  if (ownerEmail.toLowerCase() === SCREENSHOT_SERVICE_EMAIL) return;

  await database()
    .prepare(
      `UPDATE progress_photos
       SET owner_email = ?1
       WHERE owner_email IS NULL OR owner_email = ?2`,
    )
    .bind(ownerEmail, SCREENSHOT_SERVICE_EMAIL)
    .run();
}

export async function listProgressPhotos(ownerEmail: string) {
  const result = await database()
    .prepare(
      `SELECT id, captured_on, weight, object_key, content_type, size_bytes, created_at, owner_email
       FROM progress_photos
       WHERE owner_email = ?1
       ORDER BY captured_on ASC, created_at ASC`,
    )
    .bind(ownerEmail)
    .all<ProgressPhotoRow>();
  return result.results;
}

export async function getProgressPhoto(id: string, ownerEmail: string) {
  return database()
    .prepare(
      `SELECT id, captured_on, weight, object_key, content_type, size_bytes, created_at, owner_email
       FROM progress_photos
       WHERE id = ?1 AND owner_email = ?2`,
    )
    .bind(id, ownerEmail)
    .first<ProgressPhotoRow>();
}

export async function getProgressPhotoByDate(capturedOn: string, ownerEmail: string) {
  return database()
    .prepare(`SELECT id FROM progress_photos WHERE captured_on = ?1 AND owner_email = ?2`)
    .bind(capturedOn, ownerEmail)
    .first<{ id: string }>();
}

export async function insertProgressPhoto(row: ProgressPhotoRow) {
  await database()
    .prepare(
      `INSERT INTO progress_photos
       (id, captured_on, weight, object_key, content_type, size_bytes, created_at, owner_email)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      row.id,
      row.captured_on,
      row.weight,
      row.object_key,
      row.content_type,
      row.size_bytes,
      row.created_at,
      row.owner_email,
    )
    .run();
}

export async function deleteProgressPhoto(id: string, ownerEmail: string) {
  await database()
    .prepare(`DELETE FROM progress_photos WHERE id = ?1 AND owner_email = ?2`)
    .bind(id, ownerEmail)
    .run();
}
