/**
 * SPEC-0002 M1, M3, M4 — the SMTP adapter, against a real SMTP server.
 *
 * The server runs in-process on a loopback port, so this proves the wire path
 * rather than only the rendering. A mail adapter that is never made to actually
 * send is the kind of thing that works until the first real message.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { SmtpMail, renderMessage, renderTime } from '../src/mail-smtp.ts';
import { RetryingMail } from '../src/mail.ts';

const PORT = 52525;
const received: { to: string[]; body: string }[] = [];
let server: SMTPServer;

before(async () => {
  server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, session, callback) {
      let body = '';
      stream.on('data', (c: Buffer) => (body += c.toString('utf8')));
      stream.on('end', () => {
        received.push({ to: session.envelope.rcptTo.map((r) => r.address), body });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const mail = () =>
  new SmtpMail({
    url: `smtp://127.0.0.1:${PORT}`,
    from: 'Pumasi <no-reply@example.invalid>',
    baseUrl: 'https://book.example.invalid',
    quiet: true,
  });

test('M4 the time is rendered in the recipient’s timezone, from the stored UTC', () => {
  // 13:00Z is 09:00 in New York and 22:00 in Seoul, on the same instant.
  assert.equal(renderTime('2026-06-01T13:00:00Z', 'America/New_York'), '2026-06-01 09:00 (America/New_York)');
  assert.equal(renderTime('2026-06-01T13:00:00Z', 'Asia/Seoul'), '2026-06-01 22:00 (Asia/Seoul)');
  assert.equal(renderTime('2026-06-01T13:00:00Z', 'UTC'), '2026-06-01 13:00 (UTC)');
});

test('M4 a confirmation carries the management link and says what it grants', () => {
  const { subject, text } = renderMessage(
    { kind: 'confirmed', to: 'a@example.invalid', bookingId: 'b1', start: '2026-06-01T13:00:00Z', token: 'TOK123', timezone: 'Asia/Seoul' },
    'https://book.example.invalid',
  );
  assert.match(subject, /Booked/);
  assert.ok(text.includes('2026-06-01 22:00 (Asia/Seoul)'), 'recipient’s zone, not UTC');
  assert.ok(text.includes('https://book.example.invalid/b/TOK123'));
  assert.ok(/anyone\s*\n?holding it can change the booking/.test(text), 'the bearer property is stated plainly');
});

test('a cancellation says the time is free again and carries no link', () => {
  const { subject, text } = renderMessage(
    { kind: 'cancelled', to: 'a@example.invalid', bookingId: 'b1', start: '2026-06-01T13:00:00Z', timezone: 'UTC' },
    'https://book.example.invalid',
  );
  assert.match(subject, /Cancelled/);
  assert.ok(text.includes('now free'));
  assert.ok(!text.includes('/b/'), 'a cancelled booking needs no management link');
});

test('M1 a message actually reaches an SMTP server over the wire', async () => {
  received.length = 0;
  await mail().send({
    kind: 'confirmed',
    to: 'ada@example.invalid',
    bookingId: 'b1',
    start: '2026-06-01T13:00:00Z',
    token: 'TOK456',
    timezone: 'Europe/London',
  });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0]?.to, ['ada@example.invalid']);
  assert.ok(received[0]?.body.includes('Subject: Booked'));
  assert.ok(received[0]?.body.includes('2026-06-01 14:00 (Europe/London)'), 'BST, not UTC');
  assert.ok(received[0]?.body.includes('/b/TOK456'));
});

test('the adapter refuses a placeholder recipient rather than mailing it', async () => {
  await assert.rejects(
    () => mail().send({ kind: 'confirmed', to: 'owner', bookingId: 'b1', start: '2026-06-01T13:00:00Z' }),
    /non-address/,
    "'owner' is a marker the caller must resolve, not something to send to",
  );
});

test('M3 an unreachable server does not throw past the retrying wrapper', async () => {
  // The booking is already committed by the time mail is attempted. A provider
  // being down must not surface as a failed booking.
  const unreachable = new SmtpMail({
    url: 'smtp://127.0.0.1:1', // nothing listens here
    from: 'x@example.invalid',
    baseUrl: 'https://book.example.invalid',
    quiet: true,
  });
  const wrapped = new RetryingMail(unreachable);
  await wrapped.send({ kind: 'confirmed', to: 'a@example.invalid', bookingId: 'b1', start: '2026-06-01T13:00:00Z' });
  assert.equal(wrapped.failed.length, 1, 'queued for retry rather than lost or thrown');
});
