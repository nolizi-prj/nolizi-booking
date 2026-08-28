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

const here = dirname(fileURLToPath(import.meta.url));

export function migrationsDir(): string {
  for (const p of ['../migrations', '../../migrations', '../../../migrations']) {
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
export async function migrate(sql: SqlClient): Promise<string[]> {
  await sql.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  );`);

  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];

  for (const f of files) {
    // Claim the file first. A concurrent instance that loses the claim skips
    // it rather than applying it a second time.
    const claim = await sql.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)
         ON CONFLICT (filename) DO NOTHING
       RETURNING filename`,
      [f],
    );
    if (!claim.rows[0]) continue;

    try {
      await sql.exec(readFileSync(resolve(dir, f), 'utf8'));
      applied.push(f);
    } catch (err) {
      // A failed migration must not be recorded as applied, or the next boot
      // will skip it and serve against a schema that was never created.
      await sql.query(`DELETE FROM schema_migrations WHERE filename = $1`, [f]);
      throw err;
    }
  }
  return applied;
}
