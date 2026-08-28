/**
 * Unit tests for zone.ts.
 *
 * These are ADDITIONAL to the acceptance suite, not a substitute. The suite in
 * spec/0001-scheduling-core is the truth about what the engine must do; this
 * file covers implementation edges that the suite deliberately does not reach
 * into, and the defensive guards that exist because a first implementation got
 * them wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWallTime, materializeWindow, weekdayOf } from '../src/zone.ts';

const NY = 'America/New_York';
const APIA = 'Pacific/Apia';

test('classifyWallTime distinguishes normal, ambiguous and nonexistent', () => {
  assert.equal(classifyWallTime(NY, '2026-06-01', '09:00').kind, 'normal');
  assert.equal(classifyWallTime(NY, '2026-03-08', '02:30').kind, 'nonexistent');
  assert.equal(classifyWallTime(NY, '2026-11-01', '01:30').kind, 'ambiguous');
});

test('an ambiguous time reports the EARLIER occurrence first (S1)', () => {
  const r = classifyWallTime(NY, '2026-11-01', '01:00');
  assert.equal(r.kind, 'ambiguous');
  if (r.kind !== 'ambiguous') return;
  assert.equal(r.instant.toString(), '2026-11-01T05:00:00Z');
  assert.equal(r.second.toString(), '2026-11-01T06:00:00Z');
});

test('a skipped CALENDAR DAY is nonexistent, not ambiguous', () => {
  // Pacific/Apia had no 2011-12-30. The same wall time exists on the adjacent
  // date, so comparing only HH:MM reports a fold that never happened.
  assert.equal(classifyWallTime(APIA, '2011-12-30', '12:00').kind, 'nonexistent');
  assert.equal(classifyWallTime(APIA, '2011-12-29', '12:00').kind, 'normal');
  assert.equal(classifyWallTime(APIA, '2011-12-31', '12:00').kind, 'normal');
});

test('half-hour DST offsets are handled (Lord Howe shifts by 30 minutes)', () => {
  const r = classifyWallTime('Australia/Lord_Howe', '2026-04-05', '01:45');
  assert.ok(r.kind === 'ambiguous' || r.kind === 'normal');
});

test('materializeWindow: a plain window is exactly its length', () => {
  const r = materializeWindow(NY, '2026-06-01', '09:00', '11:00');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.window.start.toString(), '2026-06-01T13:00:00Z');
  assert.equal(r.window.end.toString(), '2026-06-01T15:00:00Z');
});

test('materializeWindow: spring-forward window is two hours, not three (S2)', () => {
  const r = materializeWindow(NY, '2026-03-08', '01:00', '04:00');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.window.start.toString(), '2026-03-08T06:00:00Z');
  assert.equal(r.window.end.toString(), '2026-03-08T08:00:00Z');
});

test('materializeWindow: fall-back window is three hours, not two (S4)', () => {
  const r = materializeWindow(NY, '2026-11-01', '01:00', '03:00');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.window.start.toString(), '2026-11-01T05:00:00Z');
  assert.equal(r.window.end.toString(), '2026-11-01T08:00:00Z');
  assert.equal(r.window.ambiguousStart, true);
});

test('materializeWindow: an overnight window resolves its end on the next date', () => {
  const r = materializeWindow(NY, '2026-06-01', '22:00', '02:00');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.window.start.toString(), '2026-06-02T02:00:00Z');
  assert.equal(r.window.end.toString(), '2026-06-02T06:00:00Z');
});

test('materializeWindow: a nonexistent start is refused, never shifted (S3)', () => {
  const r = materializeWindow(NY, '2026-03-08', '02:00', '05:00');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'nonexistent_start');
});

test('materializeWindow: an end skipped by a transition is refused, not extended', () => {
  // 02:30 does not occur on the 8th. S1 bounds the search to D and D+1, so this
  // is malformed rather than a 27-hour window ending on the 9th.
  const r = materializeWindow(NY, '2026-03-07', '23:00', '02:30');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, 'nonexistent_end');
});

test('materializeWindow: never returns a window that does not advance', () => {
  // The defensive guard. A zero-length or inverted window would produce no
  // slots and no diagnostic, which is indistinguishable from a fully booked
  // day — the failure mode is silence, so it must be refused explicitly.
  for (const [tz, date, s, e] of [
    [NY, '2026-06-01', '09:00', '09:00'],
    [APIA, '2011-12-29', '22:00', '12:00'],
  ] as const) {
    const r = materializeWindow(tz, date, s, e);
    if (r.ok) {
      assert.ok(
        r.window.end.epochNanoseconds > r.window.start.epochNanoseconds,
        `${tz} ${date} ${s}-${e} produced a non-advancing window`,
      );
    }
  }
});

test('weekdayOf matches ISO weekday codes', () => {
  assert.equal(weekdayOf('2026-06-01'), 'MO');
  assert.equal(weekdayOf('2026-06-07'), 'SU');
  assert.equal(weekdayOf('2028-02-29'), 'TU');
});
