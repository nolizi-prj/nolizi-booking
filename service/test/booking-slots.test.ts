/**
 * SPEC-0008 acceptance runner — a day the calendar marks available shows that
 * day's times. Frozen cases: service/spec/0008/acceptance/cases.json.
 *
 * `cases.json` is the truth; this file is the executable form of it.
 *
 * This is the defect a named user reported as issue #32: on
 * `booking.pumasi.ai/yunyoungmok/abc` the month grid rendered 1 and 2 as
 * available, the heading said "Wednesday, September 2", and the times list
 * beneath it was empty. Four earlier passes could not diagnose it because the
 * failure is client-side and no assertion in this suite ever ran the page's
 * own JavaScript. That is the gap this file closes: the renderer in
 * `pages.ts` was never executed by anything, on either build, so a deleted
 * `appendChild` shipped and lived for days behind a green suite.
 *
 * B-001, B-002, B-003 and B-004 must FAIL against the tree at `c000feb` — for
 * a defect spec the proof is that the test fails *before* (lessons/L-006).
 * B-005 and B-006 are green on both sides on purpose: they are the claim that
 * nothing else moved, and a claim that cannot fail is decoration, so each
 * names the deliberate mutation that turns it red.
 *
 * The page under test is the tree's own `bookingPage()` output, served over
 * loopback and driven in Chrome. It is not a copy of the renderer and not a
 * re-implementation of it: a test that asserts against an extracted string
 * would have passed at `c000feb` too, because the extracted string was
 * byte-identical on both sides — that identity is exactly what job `0061`
 * measured. Only running it catches this.
 *
 * No network. No deployment. The browser talks to a server this file starts.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { bookingPage } from '../src/pages.ts';
import type { Schedule } from '../src/schedules.ts';

/** The reporter's zone, from issue #32's own client diagnostics. */
const BOOKER_TZ = 'America/Chicago';

const sched: Schedule = {
  schedule_id: 'sched-32',
  owner_id: 'owner-32',
  slug: 'abc',
  title: 'Intro call',
  owner_timezone: 'America/Chicago',
  owner_name: 'Yun Youngmok',
  duration_minutes: 30,
  granularity_minutes: 30,
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  maximum_horizon_days: 60,
  max_bookings_per_day: null,
  max_bookings_per_week: null,
  max_bookings_per_month: null,
  max_minutes_per_day: null,
  max_minutes_per_week: null,
  availability_set_id: null,
  description: null,
  color: null,
  location_kind: 'meet',
  location_value: null,
  available_from: null,
  available_until: null,
  scheduling_kind: 'solo',
  recurrence_rule: null,
  require_email_verification: false,
  org_id: null,
};

/**
 * Modelled on the live payload this seat measured at 2026-09-01 03:21:28 UTC —
 * two consecutive days, starting 14:00Z, half-hourly, with the second day the
 * longer of the two. The counts here are chosen, not copied: 12 slots on
 * 2026-09-01 (14:00Z–19:30Z) and 13 on 2026-09-02 (14:00Z–20:00Z), which is 25
 * against the live page's 24 at that instant.
 *
 * In America/Chicago (CDT, UTC-5) that is 09:00–14:30 local on the 1st and
 * 09:00–15:00 on the 2nd, so each UTC day is also one Chicago day and the grid
 * marks exactly 1 and 2 — which is what B-005 holds fixed.
 */
function liveShapedSlots(): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  const push = (day: string, hh: number, mm: number) => {
    const s = new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
    out.push({ start: s.toISOString(), end: new Date(s.getTime() + 30 * 60_000).toISOString() });
  };
  // 2026-09-01: 14:00Z .. 19:30Z inclusive, half-hourly = 12 slots
  for (let i = 0; i < 12; i++) push('2026-09-01', 14 + Math.floor(i / 2), (i % 2) * 30);
  // 2026-09-02: 14:00Z .. 20:00Z inclusive, half-hourly = 13 slots
  for (let i = 0; i < 13; i++) push('2026-09-02', 14 + Math.floor(i / 2), (i % 2) * 30);
  return out;
}

const SLOTS = liveShapedSlots();
const DAY1 = SLOTS.filter((s) => s.start.startsWith('2026-09-01'));
const DAY2 = SLOTS.filter((s) => s.start.startsWith('2026-09-02'));

let server: Server;
let browser: Browser;
let origin: string;

before(async () => {
  const html = bookingPage(sched, SLOTS, { action: '/abc/book' });
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

/** One page, in the reporter's timezone, with every thrown error captured. */
async function open() {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: unknown) => errors.push(`PAGEERROR ${String(e)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
  await page.emulateTimezone(BOOKER_TZ);
  const res = await page.goto(`${origin}/`, { waitUntil: 'networkidle0' });
  assert.equal(res?.status(), 200, 'the page under test served');
  return { page, errors };
}

/**
 * The in-page expressions are strings, not callbacks, on purpose: this
 * workspace compiles with `lib: ["ES2022"]` and no DOM, which is what keeps
 * server code from referencing browser globals and typechecking clean. A test
 * that widened that lib to describe the page would weaken the guard it is
 * standing next to, so the page's own code stays outside the type system —
 * which is also where it lives at runtime.
 */
const evalIn = <T>(page: Page, expr: string): Promise<T> =>
  page.evaluate(expr) as Promise<T>;

/** The text of every time button actually in the list, in document order. */
const TIMES_TEXT = `[...document.querySelectorAll('#times .slot')].map(b => b.textContent || '')`;

test('B-001 · the day the page opens on shows that day\'s times', async () => {
  const { page, errors } = await open();
  try {
    const picked = await evalIn<string>(page, `document.getElementById('picked-day').textContent`);
    assert.equal(picked, 'Tuesday, September 1', 'opens on the first day that has slots');

    const shown = await evalIn<string[]>(page, TIMES_TEXT);
    assert.equal(
      shown.length,
      DAY1.length,
      `the heading names a day with ${DAY1.length} slots and the list beneath it must not be empty`,
    );
    assert.deepEqual(errors, [], 'nothing threw — the empty list is not an exception');
  } finally {
    await page.close();
  }
});

test('B-002 · clicking an available day shows that day\'s times — issue #32 as reported', async () => {
  const { page, errors } = await open();
  try {
    // The reporter clicked the 2nd. Click it the way a booker does.
    const clicked = await evalIn<boolean>(page, `(() => {
      const btn = [...document.querySelectorAll('#days button.has')].find(b => b.textContent === '2');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert.ok(clicked, 'the 2nd is rendered as available and is clickable');

    const picked = await evalIn<string>(page, `document.getElementById('picked-day').textContent`);
    assert.equal(picked, 'Wednesday, September 2', 'the heading follows the click');

    const shown = await evalIn<string[]>(page, TIMES_TEXT);
    assert.equal(
      shown.length,
      DAY2.length,
      'a booker who selects a day rendered as available must see that day\'s times',
    );
    assert.deepEqual(errors, [], 'nothing threw');
  } finally {
    await page.close();
  }
});

test('B-003 · the times shown are the booker\'s own local times, in order', async () => {
  const { page, errors } = await open();
  try {
    const shown = await evalIn<string[]>(page, TIMES_TEXT);
    // 14:00Z .. 19:30Z in America/Chicago (CDT, UTC-5) is 9:00 AM .. 2:30 PM.
    const expected = DAY1.map((s) =>
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: BOOKER_TZ })
        .format(new Date(s.start)));
    assert.deepEqual(shown, expected, 'each slot is printed once, converted, in start order');
    assert.equal(shown[0], '9:00 AM', 'the first slot of the day, in the reporter\'s zone');
    assert.deepEqual(errors, [], 'nothing threw');
  } finally {
    await page.close();
  }
});

test('B-004 · a shown time is bookable — it submits the server\'s own UTC instant (F2)', async () => {
  const { page, errors } = await open();
  try {
    const picked = await evalIn<
      { start: string; end: string; pressed: string | null; formOn: boolean } | null
    >(page, `(() => {
      const b = document.querySelector('#times .slot');
      if (!b) return null;
      b.click();
      return {
        start: document.getElementById('start').value,
        end: document.getElementById('end').value,
        pressed: b.getAttribute('aria-pressed'),
        formOn: document.getElementById('f').classList.contains('on'),
      };
    })()`);
    assert.ok(picked, 'there is a time to click');
    // F2 — the value submitted is the UTC instant the server sent, untouched.
    const first = DAY1[0]!;
    assert.equal(picked.start, first.start, 'start is the server\'s instant, unconverted');
    assert.equal(picked.end, first.end, 'end is the server\'s instant, unconverted');
    assert.equal(picked.pressed, 'true', 'the chosen time is marked chosen');
    assert.equal(picked.formOn, true, 'choosing a time reveals the form');
    assert.deepEqual(errors, [], 'nothing threw');
  } finally {
    await page.close();
  }
});

test('B-005 · the month grid marks exactly the days that have slots', async () => {
  // Green on both sides. Deliberate mutation that reddens it: change the
  // `if (byDay[key])` guard in pages.ts to `if (true)`.
  const { page } = await open();
  try {
    const has = await evalIn<string[]>(
      page, `[...document.querySelectorAll('#days button.has')].map(b => b.textContent)`);
    assert.deepEqual(has, ['1', '2'], 'September 1 and 2, and no other day');
  } finally {
    await page.close();
  }
});

test('B-006 · the booker\'s timezone is named on the page and travels with the booking', async () => {
  // Green on both sides. Deliberate mutation that reddens it: delete the
  // `document.getElementById('btz').value = tz` line in pages.ts.
  const { page } = await open();
  try {
    const seen = await evalIn<{ name: string; hidden: string }>(page, `({
      name: document.getElementById('tzname').textContent,
      hidden: document.getElementById('btz').value,
    })`);
    assert.equal(seen.name, BOOKER_TZ, 'the page says which zone it is showing');
    assert.equal(seen.hidden, BOOKER_TZ, 'and submits it with the booking');
  } finally {
    await page.close();
  }
});
