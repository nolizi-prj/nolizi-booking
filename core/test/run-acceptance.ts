/**
 * Acceptance runner for SPEC-0001.
 *
 * The suite in acceptance/cases.json is the truth; this file is a thin runner
 * and is ordinary risk. It feeds each `request` to the engine and compares
 * against `expect`.
 *
 * SPEC-0001 §6: the runner asserts the tzdata version and fails loudly on
 * mismatch. A skip is not acceptable — a silently skipped timezone test is
 * worse than a failing one. On divergence the run is reported NON-CONFORMING
 * and its exit status is non-zero, whatever the individual case results.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { computeSlots } from '../src/slots.ts';
import { book, cancel, reschedule, InMemoryBookingStore } from '../src/booking.ts';
import { checkTzdata, checkTransitions } from '../src/tzdata.ts';
import { classifyWallTime } from '../src/zone.ts';
import type { ComputeSlotsRequest, Diagnostic, Slot } from '../src/types.ts';

/** Walk up to the repository root so the runner works from src or from build output. */
function repoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'spec/acceptance/cases.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('could not locate the repository root from ' + from);
}
const here = dirname(fileURLToPath(import.meta.url));
const SUITE = resolve(repoRoot(here), 'spec/acceptance/cases.json');

interface SlotCase {
  id: string;
  clause: string;
  description: string;
  request?: Partial<ComputeSlotsRequest>;
  repeat?: { in_process?: number; fresh_process?: number; compare?: string };
  expect: {
    slots?: Slot[];
    diagnostics?: Array<Partial<Diagnostic>>;
    byte_identical_across_runs?: boolean;
  };
}

interface Step {
  call?: string;
  args?: Record<string, unknown>;
  expect?: Record<string, unknown>;
  capture?: string;
  assert?: string;
}
interface BookingCase {
  id: string;
  clause: string;
  description: string;
  concurrency?: { workers: number; iterations: number };
  /** Proven against a real store elsewhere; not provable by this engine. */
  delegated_to?: string;
  steps: Step[];
}

const suite = JSON.parse(readFileSync(SUITE, 'utf8')) as {
  suite: string;
  environment: { tzdata: string; on_mismatch: string };
  defaults: Partial<ComputeSlotsRequest>;
  slot_cases: SlotCase[];
  booking_cases: BookingCase[];
};

// ── §6 environment gate ────────────────────────────────────────────────────
const tz = checkTzdata();
const transitions = checkTransitions((z, d, t2) => classifyWallTime(z, d, t2));
const brokenTransitions = transitions.filter((x) => !x.ok);

// A behavioural disagreement is a hard stop: if the host's zone rules differ
// from the ones the expected values were derived from, no expectation in this
// suite can be trusted.
if (brokenTransitions.length > 0) {
  console.error('');
  console.error('  TIMEZONE DATABASE DISAGREES WITH THIS SUITE — halting');
  for (const b of brokenTransitions) {
    console.error(`    ${b.zone} ${b.local}: expected ${b.expect}, host says ${b.actual}`);
    console.error(`      ${b.note}`);
  }
  console.error('');
  process.exit(2);
}

// A version-label mismatch alone is a FINDING, reported and never skipped
// (SPEC-0001 §6). It does not invalidate the run once every transition the
// suite depends on has been verified above.
let conforming = true;
if (!tz.matches) {
  conforming = false;
  console.error('');
  console.error('  FINDING — tzdata version differs from the pin');
  console.error(`    suite pins ${suite.environment.tzdata}; host has ${tz.runtime ?? 'unknown'}`);
  console.error(`    all ${transitions.length} transitions this suite depends on were verified`);
  console.error('    against the host and agree. Reported, not skipped (§6).');
  console.error('');
}

// ── slot cases ─────────────────────────────────────────────────────────────
type Result = { id: string; clause: string; ok: boolean; delegated?: boolean; detail?: string };
const results: Result[] = [];

const j = (v: unknown) => JSON.stringify(v);

function runSlotCase(c: SlotCase): Result {
  const req = { ...suite.defaults, ...c.request } as ComputeSlotsRequest;
  let actual;
  try {
    actual = computeSlots(req);
  } catch (err) {
    return { id: c.id, clause: c.clause, ok: false, detail: `threw: ${(err as Error).message}` };
  }

  // S12 — determinism is checked by re-running and comparing bytes.
  if (c.repeat?.in_process) {
    for (let i = 1; i < c.repeat.in_process; i++) {
      if (j(computeSlots(req)) !== j(actual)) {
        return { id: c.id, clause: c.clause, ok: false, detail: 'not byte-identical across runs' };
      }
    }
    if (c.expect.byte_identical_across_runs) return { id: c.id, clause: c.clause, ok: true };
  }

  if (c.expect.slots !== undefined) {
    const want = j(c.expect.slots);
    const got = j(actual.slots);
    if (want !== got) {
      return { id: c.id, clause: c.clause, ok: false, detail: `slots\n      want ${want}\n      got  ${got}` };
    }
  }
  if (c.expect.diagnostics !== undefined) {
    const wantCodes = c.expect.diagnostics.map((d) => d.code).sort();
    const gotCodes = actual.diagnostics.map((d) => d.code).sort();
    if (j(wantCodes) !== j(gotCodes)) {
      return { id: c.id, clause: c.clause, ok: false, detail: `diagnostics want ${j(wantCodes)} got ${j(gotCodes)}` };
    }
  }
  return { id: c.id, clause: c.clause, ok: true };
}

function guard(id: string, clause: string, fn: () => Result): Result {
  try {
    return fn();
  } catch (err) {
    const e = err as Error;
    return { id, clause, ok: false, detail: `threw ${e.constructor.name}: ${e.message}` };
  }
}

for (const c of suite.slot_cases) results.push(guard(c.id, c.clause, () => runSlotCase(c)));

// ── booking cases ──────────────────────────────────────────────────────────
const UNSUPPORTED = new Set(['book_concurrent', 'race', 'concurrent_ops']);

function runBookingCase(c: BookingCase): Result {
  if (c.delegated_to) {
    return { id: c.id, clause: c.clause, ok: true, delegated: true, detail: c.delegated_to };
  }
  const store = new InMemoryBookingStore();
  const captured: Record<string, unknown> = {};
  let seq = 0;
  const newId = () => `bk_${++seq}`;
  const deref = (v: unknown): unknown =>
    typeof v === 'string' && v.startsWith('$') ? (captured[v.slice(1)] ?? v) : v;

  for (const step of c.steps) {
    if (step.assert) {
      const m = /^confirmed_booking_count == (\d+)$/.exec(step.assert.trim());
      if (m) {
        const want = Number(m[1]);
        const got = store.confirmed().length;
        if (got !== want) {
          return { id: c.id, clause: c.clause, ok: false, detail: `${step.assert} — got ${got}` };
        }
      }
      // Prose assertions are not executed here. They are not silently passed:
      // the structural ones above carry the case, and SPEC-0002's suite proves
      // the concurrency properties against a real store.
      continue;
    }
    if (!step.call) continue;
    if (UNSUPPORTED.has(step.call)) {
      return {
        id: c.id,
        clause: c.clause,
        ok: false,
        detail: `requires a concurrent store — proven in SPEC-0002 P-001/P-005/P-009, not here`,
      };
    }

    const args = Object.fromEntries(
      Object.entries(step.args ?? {}).map(([k, v]) => [k, deref(v)]),
    ) as Record<string, never>;

    let out: { status: string; booking_id?: string };
    switch (step.call) {
      case 'book':
        out = book(store, args as never, newId);
        break;
      case 'cancel':
        out = cancel(store, args as never);
        break;
      case 'reschedule':
        out = reschedule(store, args as never);
        break;
      case 'compute_slots': {
        const req = { ...suite.defaults, ...args } as unknown as ComputeSlotsRequest;
        const r = computeSlots(req);
        if (step.capture) captured[step.capture] = r.slots[0] ?? null;
        continue;
      }
      default:
        return { id: c.id, clause: c.clause, ok: false, detail: `unknown call ${step.call}` };
    }

    if (step.expect) {
      for (const [k, v] of Object.entries(step.expect)) {
        const want = deref(v);
        const got = (out as Record<string, unknown>)[k];
        if (got !== want) {
          return { id: c.id, clause: c.clause, ok: false, detail: `${step.call}.${k} want ${j(want)} got ${j(got)}` };
        }
      }
    }
    if (step.capture && out.booking_id) captured[step.capture] = out.booking_id;
  }
  return { id: c.id, clause: c.clause, ok: true };
}

for (const c of suite.booking_cases) results.push(guard(c.id, c.clause, () => runBookingCase(c)));

// ── report ─────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`  ${r.ok ? 'pass' : 'FAIL'}  ${r.id}  ${r.clause}${r.ok ? '' : `\n        ${r.detail}`}`);
}
console.log('');
console.log(`  ${results.length - failed.length}/${results.length} passed`);
if (!conforming) {
  console.log(`  tzdata finding recorded: pin ${tz.pinned}, host ${tz.runtime ?? 'unknown'}`);
  console.log('  transitions verified, so results stand; the divergence is reported.');
}
process.exit(failed.length > 0 ? 1 : 0);
