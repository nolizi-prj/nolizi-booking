/**
 * S9b — booking limits over periods longer than a day, and over booked TIME.
 *
 * GAP-0004 §2 names these as a known bug source in both incumbents, and the
 * boundaries are where the bugs live: an ISO week that belongs to the previous
 * year, a month edge, and the difference between "the cap is met" and "taking
 * this would cross the cap".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, periodKey } from '../src/index.ts';
import { Temporal } from '@js-temporal/polyfill';
import type { ComputeSlotsRequest } from '../src/types.ts';

const base = (over: Partial<ComputeSlotsRequest> = {}): ComputeSlotsRequest => ({
  owner_timezone: 'UTC',
  availability: [
    { weekday: 'MO', start: '09:00', end: '17:00' },
    { weekday: 'TU', start: '09:00', end: '17:00' },
    { weekday: 'WE', start: '09:00', end: '17:00' },
    { weekday: 'TH', start: '09:00', end: '17:00' },
    { weekday: 'FR', start: '09:00', end: '17:00' },
  ],
  duration_minutes: 60,
  granularity_minutes: 60,
  minimum_notice_minutes: 0,
  maximum_horizon_days: 60,
  query: { from: '2026-06-01T00:00:00Z', to: '2026-06-06T00:00:00Z' },
  now: '2026-06-01T00:00:00Z',
  ...over,
});

const days = (slots: { start: string }[]) =>
  [...new Set(slots.map((s) => s.start.slice(0, 10)))].sort();

test('periodKey uses the ISO week, including the year it belongs to', () => {
  const at = (iso: string) => Temporal.Instant.from(iso);
  // 2027-01-01 is a Friday: ISO week 53 OF 2026, not week 1 of 2027.
  assert.equal(periodKey('UTC', at('2027-01-01T12:00:00Z'), 'week'), '2026-W53');
  assert.equal(periodKey('UTC', at('2027-01-04T12:00:00Z'), 'week'), '2027-W01');
  assert.equal(periodKey('UTC', at('2026-06-15T12:00:00Z'), 'month'), '2026-06');
  assert.equal(periodKey('UTC', at('2026-06-15T12:00:00Z'), 'year'), '2026');
  // The owner's zone decides the day, not UTC.
  assert.equal(periodKey('America/Chicago', at('2026-06-02T02:00:00Z'), 'day'), '2026-06-01');
});

test('a weekly cap counts across the whole week, not per day', () => {
  const r = computeSlots(base({
    booking_limits: [{ period: 'week', max_bookings: 3 }],
    booked_by_period: { week: { '2026-W23': { bookings: 3, minutes: 180 } } },
  }));
  assert.equal(r.slots.length, 0, 'the week is full, so no day in it may be booked');

  const under = computeSlots(base({
    booking_limits: [{ period: 'week', max_bookings: 3 }],
    booked_by_period: { week: { '2026-W23': { bookings: 2, minutes: 120 } } },
  }));
  assert.ok(under.slots.length > 0, 'one place left means times are still offered');
});

test('the cap refuses the booking that would CROSS it, not the one that meets it', () => {
  // Two booked, cap of three: the third is still offered.
  const atTwo = computeSlots(base({
    booking_limits: [{ period: 'month', max_bookings: 3 }],
    booked_by_period: { month: { '2026-06': { bookings: 2, minutes: 120 } } },
  }));
  assert.ok(atTwo.slots.length > 0);
  // Three booked, cap of three: nothing further.
  const atThree = computeSlots(base({
    booking_limits: [{ period: 'month', max_bookings: 3 }],
    booked_by_period: { month: { '2026-06': { bookings: 3, minutes: 180 } } },
  }));
  assert.equal(atThree.slots.length, 0);
});

test('a duration cap counts minutes, and the slot must fit inside what is left', () => {
  // 300 of 360 minutes used, and each slot is 60: exactly one more fits.
  const fits = computeSlots(base({
    booking_limits: [{ period: 'week', max_minutes: 360 }],
    booked_by_period: { week: { '2026-W23': { bookings: 5, minutes: 300 } } },
  }));
  assert.ok(fits.slots.length > 0, 'an hour still fits in the hour that remains');

  // 330 used: a 60-minute meeting would cross 360, so nothing is offered,
  // even though the count of bookings is irrelevant here.
  const doesNot = computeSlots(base({
    booking_limits: [{ period: 'week', max_minutes: 360 }],
    booked_by_period: { week: { '2026-W23': { bookings: 5, minutes: 330 } } },
  }));
  assert.equal(doesNot.slots.length, 0, 'a slot that would overrun the cap is refused');
});

test('limits combine: every one of them must allow the slot', () => {
  const r = computeSlots(base({
    booking_limits: [
      { period: 'day', max_bookings: 5 },
      { period: 'week', max_bookings: 100 },
      { period: 'month', max_minutes: 60 },
    ],
    booked_by_period: {
      day: { '2026-06-01': { bookings: 0, minutes: 0 } },
      month: { '2026-06': { bookings: 1, minutes: 60 } },
    },
  }));
  assert.equal(r.slots.length, 0, 'the monthly minute cap alone closes the month');
});

test('a limit on one period leaves the neighbouring period alone', () => {
  const r = computeSlots(base({
    query: { from: '2026-06-01T00:00:00Z', to: '2026-06-13T00:00:00Z' },
    booking_limits: [{ period: 'week', max_bookings: 1 }],
    booked_by_period: { week: { '2026-W23': { bookings: 1, minutes: 60 } } },
  }));
  const offered = days(r.slots);
  assert.ok(offered.every((d) => d >= '2026-06-08'), 'the full week still offered times');
  assert.ok(offered.length > 0, 'the next week was closed along with it');
});

test('no limits means no change — the amendment is additive', () => {
  const before = computeSlots(base());
  const after = computeSlots(base({ booking_limits: [], booked_by_period: {} }));
  assert.deepEqual(after.slots, before.slots);
});
