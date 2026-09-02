import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const progressPhotos = sqliteTable(
  "progress_photos",
  {
    id: text("id").primaryKey(),
    capturedOn: text("captured_on").notNull(),
    weight: real("weight").notNull(),
    objectKey: text("object_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: text("created_at").notNull(),
    ownerEmail: text("owner_email"),
  },
  (table) => [
    uniqueIndex("progress_photos_owner_date_unique").on(table.ownerEmail, table.capturedOn),
    uniqueIndex("progress_photos_object_key_unique").on(table.objectKey),
    index("progress_photos_created_at_idx").on(table.createdAt),
  ],
);

export const userStates = sqliteTable(
  "user_states",
  {
    userEmail: text("user_email").primaryKey(),
    stateJson: text("state_json").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("user_states_updated_at_idx").on(table.updatedAt)],
);

/* ---------------------------------------------------------------- *
 * Passwordless auth. Additive only: nothing above is altered, and
 * every row still keys on a verified email, matching `userStates`.
 * ---------------------------------------------------------------- */

export const authCodes = sqliteTable(
  "auth_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    // SHA-256 of `${email}:${code}` — the plaintext code is never stored.
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: integer("consumed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("auth_codes_email_idx").on(table.email),
    index("auth_codes_expires_at_idx").on(table.expiresAt),
  ],
);

export const authCredentials = sqliteTable(
  "auth_credentials",
  {
    // Base64url WebAuthn credential id.
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports"),
    label: text("label"),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("auth_credentials_user_email_idx").on(table.userEmail)],
);

export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    challenge: text("challenge").notNull(),
    email: text("email"),
    kind: text("kind").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("auth_challenges_expires_at_idx").on(table.expiresAt)],
);
