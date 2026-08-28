/**
 * SPEC-0002 D6 — the subprocessor list is a control, not a description.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPermittedMailHost, mailHostOf, PERMITTED_MAIL_HOSTS } from '../src/subprocessors.ts';

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
