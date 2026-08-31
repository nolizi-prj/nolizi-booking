/**
 * PR-1 — the version has ONE source of truth, and it is visible.
 *
 * The mechanism is `tools/sync-version.mjs`: the root `package.json` is the
 * only hand-written version in this repository, and that script writes the
 * other three places from it. A generated file that is committed is only as
 * good as the thing that notices when it stops being generated — this is that
 * thing. Bump the root manifest without running `npm run version:sync` and
 * this suite fails, rather than a stale number shipping quietly.
 *
 * L-009 · both entry points are checked here, not just the one the tests
 * happen to exercise: `app.ts` is Node, `worker.ts` is Workers, and a version
 * on one of them is the defect this product has already paid for twice.
 */
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import { VERSION } from '../src/version.ts';
import { FOOTER } from '../src/pages.ts';
import { formatFeedbackMarkdown } from '../src/feedback.ts';
import { RESERVED_SLUGS } from '../src/identity.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { SqlClient } from '../src/store.ts';

// src/worker.ts is compiled by tsconfig.worker.json and excluded from the test
// program, so it is reached as a runtime specifier the way worker-alarm.test.ts
// reaches it, with the same hooks standing in for `cloudflare:workers`.
register(new URL('../../test/support/worker-runtime.mjs', import.meta.url).href);
const workerModuleUrl = new URL('../src/worker.js', import.meta.url).href;

/**
 * Walk up to the workspace root. This file runs from `.build/test/` after
 * compilation and from `test/` in an editor, so the depth is not a constant.
 */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir;
    dir = dirname(dir);
  }
  throw new Error('could not find the workspace root');
}

const ROOT = repoRoot();
const versionOf = (rel: string): string =>
  JSON.parse(readFileSync(join(ROOT, rel), 'utf8')).version as string;

test('PR-1 · one source of truth: nothing restates the root version by hand', () => {
  const root = versionOf('package.json');
  assert.equal(VERSION, root, 'service/src/version.ts is stale — run `npm run version:sync`');
  assert.equal(versionOf('core/package.json'), root);
  assert.equal(versionOf('service/package.json'), root);

  // The generator is the authority, so ask it rather than re-deriving the rule
  // here: a check that agrees with the script today and forks tomorrow is the
  // L-007 shape this whole entry exists to remove.
  execFileSync('node', [join(ROOT, 'tools', 'sync-version.mjs'), '--check'], { stdio: 'pipe' });
});

test('PR-1 · the number moves — 0.1.0 was six merged builds ago', () => {
  assert.notEqual(VERSION, '0.1.0', 'the version has not moved since the first commit');
});

test('PR-1 · user-visible: the footer on every public page carries it', () => {
  assert.match(FOOTER, new RegExp(`v${VERSION.replace(/\./g, '\\.')}`));
});

test('PR-1 · in the diagnostics: a feedback report states the version', () => {
  const issue = formatFeedbackMarkdown({ type: 'bug', description: 'the times are wrong' });
  assert.match(issue.body, new RegExp(`\\*\\*Product Version\\*\\* \\| \`${VERSION.replace(/\./g, '\\.')}\``));

  // The widget sends this server's own VERSION back; anything else that turns
  // up in that field is a string a stranger chose, and it does not reach the
  // issue body.
  const spoofed = formatFeedbackMarkdown({
    type: 'bug',
    description: 'x',
    version: '`](https://evil.example) injected',
  });
  assert.ok(!spoofed.body.includes('evil.example'), 'an unversion-shaped value must not be pasted');
  assert.match(spoofed.body, new RegExp(`\\*\\*Product Version\\*\\* \\| \`${VERSION.replace(/\./g, '\\.')}\``));
});

/**
 * The Node entry's three surfaces, EXECUTED. `/version` and `/healthz` return
 * before anything touches sql, tx or mail, so those three are stood in for
 * rather than started — this test must not depend on the PostgreSQL fixture to
 * answer a question about a constant. `/readyz` is left to flow.test.ts, which
 * has a real database under it.
 */
const nodeDeps = (): AppDeps =>
  ({
    sql: {} as SqlClient,
    tx: {} as AppDeps['tx'],
    config: loadConfig({} as NodeJS.ProcessEnv),
    mail: {} as AppDeps['mail'],
    now: () => '2026-06-01T08:00:00Z',
    ready: () => true,
  }) as AppDeps;

test('the Node entry answers /version and /healthz with the version', async () => {
  for (const path of ['/version', '/healthz']) {
    const res = await handle(nodeDeps(), { method: 'GET', path, ip: '1.1.1.1' });
    assert.equal(res.status, 200, `${path} did not answer 200`);
    const body = JSON.parse(res.body as string) as { version?: string; commit?: string };
    assert.equal(body.version, VERSION, `${path} did not report the version`);
    // Named here so the half this commit does NOT close stays visible: commit
    // is set at deploy time and reads 'unknown' until one happens (Q-012).
    assert.equal(body.commit, 'unknown');
  }
});

/**
 * The Workers entry's three surfaces, EXECUTED — deliberately not asserted on
 * the file's source text. worker-alarm.test.ts exists because a string
 * assertion let `alarm()` ship calling a function it never imported; a version
 * that is present in src/worker.ts and absent from the bundle would be the
 * same defect wearing this commit's clothes.
 */
test('the Workers entry answers /version, /healthz and /readyz with the version', async () => {
  const stub = (result: unknown) => ({
    fetch: async () => new Response(JSON.stringify({ result }), { status: 200 }),
  });
  const binding = (result: unknown) => ({ idFromName: () => 'id', get: () => stub(result) });
  const env = { DIRECTORY: binding(0), PUMASI: binding(null) };

  const worker = (await import(workerModuleUrl)).default as {
    fetch(request: Request, env: unknown): Promise<Response>;
  };

  for (const path of ['/version', '/healthz', '/readyz']) {
    const res = await worker.fetch(new Request(`https://booking.pumasi.ai${path}`), env);
    assert.equal(res.status, 200, `${path} did not answer 200 on the Workers build`);
    const body = (await res.json()) as { version?: string; commit?: string };
    assert.equal(body.version, VERSION, `${path} did not report the version on the Workers build`);
    assert.equal(body.commit, 'unknown');
  }
});

test('L-009 · both entry points name /version, /healthz and /readyz in source', () => {
  const carried: Record<string, number> = {};
  for (const entry of ['src/app.ts', 'src/worker.ts']) {
    const src = readFileSync(join(ROOT, 'service', entry), 'utf8');
    assert.match(src, /from '\.\/version\.ts'/, `${entry} does not read the generated version`);
    for (const route of ['/version', '/healthz', '/readyz']) {
      assert.ok(src.includes(`'${route}'`), `${entry} has no ${route}`);
    }
    carried[entry] = (src.match(/version: VERSION/g) ?? []).length;
    assert.ok(carried[entry]! >= 3, `${entry} carries the version on ${carried[entry]} surfaces, wanted 3`);
  }
  // The property is parity, not a count. A fifth surface is welcome; a fifth
  // surface on ONE entry point is the defect L-009 names, and this is what
  // fails when the two builds drift apart.
  assert.equal(carried['src/app.ts'], carried['src/worker.ts'],
    'the Node and Workers entry points report the version on different numbers of surfaces');
});

test('P4 · /version cannot be claimed as an owner link', () => {
  // Adding a first-segment route without reserving it is how a route shadows
  // somebody's public booking page. healthz and readyz were already here.
  for (const slug of ['version', 'healthz', 'readyz']) {
    assert.ok(RESERVED_SLUGS.has(slug), `${slug} is claimable as an owner link`);
  }
});
