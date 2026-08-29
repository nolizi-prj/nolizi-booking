/**
 * SPEC-0002 D6 — the subprocessor list is a control, not a description.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPermittedMailHost, mailHostOf, PERMITTED_MAIL_HOSTS } from '../src/subprocessors.ts';
import { RefusingMail, RetryingMail } from '../src/mail.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up to the repository root, so this works from source or build output. */
function published(): string {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    try {
      return readFileSync(resolve(dir, 'SUBPROCESSORS.md'), 'utf8');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('SUBPROCESSORS.md is not published');
}

test('a published subprocessor list exists', () => {
  const doc = published();
  assert.match(doc, /Who else sees data/);
  assert.match(doc, /Retention/, 'D7 — the retention statement lives with it');
});

test('every permitted host appears in the published list', () => {
  const doc = published();
  for (const p of PERMITTED_MAIL_HOSTS) {
    assert.ok(doc.includes(p.host), `${p.host} is permitted in code but not named publicly`);
  }
});

test('an unlisted mail host is refused', () => {
  assert.equal(isPermittedMailHost('smtp.some-vendor.example'), false);
  assert.equal(isPermittedMailHost(''), false);
  assert.equal(isPermittedMailHost('smtp.ethereal.email'), true);
});

test('the host is read from the URL, not guessed from the string', () => {
  assert.equal(mailHostOf('smtp://user:pass@smtp.ethereal.email:587'), 'smtp.ethereal.email');
  // A hostname appearing in the credentials must not smuggle a host past the check.
  assert.equal(mailHostOf('smtp://smtp.ethereal.email:pw@evil.example:25'), 'evil.example');
  assert.equal(isPermittedMailHost(mailHostOf('smtp://smtp.ethereal.email:pw@evil.example:25')), false);
  assert.equal(mailHostOf('not a url'), '');
});

test('the retention statement does not claim more than it can do', () => {
  const doc = published();
  assert.match(doc, /[Cc]annot be recalled/, 'sent mail cannot be un-sent, and it says so');
  assert.ok(
    !/backups?\s+are\s+(erased|deleted)\s+immediately/i.test(doc),
    'must not claim backups vanish immediately',
  );
});

test('D6 an undisclosed mail host stops the mail, not the service', async () => {
  // The duty is that nobody's name, address or meeting time reaches an
  // undisclosed party. Refusing the send discharges it; refusing to boot would
  // additionally take down the booking pages, which protects no one.
  const refusing = new RefusingMail('smtp.some-vendor.example');
  await assert.rejects(
    () => refusing.send({} as never),
    /not named in SUBPROCESSORS\.md/,
    'the send is refused, and the reason names the register',
  );

  // Wrapped as it is in production, the booking still commits and the message
  // is queued for retry rather than lost (M3).
  const queued = new RetryingMail(refusing);
  await queued.send({} as never);
  assert.equal(queued.failed.length, 1, 'the message is held for retry, not dropped');
});

test('the register text and the enforced list agree on what is permitted', () => {
  const doc = published();
  for (const p of PERMITTED_MAIL_HOSTS) {
    assert.ok(doc.includes(p.host), `${p.host} is enforced in code but absent from the register`);
  }
});
