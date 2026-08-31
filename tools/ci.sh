#!/usr/bin/env bash
#
# tools/ci.sh — the advisory checks. SPEC-0008.
#
# This script is the single place that says what CI checks. The workflow
# (.github/workflows/ci.yaml) installs dependencies and calls this file; it adds
# no check of its own. So "what did CI actually check?" is answered by reading
# one script in the repository, and anyone can run exactly what the machine ran:
#
#     npm ci && tools/ci.sh
#
# IT BLOCKS NOTHING. CHARTER §3's merge gate is still pumasi/tools/gate.sh, run
# by an agent, and `GATE: PASS` still means what it has always meant. Whether
# that should change is pumasi/DECISIONS.md Q-025, open, whose default keeps the
# charter exactly as written. A red run here is information, not a veto.
#
# The obligation this script holds itself to is symmetric: it may not claim more
# than it ran, and it may not quietly run less. Every exclusion is printed, by
# name, with its reason, on every run.
#
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── the one exclusion, and why ───────────────────────────────────────────────
# Compiled basenames under service/.build/test/. Adding to this list is a
# deliberate, visible act: SPEC-0008 case A-002 fails if this list grows, and
# the run below fails if a name here is not actually in the suite.
EXCLUDED_BASENAMES=(browser-live.test.js)

exclusion_reason() {
  cat <<'REASON'
   service/test/browser-live.test.ts is NOT run here.
   It launches a real browser (puppeteer, executablePath /usr/bin/google-chrome)
   and asserts against the LIVE site https://booking.pumasi.ai — its status, its
   headline, its SSO buttons and a real redirect to accounts.google.com. Two
   reasons it does not belong in this run: it makes the result depend on a third
   party's uptime, and the deployment it tests is behind main, so it reports on a
   build that is not the commit being checked.
   It is excluded from THIS RUN ONLY. It is not skipped, not deleted, not edited;
   `npm test` and pumasi/tools/gate.sh still run it.
REASON
}

# ── the file selection, used by the run and by --list-service-tests ──────────
# One function, so the acceptance runner checks the same code path the machine
# executes rather than a restatement of it.
select_service_tests() {
  local all=() run=() f base found=0
  shopt -s nullglob
  all=(service/.build/test/*.test.js)
  shopt -u nullglob

  if [ "${#all[@]}" -eq 0 ]; then
    echo "tools/ci.sh: no compiled service tests under service/.build/test/." >&2
    echo "  Run 'npm run build:test -w @pumasi/booking-service' first." >&2
    return 1
  fi

  for f in "${all[@]}"; do
    base="$(basename "$f")"
    if printf '%s\n' "${EXCLUDED_BASENAMES[@]}" | grep -qxF -- "$base"; then
      found=$((found + 1))
      continue
    fi
    run+=("$f")
  done

  if [ "$found" -ne "${#EXCLUDED_BASENAMES[@]}" ]; then
    echo "tools/ci.sh: the exclusion list names ${#EXCLUDED_BASENAMES[@]} file(s); $found of them are in the suite." >&2
    echo "  An exclusion naming a file the suite does not contain stops being an" >&2
    echo "  exclusion and becomes a false statement the moment someone renames it." >&2
    echo "  Fix the list or the rename; do not let this pass." >&2
    return 1
  fi

  printf '%s\n' "${run[@]}"
}

if [ "${1:-}" = "--list-service-tests" ]; then
  select_service_tests
  exit 0
fi

echo "══ tools/ci.sh · advisory checks (SPEC-0008). Blocks nothing."
echo

echo "── 0/4 · what this machine is"
echo "   uname:  $(uname -srm)"
echo "   node:   $(node --version)   npm: $(npm --version)"
echo "   nproc:  $(nproc)"
node -e "console.log('   availableParallelism:', require('node:os').availableParallelism(), '— node --test runs files this many at a time by default')"
echo

echo "── 1/4 · core workspace tests (its own command, unmodified)"
npm test -w @pumasi/booking-core
echo

echo "── 2/4 · service workspace tests — every file but one, and the one is named"
npm run build:test -w @pumasi/booking-service
SERVICE_TESTS="$(select_service_tests)"
mapfile -t SERVICE_TEST_FILES <<< "$SERVICE_TESTS"
TOTAL=$(find service/.build/test -maxdepth 1 -name '*.test.js' | wc -l)
echo "   suite has $TOTAL compiled test files; this run executes ${#SERVICE_TEST_FILES[@]}, excludes ${#EXCLUDED_BASENAMES[@]}:"
exclusion_reason
echo
node --test "${SERVICE_TEST_FILES[@]}"
echo

echo "── 3/4 · typecheck — every workspace, none skipped"
node - <<'CHECK_WORKSPACES'
const fs = require('node:fs');
const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const missing = [];
for (const ws of root.workspaces ?? []) {
  const pkg = JSON.parse(fs.readFileSync(`${ws}/package.json`, 'utf8'));
  if (!pkg.scripts?.typecheck) missing.push(ws);
  else console.log(`   ${ws}: has a typecheck script`);
}
const rootScript = root.scripts?.typecheck ?? '';
if (/--if-present/.test(rootScript)) {
  console.error('   the root typecheck script carries --if-present, which turns a');
  console.error('   workspace without the script into a silent pass. Refusing.');
  process.exit(1);
}
if (missing.length) {
  console.error(`   workspace(s) with no typecheck script: ${missing.join(', ')}`);
  console.error('   A workspace that cannot be type-checked must FAIL here, not be');
  console.error('   skipped — a green report over a fraction of the product is worse');
  console.error('   than no report (lessons/L-006).');
  process.exit(1);
}
CHECK_WORKSPACES
npm run typecheck
echo

echo "── 4/4 · the entry point that serves booking.pumasi.ai"
node - <<'WORKER_DISCLOSURE'
const fs = require('node:fs');
// wrangler.jsonc carries // comments, so `main` is read with a scoped regex
// rather than a JSON parse that would need a comment stripper of its own.
const jsonc = fs.readFileSync('service/wrangler.jsonc', 'utf8');
const m = /"main"\s*:\s*"([^"]+)"/.exec(jsonc);
if (!m) { console.error('   service/wrangler.jsonc declares no "main"'); process.exit(1); }
const main = m[1];
console.log(`   service/wrangler.jsonc names "${main}" as the deployed entry point.`);

// Whether it is type-checked is READ FROM THE TREE, never written from memory:
// the day someone stops excluding it, this sentence changes with them.
const holders = [];
for (const cfg of ['service/tsconfig.json', 'service/tsconfig.test.json']) {
  const t = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  const excluded = (t.exclude ?? []).includes(main);
  console.log(`   ${cfg}: ${excluded ? 'EXCLUDES' : 'includes'} ${main}`);
  if (!excluded) holders.push(cfg);
}
if (holders.length === 0) {
  console.log('   => NOTHING in this repository type-checks the build every hosted');
  console.log('      user meets. The check below is a BUNDLE, not a type-check:');
  console.log('      wrangler bundles with esbuild, which strips types without');
  console.log('      reading them. It catches a missing module, a broken import or');
  console.log('      a bad binding; it catches no type error. Closing that gap is');
  console.log('      spec/0008 §5 finding 1, on the product manager\'s list.');
} else {
  console.log(`   => ${main} is type-checked by ${holders.join(' and ')}; the bundle`);
  console.log('      below is an additional check, not the only one.');
}
WORKER_DISCLOSURE
DRYRUN_OUT="$(mktemp -d)"
( cd service && npx wrangler deploy --dry-run --outdir "$DRYRUN_OUT" )
rm -rf "$DRYRUN_OUT"
echo

echo "══ done. What this run did NOT check, restated so it cannot be read off a tick:"
echo "   · service/test/browser-live.test.ts — the live site, see 2/4 above."
echo "   · the TYPES of the deployed worker entry point — see 4/4 above."
echo "   · anything about the deployment itself. This script cannot deploy: its"
echo "     only wrangler call is a --dry-run, and SPEC-0008 case A-006 fails if"
echo "     that ever stops being true."
