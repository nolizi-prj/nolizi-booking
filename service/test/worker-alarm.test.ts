/**
 * The deployed entry point, executed.
 *
 * `wrangler.jsonc` points `main` at `src/worker.ts`, and until this file
 * existed nothing in the suite ran a line of it: eight tests mention it, and
 * every one of them either names it in a comment or `readFileSync`s it and
 * asserts on its source text. That is how `alarm()` came to call
 * `processDueJobs` without importing it (`de4abbe`, 2026-08-28) and stay that
 * way through a green gate, four product evaluations and a release note —
 * esbuild strips types and compiles an unbound identifier into a free global,
 * so the bundle shipped and threw `ReferenceError` the first time an alarm
 * fired. Every workflow mail and every webhook on the hosted product was dead.
 *
 * A string assertion would not have caught it, so this does not use one. It
 * loads the real module, builds a real Durable Object with real SQLite under
 * it, enqueues real rows in `jobs`, and calls `alarm()`. The only things stood
 * in for are the two that cannot exist outside workerd — the `DurableObject`
 * base class and the `.sql` text imports (see test/support/) — and the
 * assertions are on the queue's own state afterwards, not on what the file
 * looks like.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

// The hooks are plain .mjs and stay in the source tree — tsc copies nothing —
// so they are reached from `.build/test/` rather than beside this file.
register(new URL('../../test/support/worker-runtime.mjs', import.meta.url).href);

/**
 * `src/worker.ts` is compiled by tsconfig.worker.json (the Node build and the
 * test build both exclude it). The specifier is a runtime value so that
 * TypeScript does not pull the file into the test program, where it would be
 * checked against Node's globals instead of the Workers ones.
 */
const workerModuleUrl = new URL('../src/worker.js', import.meta.url).href;

interface AlarmCapableDo {
  alarm(): Promise<void>;
}

/** The subset of the DO storage API that worker.ts uses, over node:sqlite. */
function durableObjectStorage(db: DatabaseSync, alarms: number[]) {
  return {
    sql: {
      exec(query: string, ...bindings: unknown[]) {
        const rows = db.prepare(query).all(...(bindings as never[]));
        return { toArray: () => rows };
      },
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async setAlarm(at: number): Promise<void> {
      alarms.push(at);
    },
  };
}

async function bootOrgDurableObject(): Promise<{
  service: AlarmCapableDo;
  db: DatabaseSync;
  alarms: number[];
}> {
  const mod = (await import(workerModuleUrl)) as {
    PumasiService: new (ctx: unknown, env: unknown) => AlarmCapableDo;
  };
  const db = new DatabaseSync(':memory:');
  const alarms: number[] = [];
  // No GMAIL_SA_KEY, so the DO builds RecordingMail: nothing leaves the process.
  const env = { PUMASI: undefined, DIRECTORY: undefined };
  const service = new mod.PumasiService({ storage: durableObjectStorage(db, alarms) }, env);
  // The DO initialises lazily, and alarm() is the shortest path into it: this
  // first call is what applies the sixteen migrations, so `jobs` exists below.
  // It is also the plainest form of the regression — with the import missing,
  // booting the alarm at all threw ReferenceError and every test here failed.
  await service.alarm();
  assert.equal(alarms.length, 0, 'an empty queue must not arm an alarm');
  return { service, db, alarms };
}

function enqueue(db: DatabaseSync, jobId: string, runAt: string, to: string): void {
  db.prepare(
    `INSERT INTO jobs (job_id, kind, run_at, payload, status)
     VALUES (?, 'workflow_mail', ?, ?, 'pending')`,
  ).run(jobId, runAt, JSON.stringify({ to, subject: 'Your meeting tomorrow', body: 'See you then.' }));
}

function statusOf(db: DatabaseSync, jobId: string): string {
  const row = db.prepare(`SELECT status FROM jobs WHERE job_id = ?`).get(jobId) as
    | { status: string }
    | undefined;
  return row?.status ?? 'missing';
}

test('the org DO alarm drains a due job — the call in alarm() resolves', async () => {
  const { service, db } = await bootOrgDurableObject();
  // Booting applies the migrations, so `jobs` exists from here on.
  enqueue(db, 'job-due', '2020-01-01T00:00:00Z', 'booker@example.com');

  // Before the missing import was added this threw
  // `ReferenceError: processDueJobs is not defined`, and nothing below ran.
  await service.alarm();

  assert.equal(
    statusOf(db, 'job-due'),
    'done',
    'a due workflow mail must be drained by the alarm, not left pending',
  );
});

test('the org DO alarm re-arms for the next pending job', async () => {
  const { service, db, alarms } = await bootOrgDurableObject();
  const later = '2099-01-01T00:00:00Z';
  enqueue(db, 'job-due', '2020-01-01T00:00:00Z', 'booker@example.com');
  enqueue(db, 'job-later', later, 'booker@example.com');

  await service.alarm();

  assert.equal(statusOf(db, 'job-due'), 'done');
  assert.equal(statusOf(db, 'job-later'), 'pending', 'a job that is not due yet must be left alone');
  // The re-arm is the line after the call: a handler that dies on the call
  // never reaches it, so this is the half of the bug that made it permanent.
  assert.ok(alarms.length > 0, 'alarm() must set the next alarm');
  assert.equal(
    alarms[alarms.length - 1],
    Date.parse(later),
    'the next alarm must be the next pending job',
  );
});

test('the org DO alarm is quiet when nothing is due', async () => {
  const { service, db, alarms } = await bootOrgDurableObject();
  enqueue(db, 'job-later', '2099-01-01T00:00:00Z', 'booker@example.com');

  await service.alarm();

  assert.equal(statusOf(db, 'job-later'), 'pending');
  assert.equal(alarms[alarms.length - 1], Date.parse('2099-01-01T00:00:00Z'));
});
