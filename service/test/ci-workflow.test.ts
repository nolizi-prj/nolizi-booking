/**
 * SPEC-0008 acceptance runner — the frozen cases in
 * `spec/0008/acceptance/cases.json` (v1.1.0), A-001 … A-006.
 *
 * It inspects the repository, because the artefact under test IS the
 * repository's checking configuration. It lives in the service suite on
 * purpose: the frozen cases for the checking machine are then run BY the
 * checking machine, and by `pumasi/tools/gate.sh`, on every change.
 *
 * Where a case is about behaviour rather than about text, this file executes
 * the real code path — `tools/ci.sh --list-service-tests` for the file
 * selection, and the script's own embedded node blocks, extracted and run
 * against crafted trees, for the workspace and worker-entry checks. Asserting
 * that a string appears in a script is not the same as asserting the script
 * does the thing (lessons/L-006), and where this file settles for the former it
 * says so on the assertion.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const at = (...p: string[]): string => path.join(ROOT, ...p);
const read = (...p: string[]): string => fs.readFileSync(at(...p), 'utf8');

const WORKFLOW_DIR = at('.github', 'workflows');
const CI_SH = at('tools', 'ci.sh');

/** YAML comments are not configuration: every check below reads code lines. */
function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => !/^\s*#/.test(l));
}

function topLevelBlock(lines: string[], key: string): string[] {
  const i = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    const l = lines[j];
    if (l === undefined) break;
    if (l.trim() === '') continue;
    if (/^\S/.test(l)) break;
    out.push(l);
  }
  return out;
}

/** Every shell command any step runs, inline or block scalar. */
function runCommands(lines: string[]): string[] {
  const cmds: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === undefined) continue;
    const m = /^(\s*)-?\s*run:\s*(.*)$/.exec(l);
    if (!m) continue;
    const indent = (m[1] ?? '').length;
    const inline = (m[2] ?? '').trim();
    if (inline !== '' && !/^[|>][-+]?$/.test(inline)) {
      cmds.push(inline);
      continue;
    }
    for (let j = i + 1; j < lines.length; j++) {
      const c = lines[j];
      if (c === undefined) break;
      if (c.trim() === '') continue;
      if (c.length - c.trimStart().length <= indent) break;
      cmds.push(c.trim());
    }
  }
  return cmds;
}

function workflowFiles(): string[] {
  if (!fs.existsSync(WORKFLOW_DIR)) return [];
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => path.join(WORKFLOW_DIR, f));
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l !== '');
}

/** Pull an embedded `node - <<'TAG'` block out of tools/ci.sh so the case can
 *  run the script's own code against a crafted tree rather than grep for it. */
function heredoc(src: string, tag: string): string {
  const m = new RegExp(`<<'${tag}'\\n([\\s\\S]*?)\\n${tag}\\n`).exec(src);
  assert.ok(m, `tools/ci.sh has no ${tag} heredoc to execute`);
  return m[1] ?? '';
}

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spec0008-'));
}

interface Run {
  readonly status: number;
  readonly out: string;
}

function run(cmd: string, args: string[], cwd: string): Run {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

test('A-001 · a workflow exists, runs on push and on pull request, and delegates its checks to tools/ci.sh', () => {
  assert.ok(workflowFiles().length > 0, 'no workflow files under .github/workflows/');
  const file = path.join(WORKFLOW_DIR, 'ci.yaml');
  assert.ok(fs.existsSync(file), '.github/workflows/ci.yaml does not exist');

  const lines = codeLines(fs.readFileSync(file, 'utf8'));
  const on = topLevelBlock(lines, 'on');
  assert.ok(on.length > 0, 'the workflow declares no `on:` block');
  const triggers = on
    .filter((l) => /^\s{2}\S/.test(l))
    .map((l) => l.trim().replace(/:.*$/, ''));
  assert.ok(triggers.includes('push'), `no push trigger; triggers are ${triggers.join(', ')}`);
  assert.ok(triggers.includes('pull_request'), `no pull_request trigger; triggers are ${triggers.join(', ')}`);
  assert.ok(
    !triggers.includes('pull_request_target'),
    'pull_request_target would run a fork\'s pull request with this repository\'s own rights',
  );

  const cmds = runCommands(lines);
  assert.ok(
    cmds.some((c) => c.includes('tools/ci.sh')),
    'no step invokes tools/ci.sh',
  );
  // The checks live in the script, not in the YAML, so that reading one file in
  // the repository answers "what does CI check?" (L-007: restating forks it).
  for (const c of cmds) {
    assert.doesNotMatch(c, /\bnpm\s+(run\s+)?test\b/, `a step runs the tests directly: ${c}`);
    assert.doesNotMatch(c, /\bnode\s+--test\b/, `a step runs the tests directly: ${c}`);
    assert.doesNotMatch(c, /\btsc\b/, `a step type-checks directly: ${c}`);
    assert.doesNotMatch(c, /\bwrangler\b/, `a step runs wrangler directly: ${c}`);
  }
});

test('A-002 · the service run is the whole suite minus exactly one file, and the one is named with its reason', () => {
  assert.ok(fs.existsSync(CI_SH), 'tools/ci.sh does not exist');
  assert.ok((fs.statSync(CI_SH).mode & 0o111) !== 0, 'tools/ci.sh is not executable');

  // The script's own selection, not a restatement of it.
  const listed = execFileSync(CI_SH, ['--list-service-tests'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l !== '')
    .map((p) => path.basename(p));

  const compiled = fs
    .readdirSync(at('service', '.build', 'test'))
    .filter((f) => f.endsWith('.test.js'));
  const sources = fs
    .readdirSync(at('service', 'test'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => f.replace(/\.ts$/, '.js'));
  for (const s of sources) {
    assert.ok(compiled.includes(s), `${s} has no compiled counterpart — the glob would miss it`);
  }

  const omitted = compiled.filter((f) => !listed.includes(f));
  assert.equal(omitted.length, 1, `expected exactly one excluded file, got ${omitted.length}: ${omitted.join(', ')}`);
  assert.match(omitted[0] ?? '', /browser-live/, `the excluded file is ${omitted[0]}, not browser-live`);
  assert.equal(listed.length, compiled.length - 1);

  const src = read('tools', 'ci.sh');
  assert.match(src, /booking\.pumasi\.ai/, 'the printed reason does not name the live host');
  assert.match(src, /behind main/, 'the printed reason does not say the deployment is behind main');

  // The guard, executed rather than asserted about: on a tree where the
  // excluded name is not in the suite, the selection must FAIL, not quietly run
  // everything. An exclusion naming a file that is not there stops being an
  // exclusion the moment someone renames the test.
  const bad = tmp();
  fs.mkdirSync(path.join(bad, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(bad, 'service', '.build', 'test'), { recursive: true });
  fs.copyFileSync(CI_SH, path.join(bad, 'tools', 'ci.sh'));
  fs.chmodSync(path.join(bad, 'tools', 'ci.sh'), 0o755);
  for (const f of ['a.test.js', 'b.test.js']) {
    fs.writeFileSync(path.join(bad, 'service', '.build', 'test', f), '');
  }
  const missing = run(path.join(bad, 'tools', 'ci.sh'), ['--list-service-tests'], bad);
  assert.notEqual(missing.status, 0, 'the selection passed on a suite that does not contain the excluded file');
  assert.match(missing.out, /exclusion list/i);

  // And on a tree that does contain it, the same code selects the rest.
  fs.writeFileSync(path.join(bad, 'service', '.build', 'test', 'browser-live.test.js'), '');
  const good = run(path.join(bad, 'tools', 'ci.sh'), ['--list-service-tests'], bad);
  assert.equal(good.status, 0, good.out);
  const names = good.out.split('\n').filter((l) => l !== '').map((p) => path.basename(p)).sort();
  assert.deepEqual(names, ['a.test.js', 'b.test.js']);
  fs.rmSync(bad, { recursive: true, force: true });
});

test('A-003 · no workspace is silently skipped by the type-check', () => {
  const root = JSON.parse(read('package.json')) as {
    workspaces?: string[];
    scripts?: Record<string, string>;
  };
  const workspaces = root.workspaces ?? [];
  assert.ok(workspaces.length > 0, 'the root package.json declares no workspaces');
  for (const ws of workspaces) {
    const pkg = JSON.parse(read(ws, 'package.json')) as { scripts?: Record<string, string> };
    assert.ok(
      pkg.scripts?.['typecheck'],
      `workspace ${ws} has no typecheck script, so --workspaces cannot check it`,
    );
  }
  const rootScript = root.scripts?.['typecheck'] ?? '';
  assert.doesNotMatch(
    rootScript,
    /--if-present/,
    '--if-present turns a workspace with no typecheck script into a silent pass',
  );

  // tools/ci.sh's own guard, extracted and executed against crafted trees, so
  // this clause tests behaviour rather than the presence of a string.
  const check = heredoc(read('tools', 'ci.sh'), 'CHECK_WORKSPACES');
  const scenario = (pkgs: Record<string, unknown>): Run => {
    const dir = tmp();
    for (const [rel, content] of Object.entries(pkgs)) {
      fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), JSON.stringify(content));
    }
    fs.writeFileSync(path.join(dir, 'check.cjs'), check);
    const out = run(process.execPath, [path.join(dir, 'check.cjs')], dir);
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };
  const strict = { typecheck: 'npm run typecheck --workspaces' };
  const has = { scripts: { typecheck: 'tsc --noEmit' } };
  const hasnt = { scripts: { build: 'tsc' } };

  const ok = scenario({
    'package.json': { workspaces: ['a', 'b'], scripts: strict },
    'a/package.json': has,
    'b/package.json': has,
  });
  assert.equal(ok.status, 0, `a tree where every workspace has a typecheck should pass: ${ok.out}`);

  const skipped = scenario({
    'package.json': { workspaces: ['a', 'b'], scripts: strict },
    'a/package.json': has,
    'b/package.json': hasnt,
  });
  assert.notEqual(skipped.status, 0, 'a workspace with no typecheck script passed the guard');
  assert.match(skipped.out, /\bb\b/);

  const lenient = scenario({
    'package.json': { workspaces: ['a'], scripts: { typecheck: 'npm run typecheck --workspaces --if-present' } },
    'a/package.json': has,
  });
  assert.notEqual(lenient.status, 0, '--if-present passed the guard');
  assert.match(lenient.out, /--if-present/);
});

test('A-004 · the workflow is advisory and unprivileged, and no configuration that could block a merge ships', () => {
  // Scoped to configuration, not to prose: SPEC.md, cases.json and this file all
  // name these strings in order to forbid them (cases.json v1.1.0, amended in
  // the open). Non-vacuous on the change-absent tree, where .github/ is
  // non-empty.
  const configish = trackedFiles().filter(
    (f) => f.startsWith('.github/') || /branch[-_]?protection|ruleset/i.test(path.basename(f)),
  );
  assert.ok(configish.length > 0, 'no configuration files found to check');
  for (const f of configish) {
    const src = fs.readFileSync(at(f), 'utf8');
    for (const forbidden of ['required_status_checks', 'branch_protection', 'rulesets']) {
      assert.ok(
        !src.includes(forbidden),
        `${f} requests ${forbidden} — this workflow may not block a merge (CHARTER §3 is untouched; Q-025 is open)`,
      );
    }
  }

  for (const file of workflowFiles()) {
    const rel = path.relative(ROOT, file);
    const raw = fs.readFileSync(file, 'utf8');
    const lines = codeLines(raw);
    const perms = topLevelBlock(lines, 'permissions');
    assert.ok(perms.length > 0, `${rel} declares no permissions: block, so it inherits the default token`);
    const granted = perms.map((l) => l.trim()).filter((l) => l !== '');
    assert.deepEqual(granted, ['contents: read'], `${rel} grants more than contents: read`);
    assert.ok(!lines.some((l) => /secrets\./.test(l)), `${rel} references a secret`);
    assert.ok(!lines.some((l) => /pull_request_target/.test(l)), `${rel} uses pull_request_target`);
    assert.ok(!lines.some((l) => /write-all|:\s*write\b/.test(l)), `${rel} grants a write scope`);
  }
});

test('A-005 · a red run is possible: nothing in the machine\'s check can swallow a failure', () => {
  const src = read('tools', 'ci.sh');
  assert.match(src, /^set -euo pipefail$/m, 'tools/ci.sh does not set -euo pipefail');
  for (const swallow of ['|| true', '|| :', 'set +e']) {
    assert.ok(!src.includes(swallow), `tools/ci.sh contains ${swallow}, which hides a failure`);
  }
  for (const file of workflowFiles()) {
    const rel = path.relative(ROOT, file);
    const lines = codeLines(fs.readFileSync(file, 'utf8'));
    assert.ok(!lines.some((l) => /continue-on-error/.test(l)), `${rel} sets continue-on-error`);
    assert.ok(!lines.some((l) => /^\s*if:/.test(l)), `${rel} guards a step with if:`);
    assert.ok(!lines.some((l) => /always\(\)/.test(l)), `${rel} uses always()`);
    for (const c of runCommands(lines)) {
      assert.ok(!c.includes('|| true'), `a step swallows its own failure: ${c}`);
    }
  }
});

test('A-006 · the served entry point is bundled every run, the run can never deploy, and the type-check claim is derived from the tree', () => {
  const src = read('tools', 'ci.sh');
  // An invocation, not a mention. The script names wrangler in prose it prints
  // and in the path it reads, so quoted strings are stripped before looking —
  // otherwise this case would go red for an `echo` and green for a deploy.
  const invocations = src
    .split('\n')
    .filter((l) => !/^\s*(#|\/\/)/.test(l.trim()))
    .filter((l) => /\bwrangler\s+\S/.test(l.replace(/'[^']*'|"[^"]*"/g, '')));
  assert.equal(
    invocations.length,
    1,
    `expected exactly one wrangler invocation in tools/ci.sh, found ${invocations.length}: ${invocations.join(' | ')}`,
  );
  for (const l of invocations) {
    assert.match(l, /wrangler\s+deploy\b/, `the wrangler invocation is not a deploy --dry-run: ${l.trim()}`);
    assert.ok(
      l.includes('--dry-run'),
      `a wrangler invocation without --dry-run: ${l.trim()} — CI must never be able to ship`,
    );
    assert.doesNotMatch(l, /wrangler\s+(versions\s+upload|publish|deployments)/, `a shipping wrangler command: ${l.trim()}`);
  }
  assert.match(src, /BUNDLE, not a type-check/, 'the run does not say that a bundle is not a type-check');

  // The disclosure block, extracted and executed, so that "derived from the
  // tree" is a behaviour and not a comment. Both trees below are crafted: the
  // sentence must follow the tsconfigs it reads, and must name the entry point
  // wrangler.jsonc declares rather than a remembered path.
  const disclosure = heredoc(src, 'WORKER_DISCLOSURE');
  const scenario = (excludeIn: string[]): Run => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'service'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'service', 'wrangler.jsonc'),
      '// a comment with a // url https://example.invalid/x\n{ "main": "src/an-unusual-entry.ts" }\n',
    );
    for (const cfg of ['tsconfig.json', 'tsconfig.test.json']) {
      fs.writeFileSync(
        path.join(dir, 'service', cfg),
        JSON.stringify({ exclude: excludeIn.includes(cfg) ? ['src/an-unusual-entry.ts'] : [] }),
      );
    }
    fs.writeFileSync(path.join(dir, 'disclose.cjs'), disclosure);
    const out = run(process.execPath, [path.join(dir, 'disclose.cjs')], dir);
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
  };

  const both = scenario(['tsconfig.json', 'tsconfig.test.json']);
  assert.equal(both.status, 0, both.out);
  assert.match(both.out, /src\/an-unusual-entry\.ts/, 'the entry point is not read from wrangler.jsonc');
  assert.match(both.out, /NOTHING in this repository type-checks/);

  const one = scenario(['tsconfig.json']);
  assert.equal(one.status, 0, one.out);
  assert.match(one.out, /is type-checked by/, 'the sentence did not follow the tsconfig that includes the entry point');
  assert.doesNotMatch(one.out, /NOTHING in this repository type-checks/);
});
