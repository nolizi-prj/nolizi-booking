/**
 * One embedded Postgres cluster per test run, on a directory and a port that
 * nobody else holds.
 *
 * Every suite used to hard-code both — `/tmp/pumasi-pg-<name>` and a fixed
 * port. A run that died mid-suite left the data directory behind, and
 * `initialise()` calls `initdb` unconditionally, with no "already initialised"
 * branch to fall through to. So every later run of that file failed on a clean
 * tree with `initdb: error: directory "..." exists but is not empty`, until a
 * human knew to delete it. The gate is run by hand on a shared machine, so one
 * interrupted run reported failures to everybody afterwards.
 *
 * The fix is that neither resource is fixed any more: the directory name
 * carries the pid and eight random bytes, and the port comes from the OS. A
 * corpse left by a `SIGKILL` can now be litter, but it can never be a latch.
 * A start that fails takes its directory with it, and on the way in each run
 * sweeps the directories — and the orphaned servers — left by test processes
 * that are gone. Without that sweep, unique names would trade one latch for
 * unbounded litter on a machine several agents share.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/** A running cluster, and the one URL its callers need. */
export interface TestPostgres {
  /** `postgres://…` for the cluster's own port. */
  readonly url: string;
  readonly port: number;
  readonly dir: string;
  /** Stops the server and removes the data directory. Safe to call twice. */
  stop(): Promise<void>;
}

/** Directories this module makes, and only those: `pumasi-pg-<label>-<pid>-<rand>`. */
const OURS = /^pumasi-pg-.+-(\d+)-[0-9a-f]{16}$/;

/** A port the OS says is free right now. Held only long enough to be named. */
async function freePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (typeof address !== 'object' || address === null) {
        probe.close(() => reject(new Error('could not read a port from the probe socket')));
        return;
      }
      const { port } = address;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/**
 * Whether a pid is still running. `EPERM` means it exists and belongs to
 * somebody else — on a shared machine that is a live process, not a corpse.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

let swept: Promise<void> | undefined;

/**
 * Ask the server left behind in `dir` to shut down, and report whether the
 * directory is now nobody's. `false` means something still holds it and we
 * could not confirm it is ours — removing a data directory from under a
 * running server is worse than leaving litter.
 */
async function reapServer(dir: string): Promise<boolean> {
  const held = await readFile(path.join(dir, 'postmaster.pid'), 'utf8').catch(() => undefined);
  if (held === undefined) return true;
  const pid = Number(held.split('\n')[0]);
  if (!Number.isInteger(pid) || pid <= 0 || !alive(pid)) return true;
  // Pids are reused. Only signal one whose own command line still names this
  // very directory, and leave anything we cannot read alone.
  const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => undefined);
  if (cmdline === undefined || !cmdline.split('\0').includes(dir)) return false;
  try {
    process.kill(pid, 'SIGINT');
  } catch {
    return false;
  }
  for (let waited = 0; waited < 20 && alive(pid); waited += 1) await delay(100);
  return !alive(pid);
}

/**
 * Remove data directories left by test runs that have exited, and the servers
 * those runs orphaned. This is housekeeping rather than the repair: a unique
 * directory is what stops the next run failing. But a `SIGKILL` leaves both a
 * directory and a running `postgres` behind, and unique names would otherwise
 * turn one latch into unbounded litter on a machine several agents share.
 *
 * Deliberately narrow: only names this module generates, only where the test
 * process that made them is gone, and only after the server holding them is
 * confirmed gone too. A fixed-name directory from an older checkout is left
 * alone, because a concurrent run may still be using it.
 */
async function sweepStale(): Promise<void> {
  const entries = await readdir(tmpdir(), { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = OURS.exec(entry.name);
    if (!match?.[1]) continue;
    if (alive(Number(match[1]))) continue;
    const dir = path.join(tmpdir(), entry.name);
    if (!(await reapServer(dir).catch(() => false))) continue;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Stop if it started, then make sure the directory is gone either way. */
async function discard(pg: EmbeddedPostgres, dir: string): Promise<void> {
  await pg.stop().catch(() => undefined);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Start a cluster for one test file. `label` names it in `/tmp` for a human
 * reading the directory listing; it is not what makes the name unique.
 *
 * Retries because an OS-allocated port is free when it is named and not
 * promised afterwards — another process can take it in between.
 */
export async function startPostgres(label: string, attempts = 3): Promise<TestPostgres> {
  swept ??= sweepStale();
  await swept;

  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const dir = path.join(tmpdir(), `pumasi-pg-${label}-${process.pid}-${randomBytes(8).toString('hex')}`);
    const port = await freePort();
    const pg = new EmbeddedPostgres({
      databaseDir: dir, user: 'pumasi', password: 'pumasi', port, persistent: false,
    });
    try {
      await pg.initialise();
      await pg.start();
      let stopped = false;
      return {
        url: `postgres://pumasi:pumasi@localhost:${port}/postgres`,
        port,
        dir,
        async stop() {
          if (stopped) return;
          stopped = true;
          await discard(pg, dir);
        },
      };
    } catch (err) {
      // `start()` rejects with no reason when the server exits early; say what
      // failed rather than throwing `undefined` at the suite.
      last = err ?? new Error(`Postgres did not start on port ${port} (data directory ${dir})`);
      await discard(pg, dir);
    }
  }
  throw last;
}
