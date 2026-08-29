/**
 * The SQLite dialect seam.
 *
 * Every query in this codebase is written once, in the PostgreSQL dialect, and
 * the store's correctness argument lives next to those queries. Porting them by
 * hand would fork that argument; instead the differences — all of them small
 * and enumerable — are translated here, in one place, mechanically.
 *
 * This module is pure: no node:* imports, so the Cloudflare Worker entry can
 * use it. Runtime drivers live in driver-sqlite.ts (Node) and worker.ts (DO).
 */

/** Postgres `$1` → SQLite `?1`, casts and locking dropped where SQLite has none. */
export function translateSql(text: string): string {
  // The advisory lock exists to make contenders queue. SQLite deployments have
  // exactly one writer (the DO instance, or the serialised Node driver), so the
  // queue already exists; the statement only needs to keep its parameter arity.
  if (/pg_advisory_xact_lock/i.test(text)) return 'SELECT length(?1) AS lock';

  return (
    text
      .replace(/::\s*(?:int|integer|bigint|text|timestamptz|date)\b/gi, '')
      .replace(/\$(\d+)/g, '?$1')
      // Row locks are meaningless with a single serialised writer.
      .replace(/\bFOR UPDATE\b/gi, '')
      // Same instant, same format the rest of the codebase writes: ISO UTC.
      .replace(/\bnow\(\)/gi, `strftime('%Y-%m-%dT%H:%M:%SZ','now')`)
  );
}

/** `TRUNCATE a, b RESTART IDENTITY CASCADE` (tests only) → per-table DELETEs. */
export function truncateTables(text: string): string[] | undefined {
  const m = /^\s*TRUNCATE\s+(?:TABLE\s+)?([a-z0-9_,\s]+?)(?:\s+RESTART IDENTITY)?(?:\s+CASCADE)?\s*;?\s*$/i.exec(
    text,
  );
  if (!m) return undefined;
  return m[1]!.split(',').map((t) => t.trim()).filter(Boolean);
}

/**
 * SQLite reports constraint violations in its own words. The store translates
 * conflicts by SQLSTATE code or by message text (store.ts isConflict); rather
 * than teach it a third vocabulary, restate SQLite's errors in the one it
 * already understands. The exclusion-constraint trigger in
 * migrations-sqlite/001 already RAISEs with the recognised phrase.
 */
export function normalizeDbError(err: unknown): Error {
  const e = err as Error & { code?: string };
  const message = e?.message ?? String(err);
  if (/UNIQUE constraint failed/i.test(message)) {
    const out = new Error(`${message} — violates unique constraint`) as Error & { code: string };
    out.code = '23505';
    return out;
  }
  return e instanceof Error ? e : new Error(message);
}

/** SQLite binds no undefined and knows no booleans. */
export function bindable(params: unknown[] | undefined): (string | number | null | bigint | Uint8Array)[] {
  return (params ?? []).map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
    if (v instanceof Uint8Array) return v;
    if (v instanceof Date) return v.toISOString().replace('.000Z', 'Z');
    return String(v);
  });
}
