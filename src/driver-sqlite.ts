/**
 * The SQLite driver for Node — DATABASE_URL=sqlite:/path/to.db, or
 * sqlite::memory: for tests.
 *
 * Two reasons to exist:
 *
 *   1. Self-hosters get durable storage from a single file, no PostgreSQL.
 *   2. It is the test double for the Cloudflare Durable Object driver in
 *      worker.ts — same engine, same dialect seam (sqlite-dialect.ts), so what
 *      the tests prove here holds there.
 *
 * One connection, whole transactions serialised — the PGlite model. With
 * exactly one writer the advisory-lock queue and row locks that the PostgreSQL
 * driver needs are already implied by the serialisation.
 */

import type { SqlClient } from './store.ts';
import { Serialiser, type Database } from './driver.ts';
import { bindable, normalizeDbError, translateSql, truncateTables } from './sqlite-dialect.ts';

export async function createSqliteDriver(location = ':memory:'): Promise<Database> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(location);
  // SQLite ships with foreign keys OFF; the schema's CASCADE / SET NULL
  // clauses are load-bearing (D3 account deletion, invite spentness).
  db.exec('PRAGMA foreign_keys = ON;');

  const client: SqlClient = {
    query: async (text, params) => {
      const tables = truncateTables(text);
      if (tables) {
        for (const t of tables) db.exec(`DELETE FROM ${t};`);
        try {
          db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${tables.map((t) => `'${t}'`).join(',')});`);
        } catch {
          /* no AUTOINCREMENT table has been written yet */
        }
        return { rows: [] };
      }
      try {
        const rows = db.prepare(translateSql(text)).all(...bindable(params)) as Record<
          string,
          unknown
        >[];
        return { rows };
      } catch (err) {
        throw normalizeDbError(err);
      }
    },
    exec: async (text) => {
      try {
        db.exec(text);
      } catch (err) {
        throw normalizeDbError(err);
      }
    },
  };

  const serial = new Serialiser();
  return {
    ...client,
    kind: 'sqlite',
    describe:
      location === ':memory:'
        ? 'SQLite (in-memory, not persisted)'
        : `SQLite via ${location}`,
    transaction: (fn) =>
      serial.run(async () => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const out = await fn(client);
          db.exec('COMMIT');
          return out;
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            /* already rolled back */
          }
          throw err;
        }
      }),
    close: async () => {
      db.close();
    },
  };
}
