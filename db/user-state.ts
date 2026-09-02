import { env } from "cloudflare:workers";

export type UserStateRow = {
  user_email: string;
  state_json: string;
  updated_at: string;
};

function database() {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function getUserState(userEmail: string) {
  return database()
    .prepare(
      `SELECT user_email, state_json, updated_at
       FROM user_states
       WHERE user_email = ?1`,
    )
    .bind(userEmail)
    .first<UserStateRow>();
}

export async function upsertUserState(
  userEmail: string,
  stateJson: string,
  updatedAt: string,
) {
  await database()
    .prepare(
      `INSERT INTO user_states (user_email, state_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(user_email) DO UPDATE SET
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
    )
    .bind(userEmail, stateJson, updatedAt)
    .run();
}
