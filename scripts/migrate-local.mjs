#!/usr/bin/env node
/**
 * Applies drizzle/*.sql to the LOCAL Miniflare D1 used by `npm run dev`.
 *
 * The hosted Sites control plane applies migrations for the deployed
 * database; nothing did so locally, which left local D1 empty. This makes
 * the local database match the schema so auth and cloud sync are testable.
 *
 * Idempotent: applied files are recorded in `_migrations`.
 * Production: `wrangler d1 migrations apply <DB> --remote`.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const MIGRATIONS_DIR = "drizzle";

if (!existsSync(D1_DIR)) {
  console.error(`No local D1 found at ${D1_DIR}. Start \`npm run dev\` once first.`);
  process.exit(69);
}

const candidates = readdirSync(D1_DIR).filter(
  (f) => f.endsWith(".sqlite") && f !== "metadata.sqlite",
);
if (candidates.length !== 1) {
  console.error(
    `Expected exactly one local D1 database in ${D1_DIR}, found ${candidates.length}: ${candidates.join(", ")}`,
  );
  process.exit(69);
}

const dbPath = path.join(D1_DIR, candidates[0]);
const db = new DatabaseSync(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  tag TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`);

const applied = new Set(db.prepare("SELECT tag FROM _migrations").all().map((r) => r.tag));
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

let count = 0;
for (const file of files) {
  const tag = file.replace(/\.sql$/, "");
  if (applied.has(tag)) continue;

  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  db.exec("BEGIN");
  try {
    for (const statement of statements) db.exec(statement);
    db.prepare("INSERT INTO _migrations (tag, applied_at) VALUES (?, ?)").run(
      tag,
      new Date().toISOString(),
    );
    db.exec("COMMIT");
    console.log(`applied ${tag} (${statements.length} statement(s))`);
    count += 1;
  } catch (error) {
    db.exec("ROLLBACK");
    console.error(`failed on ${tag}: ${error.message}`);
    process.exit(1);
  }
}

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log(count ? `\n${count} migration(s) applied.` : "\nAlready up to date.");
console.log(`tables: ${tables.join(", ")}`);
