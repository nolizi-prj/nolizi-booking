#!/usr/bin/env node
/**
 * PR-1 · the version has one source of truth, and this is the thing that
 * carries it everywhere else.
 *
 * The source of truth is the ROOT `package.json`'s `version` field. Nothing
 * else in this repository is allowed to state a version by hand; every other
 * place that needs one is written by this script from that field:
 *
 *   core/package.json      "version"        — the library manifest
 *   service/package.json   "version"        — the service manifest
 *   service/src/version.ts VERSION          — the runtime constant
 *   package-lock.json      the three above   — npm's own copy of them
 *
 * To move the version:
 *
 *   npm version minor --workspaces=false      (runs this script via the
 *                                              `version` lifecycle hook)
 *   — or, without the tag and commit —
 *   edit package.json, then:  npm run version:sync
 *
 * `--check` writes nothing and exits 1 if any of the three has drifted.
 * `service/test/version.test.ts` runs that check, so a bumped root with an
 * unsynced tree fails the suite rather than shipping quietly.
 *
 * WHY A GENERATED .ts AND NOT A JSON IMPORT. The Workers build (wrangler,
 * `service/src/worker.ts`) has no filesystem at runtime, so `readFileSync` is
 * out; and both tsconfigs set `rootDir: "src"`, so `import pkg from
 * '../../package.json'` would drag a file from outside rootDir into the emit
 * and move `dist/`'s layout. A generated module inside `src/` is bundled by
 * wrangler and compiled by tsc identically, which is what L-009 asks for: the
 * two entry points get the number by the same mechanism, not two.
 *
 * WHY IT IS COMMITTED AND NOT GITIGNORED. `wrangler deploy` reads
 * `src/worker.ts` directly and runs no npm script, so a generated-but-ignored
 * module would make the Workers build depend on an unstated prior step — the
 * exact shape of defect L-009 names. Committed, it is greppable by the next
 * reader; the `--check` test is what keeps it from becoming the fourth
 * hand-maintained copy.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CHECK = process.argv.includes('--check');

const rootPkgPath = join(ROOT, 'package.json');
const version = JSON.parse(readFileSync(rootPkgPath, 'utf8')).version;
if (typeof version !== 'string' || !version) {
  console.error(`sync-version: ${rootPkgPath} has no "version"`);
  process.exit(2);
}

const drift = [];

/** Rewrite only the manifest's own `version` line — never reformat the file. */
function syncManifest(rel) {
  const path = join(ROOT, rel);
  const before = readFileSync(path, 'utf8');
  const after = before.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  if (after === before) return;
  if (CHECK) drift.push(`${rel} is not "${version}"`);
  else writeFileSync(path, after);
}

/**
 * npm keeps its own copy of every workspace's version in `package-lock.json`,
 * so a bump that stops at the manifests leaves the lockfile disagreeing with
 * the tree it locks — a fourth stale copy, which is the thing this script
 * exists to prevent. Only the workspace entries are touched; a dependency's
 * version is npm's to write, never this script's. The rewrite is a full
 * JSON round-trip because npm writes the file with exactly this formatting.
 */
function syncLockfile() {
  const rel = 'package-lock.json';
  const path = join(ROOT, rel);
  if (!existsSync(path)) return;
  const before = readFileSync(path, 'utf8');
  const lock = JSON.parse(before);
  lock.version = version;
  for (const key of ['', 'core', 'service']) {
    const entry = lock.packages?.[key];
    if (entry && 'version' in entry) entry.version = version;
  }
  const after = `${JSON.stringify(lock, null, 2)}\n`;
  if (after === before) return;
  if (CHECK) drift.push(`${rel} does not state "${version}" for the workspaces`);
  else writeFileSync(path, after);
}

function syncModule(rel, body) {
  const path = join(ROOT, rel);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === body) return;
  if (CHECK) drift.push(before === null ? `${rel} is missing` : `${rel} does not state "${version}"`);
  else writeFileSync(path, body);
}

syncManifest('core/package.json');
syncManifest('service/package.json');
syncLockfile();
syncModule(
  'service/src/version.ts',
  `/**
 * PR-1 · GENERATED FILE — do not edit.
 *
 * Written by \`tools/sync-version.mjs\` from the root \`package.json\`, which is
 * the only place this repository states a version by hand. To move it:
 * edit the root \`package.json\`, then run \`npm run version:sync\`.
 *
 * It is a module rather than a file read because the Workers entry point
 * (\`worker.ts\`) has no filesystem; wrangler bundles this constant and tsc
 * compiles it, so both entry points get the same number the same way (L-009).
 */
export const VERSION = '${version}';
`,
);

if (CHECK) {
  if (drift.length > 0) {
    console.error(`sync-version: root package.json says ${version}, but:`);
    for (const d of drift) console.error(`  - ${d}`);
    console.error('sync-version: run `npm run version:sync`');
    process.exit(1);
  }
  console.log(`sync-version: ${version} — manifests, lockfile and version.ts agree`);
} else {
  console.log(`sync-version: ${version} — manifests, lockfile and version.ts written`);
}
