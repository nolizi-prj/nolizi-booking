/**
 * SPEC-0003 — the Microsoft adapter's wire mapping, against a stubbed Graph.
 * The details under test are exactly the ones cal.diy paid for in production:
 * naive-UTC times get their 'Z' back, free/workingElsewhere do not block,
 * nextLink pages are followed, revoked grants are recognised, and a Teams
 * meeting's join URL rides back on a conference event.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MicrosoftCalendarProvider } from '../src/calendar-microsoft.ts';
import { TokenRevokedError } from '../src/calendars.ts';

const provider = new MicrosoftCalendarProvider('cid', 'sec');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function stub(routes: Record<string, (url: string, init?: RequestInit) => Response>) {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    for (const [prefix, fn] of Object.entries(routes)) {
      if (u.includes(prefix)) return fn(u, init);
    }
    throw new Error(`unstubbed fetch: ${u}`);
  }) as typeof fetch;
}

test('calendarView busy mapping: Z restored, free dropped, pages followed', async () => {
  let page = 0;
  stub({
    '/calendarView': () => {
      page++;
      if (page === 1) {
        return new Response(JSON.stringify({
          value: [
            { showAs: 'busy', start: { dateTime: '2026-06-01T10:00:00.0000000' }, end: { dateTime: '2026-06-01T10:30:00.0000000' } },
            { showAs: 'free', start: { dateTime: '2026-06-01T11:00:00.0000000' }, end: { dateTime: '2026-06-01T11:30:00.0000000' } },
            { showAs: 'workingElsewhere', start: { dateTime: '2026-06-01T12:00:00.0000000' }, end: { dateTime: '2026-06-01T12:30:00.0000000' } },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendars/x/calendarView?page2',
        }));
      }
      return new Response(JSON.stringify({
        value: [
          { showAs: 'tentative', start: { dateTime: '2026-06-01T14:00:00.0000000' }, end: { dateTime: '2026-06-01T14:30:00.0000000' } },
        ],
      }));
    },
  });
  const busy = await provider.freeBusy('tok', ['cal-1'], '2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z');
  assert.deepEqual(busy, [
    { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z' },
    { start: '2026-06-01T14:00:00Z', end: '2026-06-01T14:30:00Z' },
  ]);
});

test('createEvent speaks naive UTC and returns the Teams join URL for conferences', async () => {
  let sent: Record<string, unknown> = {};
  stub({
    '/events': (_u, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: 'ev-1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/xyz' },
      }));
    },
  });
  const made = await provider.createEvent('tok', 'cal-1', {
    title: 'Intro', description: 'desc',
    start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z', conference: true,
  });
  assert.equal((sent['start'] as { dateTime: string }).dateTime, '2026-06-01T10:00:00');
  assert.equal(sent['isOnlineMeeting'], true);
  assert.equal(made.eventId, 'ev-1');
  assert.ok(made.meetUrl!.includes('teams.microsoft.com'));
});

test('a revoked refresh token is recognised as revocation, not an outage', async () => {
  stub({
    '/oauth2/v2.0/token': () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
  });
  await assert.rejects(provider.refresh('dead'), TokenRevokedError);
});

test('deleting an already-deleted event is done, not an error', async () => {
  stub({ '/events/': () => new Response('', { status: 404 }) });
  await assert.doesNotReject(provider.deleteEvent('tok', 'cal-1', 'gone'));
});
