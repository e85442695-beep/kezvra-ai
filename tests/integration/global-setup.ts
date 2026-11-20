import "dotenv/config";
import { execSync } from "node:child_process";
import pg from "pg";

/**
 * Creates (if needed) a dedicated test database and applies migrations.
 * TEST_DATABASE_URL wins; otherwise the DATABASE_URL database name is replaced with "kezvra_test".
 * Never runs against the dev/prod database.
 */
export function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const u = new URL(process.env.DATABASE_URL ?? "postgresql://kezvra:kezvra@localhost:5432/kezvra");
  u.pathname = "/kezvra_test";
  return u.toString();
}

export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  if (!/test/.test(name)) throw new Error(`Refusing to run integration tests against non-test database "${name}"`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) await c.query(`CREATE DATABASE "${name}"`);
  await c.end();
  // Some single-database dev servers (e.g. `prisma dev` / PGlite) ignore the database name and
  // silently serve the dev database. Verify we really landed in the test database.
  const t = new pg.Client({ connectionString: url.toString() });
  await t.connect();
  const cur = (await t.query("SELECT current_database() AS d")).rows[0]?.d;
  await t.end();
  if (cur !== name) {
    throw new Error(`Connected to "${cur}" instead of "${name}". Integration tests need a real PostgreSQL server (e.g. docker compose up postgres) — refusing to touch the dev database.`);
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.toString() } });
}
