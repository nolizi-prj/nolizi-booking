# SPEC-0008 · An advisory machine re-runs the checks, and says what it did not check

**Status:** draft — acceptance cases frozen at spec approval, before
implementation ·
**Intent:** [`INTENT.md`](INTENT.md) (veto window in `pumasi/DECISIONS.md`) ·
**Source:** [`roadmap/BACKLOG.md` item 2](../../roadmap/BACKLOG.md), ranked
there by the product-manager evaluation of 2026-08-31 (`f16964e`), and
escalated in parallel as `pumasi/DECISIONS.md` **Q-025**, whose *default on
silence* is this work.
**Acceptance:** [`acceptance/cases.json`](acceptance/cases.json), frozen
2026-08-31 at spec approval. Runner: `service/test/ci-workflow.test.ts`.

**Risk class: can-hurt** — settled here rather than inherited, §4.

**Scope.** This item adds a checking machine. It changes **no product source
file**, ships **no bytes to any user**, and **deletes, skips or edits no test**.
It adds one missing `typecheck` script and makes the root `typecheck` command
mean what it says.

---

## 0 · The defect, stated precisely

Every fact below was measured against the working tree at `f16964e` on
2026-08-31 between 12:35 and 13:45 local, by this seat, and each names how it
was taken.

- **D-a · There is no CI.** `.github/` contains exactly one entry,
  `feedback-attachments`; there is no `.github/workflows/` directory;
  `gh run list -R pumasi-ai/pumasi-booking` returns empty. So `GATE: PASS` in
  four release notes, the counts in `roadmap/STAGE.md`, and six frozen
  acceptance suites are each a report by the agent that wrote the change, of a
  script it chose to run on a machine nobody else can open. `tools/gate.sh` is
  not in this repository at all — it is `pumasi/tools/gate.sh`, run by hand
  from a commons checkout.

- **D-b · The obvious `typecheck` command checks one workspace of two.** Root
  `package.json`'s script is `npm run typecheck --workspaces --if-present`.
  `core/package.json` has a `typecheck`; **`service/package.json` does not.**
  Run at `f16964e`, `npm run typecheck` emits exactly one workspace's output —
  `@pumasi/booking-core` — and exits **0**. The workspace holding every line
  that touches HTTP, PostgreSQL, mail and sessions is skipped in silence. A
  machine running this command and publishing "typecheck green" would be
  putting a badge on a third of the product. *This is the L-006 shape at
  command scale: a check that cannot fail for the code it is read as covering.*

- **D-c · Nothing type-checks the build that serves `booking.pumasi.ai`.**
  `service/wrangler.jsonc:6` is `"main": "src/worker.ts"`.
  `service/tsconfig.json:10` and `service/tsconfig.test.json:5` both carry
  `"exclude": ["src/worker.ts"]`. So `npm run build` does not emit it and
  `npm test` does not compile it. It is checked by `wrangler` at deploy time
  and by nothing else. This is `Q-018`'s shape on `pumasi-sign` — a green suite
  over a tree no user reaches — found here from the other side.

- **D-d · Nineteen of the thirty-one service test files start a real
  PostgreSQL server.** They `import EmbeddedPostgres from 'embedded-postgres'`
  (`service/test/concurrency.test.ts:18` and eighteen others), each on its own
  port and data directory; `node --test` runs files concurrently, so this is
  many PostgreSQL instances at once. It needs no service container and no
  credential: `@embedded-postgres/linux-x64` (60 MB) is an ordinary optional
  npm dependency, so `npm ci` is the whole setup. **`pumasi/DECISIONS.md`
  Q-025's named alternative says this repository "needs a PostgreSQL service
  for the exclusivity proofs" — measured here, it does not.**

- **D-e · One test drives the live production site over the network.**
  `service/test/browser-live.test.ts` launches puppeteer with
  `executablePath: '/usr/bin/google-chrome'` (line 8) and asserts against
  `https://booking.pumasi.ai/` — status, `h1` text, `.sso-btn` elements, a real
  Google SSO redirect, a live `/readyz`. It is the only file in the suite that
  reaches an external host; every other occurrence of a `googleapis.com`,
  `graph.microsoft.com` or `booking.pumasi.ai` string in `service/test/` is a
  fixture, checked file by file. In a shared runner this file makes a result
  depend on a third party's uptime and on a deployment **four merged builds
  stale** (`BACKLOG.md` item 1, `Q-012` open).

- **D-f · The suite's greenness is a property of the machine, not only of the
  code.** Measured this tick at `f16964e`, all 311 service checks, `npm test`
  as the product defines it:

  | condition | result | leftovers in `/tmp` |
  |---|---|---|
  | 16-way (default on this 16-core box), load avg ≈ 11 | 311 tests, **13–32 fail** across five runs | 1–3 stale `pumasi-pg-*` dirs |
  | `--test-concurrency=4`, same load | **311 pass, 0 fail** (33.5 s) | none |
  | 16-way, load avg ≈ 4 | **311 pass, 0 fail** ×2 (19.5 s) | none |

  Every failure was a `before` hook — `initdb: directory … exists but is not
  empty`, or `could not bind IPv4 address "127.0.0.1": Address already in
  use` — and **not once an assertion**. A run that fails also leaves its data
  directory behind, and that directory then fails the *next* run of that file
  until someone deletes it, so the suite is not repeatable back-to-back on a
  busy machine. Job `0030`'s "40 of 40 green" is not contradicted by this; it
  is scoped by it. This is a real property of the suite and **this spec does
  not tune it away** — see §5.

## 1 · What ships

Five files and two one-line script changes. No file under `service/src/`,
`core/src/`, or `roadmap/` is touched.

- **`.github/workflows/ci.yaml`** — the advisory workflow. Triggers on `push`
  and `pull_request`. One job. It installs and calls `tools/ci.sh` and adds no
  check of its own, so *what CI checks* is answerable by reading one script in
  the repository rather than reconstructing it from a YAML step list.
- **`tools/ci.sh`** — the checks, runnable by hand by anyone, identical to what
  the machine runs. §2.
- **`service/package.json`** — gains `"typecheck": "tsc -p tsconfig.json
  --noEmit"`. Verified passing on `f16964e` **as-is, with nothing narrowed**:
  `npx tsc -p tsconfig.json --noEmit` in `service/` exits 0.
- **root `package.json`** — `typecheck` drops `--if-present`. With both
  workspaces now carrying the script, the command that says it checks every
  workspace does.
- **`spec/0008/`** — this spec, its intent, and the frozen cases.
- **`service/test/ci-workflow.test.ts`** — the acceptance runner. It lives in
  the service suite deliberately: the frozen cases for the checking machine are
  then run *by* the checking machine, and by `tools/gate.sh`, on every change.

## 2 · What `tools/ci.sh` runs — and what it does not

The script prints each of these, in the run log, every time. The obligation is
symmetric: it may not claim more than it did, and it may not quietly do less.

**It runs:**

1. **`npm test -w @pumasi/booking-core`** — the core workspace's own command,
   unmodified: 19 checks plus the SPEC-0001 acceptance runner.
2. **The service suite, every file but one.** It compiles with the product's
   own `npm run build:test`, takes the same `.build/test/*.test.js` glob the
   product's `test` script uses, and removes exactly `browser-live.test.js`.
   It **fails** if that file is not in the glob — an exclusion that names a
   file which is not there is a lie the moment someone renames it — and it
   **fails** if more than one file would be removed. It prints the count run,
   the count excluded, and the reason.
3. **`npm run typecheck` at the root**, after asserting that **every** workspace
   declared in root `package.json` has a `typecheck` script. A workspace with
   no such script is a **failure**, not a skip. This is D-b, closed at the
   command rather than papered over in YAML.
4. **`npx wrangler deploy --dry-run`** in `service/`, which bundles
   `src/worker.ts` — the entry point that serves `booking.pumasi.ai`. Verified
   this tick to need **no credential**: run with `HOME` and `WRANGLER_HOME`
   pointed at an empty directory and `CLOUDFLARE_API_TOKEN` empty, it exits
   **0**. So this raises no `HUMAN.md` item and remains a no-spend change.

**It does not run, and says so by name:**

- **`service/test/browser-live.test.ts`** — D-e. The line in the log states the
  file, that it drives `https://booking.pumasi.ai` in a real browser, and that
  the deployment is behind `main`. Because that is the only puppeteer test in
  the suite, the workflow also sets `PUPPETEER_SKIP_DOWNLOAD=true`, which is the
  same decision stated once rather than twice.
- **A type-check of `src/worker.ts`.** Step 4 is a **bundle**, not a
  type-check: `wrangler` bundles with esbuild, which strips types without
  reading them. The script does not assert this from memory — it **reads both
  `service/tsconfig.json` and `service/tsconfig.test.json` at run time** and
  prints what it finds, so the day someone stops excluding `worker.ts` the
  sentence changes with the tree instead of becoming a stale claim
  (`L-009`: the scope arrives with the claim). Making it a real type-check
  needs `@cloudflare/workers-types`, a third tsconfig and `.sql` module
  declarations; probed this tick, `worker.ts` produces **17** errors under the
  service's existing compiler options, every one of them a missing Workers
  runtime type rather than a defect — repairing them is product configuration
  work this item may not take. Handed to the product manager, §5.
- **Anything that deploys, writes, or holds a secret.** The workflow declares
  `permissions: contents: read`, references no secret, and uses `pull_request`
  rather than `pull_request_target`, so a fork's pull request runs untrusted
  code with a read-only token and nothing to steal.

## 3 · Advisory — what this explicitly is not

- No branch protection. No required status check. No ruleset. Measured before
  the change: `gh api …/branches/main/protection` → **404 "Branch not
  protected"**, `gh api …/rulesets` → **`[]`**. This change ships no
  configuration that alters either, and asks the steward for none.
- **CHARTER §3's merge gate is untouched.** `GATE: PASS` still means what it
  has always meant: an agent ran `pumasi/tools/gate.sh` and signed the record.
  Whether that should change is **Q-025**, open, whose default keeps the
  charter exactly as written. This spec takes that default and does not argue
  the question.
- A red run here blocks nothing and reverts nothing. It is information.

## 4 · Risk class — settled, not inherited

**can-hurt.**

`service/spec/0002/RISK_ZONES.yaml` maps `README.md`, `INTENT.md` and
`acceptance/` to `ordinary` and everything else to `can_hurt`, with
`unmapped_or_unclear_defaults_to: can_hurt` and
`reclassification_to_ordinary: requires_can_hurt_procedure`. The paths this
change touches — `.github/workflows/`, `tools/`, root and service
`package.json` — are unmapped. **The register's own rule is therefore
`can_hurt`, and calling it `ordinary` would itself be a can-hurt act**, which
is not a thing a spec may do to itself. That is the whole argument; the
temptation to reason from "it ships nothing to a user" to `ordinary` is exactly
the loophole-finding the register's `why_everything` refuses.

There is also a real hazard to name rather than wave away, and it is the reason
this classification is not merely bureaucratic: **a workflow file in a public
repository is a privilege surface.** `pull_request_target`, a writable token, or
a secret in the environment would let a stranger's pull request run code with
the repository's own rights. This spec's answer is `permissions: contents:
read`, no secrets, and `pull_request` — and **A-004 makes that checkable rather
than promised.**

Release therefore takes a published note and the 7-day window (CHARTER Part 4).
The stage is `beta`, so under Part 0 the window does not hold the work: it
merges now and a veto reverts. Nothing here is irreversible — the change is one
file deletion away from undone, ships no byte to a user, sends no mail, grants
no credential.

## 5 · Found, not fixed — for `roadmap/BACKLOG.md`

Recorded here so the product manager can rank them, and *not* quietly folded
into this item.

1. **`src/worker.ts` is type-checked by nothing** (D-c). The build that serves
   every hosted user. Closing it means a `@cloudflare/workers-types`
   dependency, a `tsconfig.worker.json`, and `.sql` module declarations; the 17
   errors measured are all missing-runtime-type, but a real check may surface
   real ones, and their repair is product work.
2. **The suite is load-sensitive** (D-f). 13–32 of 311 fail on a busy 16-core
   machine, always in an `embedded-postgres` `before` hook, never on an
   assertion; a failed run leaves a data directory that fails the next run of
   that file. A fix is plausibly small — unique temporary directories per run,
   or a bounded `--test-concurrency` in the product's own `test` script — but
   it is a change to how every agent runs the suite and it belongs on the list,
   not in a CI item that would then be tuning the thermometer.
3. **`pumasi/catalog.json` disagrees with this product about itself.** It
   carries `"status": "seed"` against `beta` in `roadmap/STAGE.md`, and
   `items[].tests.service` reads `246` against the **311** measured here.
   Owned by nobody (`Q-019`); recorded, not edited.
4. **`Q-025`'s named alternative overstates this repository's CI cost** (D-d).
   It says a machine-run gate here "needs a PostgreSQL service"; the suite
   brings its own PostgreSQL as an npm dependency and needs no service
   container and no credential. Worth correcting before the alternative is
   priced against the default.

## 6 · Acceptance

Six cases, frozen at approval in
[`acceptance/cases.json`](acceptance/cases.json), run by
`service/test/ci-workflow.test.ts`.

| id | what it holds | red on the change-absent tree? |
|---|---|---|
| A-001 | a workflow exists and runs on `push` and `pull_request` | **red** |
| A-002 | the service run is the whole suite minus exactly one named, announced file | **red** |
| A-003 | no workspace is silently skipped by the type-check | **red** |
| A-004 | the workflow is advisory and unprivileged; no blocking configuration ships | green — §6.1 |
| A-005 | a red run is possible and is not swallowed | **red** |
| A-006 | the served entry point is bundled every run, the run never deploys, and the type-check claim is derived from the tree | **red** |

### 6.1 · Why A-004 is correctly green before

A-004 has two halves. The half that binds on the final tree — the workflow's
`permissions`, its trigger, its lack of secrets — **has nothing to bind on when
no workflow exists**, and an assertion with nothing to bind on is the L-006 hole
this project has been bitten by twice. So A-004 carries a second half that runs
identically on both trees and over real files: **no file anywhere in the
repository requests a required status check, branch protection or a ruleset.**
That half is a genuine check of the change-absent tree, and it is the half that
states the property the item promises. The first half is disclosed on the case
itself as vacuous-before, with its named mutation, rather than being allowed to
read as evidence.

**The live absence of branch protection is a measurement, not a case.** It
needs `gh` and a credential the runner does not have, and a case that announces
itself as skipped is a case that cannot fail. It is recorded in §3 and re-taken
in the implementation report.

### 6.2 · Every green case names the mutation that turns it red

Each case in `cases.json` carries a `single_mutation_that_turns_it_red`, and
the implementation report records that mutation being **run** and the case
going red. A case whose redness has not been observed is a claim, and this is
the one item on the roadmap that exists because claims were being taken for
evidence.
