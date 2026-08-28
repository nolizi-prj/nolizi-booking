/**
 * Migrations. Driver selection lives in driver.ts.
 *
 * O3 · Readiness is distinct from health: readiness means migrations are
 * complete and the database answers. The platform must not route traffic to an
 * instance that looks alive but cannot serve.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqlClient } from './store.ts';

export function migrationsDir(sub = 'migrations'): string {
  // Resolved lazily: under a bundler (worker.ts) import.meta.url is undefined,
  // and migrations arrive as pre-loaded files instead of a directory.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [`../${sub}`, `../../${sub}`, `../../../${sub}`]) {
    try {
      const dir = resolve(here, p);
      if (readdirSync(dir).some((f) => f.endsWith('.sql'))) return dir;
    } catch {
      /* try the next */
    }
  }
  throw new Error('migrations directory not found');
}

/**
 * P6 · Forward-only, run to completion before anything serves, and **each file
 * applied exactly once**.
 *
 * Re-running every file on every boot was not merely wasteful: 001 drops and
 * re-adds the exclusion constraint, which revalidates the whole table under a
 * lock, and two instances booting together would race each other doing it. A
 * ledger makes "applied" a fact rather than an assumption.
 */
export interface MigrationSource {
  /** Subdirectory to discover .sql files in (default 'migrations'). */
  dir?: string;
  /** Pre-loaded migrations, for hosts without a filesystem (worker.ts). */
  files?: { name: string; sql: string }[];
}

export async function migrate(sql: SqlClient, source?: MigrationSource): Promise<string[]> {
  // The ledger is dialect-neutral on purpose: `applied_at` is written by the
  // caller as ISO-8601 text, which both PostgreSQL and SQLite accept, so this
  // one function serves every driver.
  await sql.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,
    applied_at  text NOT NULL
  );`);

  const files =
    source?.files ??
    (() => {
      const dir = migrationsDir(source?.dir);
      return readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .map((f) => ({ name: f, sql: readFileSync(resolve(dir, f), 'utf8') }));
    })();
  const applied: string[] = [];

  for (const f of files) {
    // Claim the file first. A concurrent instance that loses the claim skips
    // it rather than applying it a second time.
    const claim = await sql.query(
      `INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)
         ON CONFLICT (filename) DO NOTHING
       RETURNING filename`,
      [f.name, new Date().toISOString()],
    );
    if (!claim.rows[0]) continue;

    try {
      await sql.exec(f.sql);
      applied.push(f.name);
    } catch (err) {
      // A failed migration must not be recorded as applied, or the next boot
      // will skip it and serve against a schema that was never created.
      await sql.query(`DELETE FROM schema_migrations WHERE filename = $1`, [f.name]);
      throw err;
    }
  }
  return applied;
}
