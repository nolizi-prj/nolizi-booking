/**
 * Database drivers.
 *
 * The service is not tied to one host. `P12` — ground truth is plain text, git
 * and the open web, and no special protocol is required to participate — and
 * the commercialization foundations make self-hosting first-class forever. A
 * service that only runs on one provider would contradict both.
 *
 * Two drivers satisfy the same interface:
 *
 *   PGlite    zero configuration, in process. Genuine PostgreSQL including
 *             btree_gist, so the constraints are real. Nothing survives a
 *             restart, which is fine for development and tests.
 *   node-pg   any PostgreSQL reachable by URL — local, a container, a managed
 *             instance anywhere. A pooled connection per transaction.
 *
 * The distinction that matters is `transaction()`. A transaction needs a
 * connection to itself: issuing BEGIN and COMMIT as separate statements onto a
 * shared session lets concurrent callers interleave, so a second BEGIN lands
 * inside the first transaction and neither is request-scoped. The pool hands
 * out a dedicated client; PGlite, having exactly one connection, serialises
 * instead.
 */

import type { SqlClient } from './store.ts';

export interface Database extends SqlClient {
  /** Run `fn` inside a transaction on a connection of its own. */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: 'pglite' | 'postgres';
  readonly describe: string;
}

/** Serialises whole transactions where the driver has a single connection. */
class Serialiser {
  #tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(fn, fn);
    this.#tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export async function createPgliteDriver(): Promise<Database> {
  const [{ PGlite }, { btree_gist }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/contrib/btree_gist'),
  ]);
  const db = await PGlite.create({ extensions: { btree_gist } });
  const serial = new Serialiser();

  const client: SqlClient = {
    query: (text, params) => db.query(text, params as unknown[]) as never,
    exec: async (text) => {
      await db.exec(text);
    },
  };

  return {
    ...client,
    kind: 'pglite',
    describe: 'PGlite (in-process PostgreSQL, not persisted)',
    transaction: (fn) =>
      serial.run(async () => {
        await client.query('BEGIN');
        try {
          const out = await fn(client);
          await client.query('COMMIT');
          return out;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw err;
        }
      }),
    close: () => db.close(),
  };
}

export async function createPostgresDriver(databaseUrl: string): Promise<Database> {
  const pg = await import('pg');
  const pool = new pg.default.Pool({
    connectionString: databaseUrl,
    max: 10,
    // PGSSL=require asks for TLS and STILL VERIFIES the certificate. Skipping
    // verification is a separate, uglier opt-in, because an unverified TLS
    // connection to the database that holds every booker's address is a
    // man-in-the-middle away from being no protection at all.
    ...(process.env['PGSSL'] === 'require' ? { ssl: { rejectUnauthorized: true } } : {}),
    ...(process.env['PGSSL'] === 'no-verify' ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  const asClient = (c: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  }): SqlClient => ({
    query: async (text, params) =>
      (await c.query(text, params)) as { rows: Record<string, unknown>[] },
    exec: async (text) => {
      await c.query(text);
    },
  });

  return {
    ...asClient(pool as never),
    kind: 'postgres',
    describe: `PostgreSQL via ${databaseUrl.replace(/:\/\/[^@]*@/, '://***@')}`,
    /** A dedicated connection, which is what makes this actually transactional. */
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(asClient(client as never));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/**
 * Pick a driver. A `DATABASE_URL` means a real instance is wanted and its
 * absence is not a reason to silently use a store that forgets everything on
 * restart — so the choice is logged either way.
 */
export async function createDatabase(databaseUrl?: string): Promise<Database> {
  return databaseUrl ? createPostgresDriver(databaseUrl) : createPgliteDriver();
}
