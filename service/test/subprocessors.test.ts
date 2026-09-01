/**
 * SPEC-0002 D6 — the subprocessor list is a control, not a description.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPermittedMailHost, mailHostOf, PERMITTED_MAIL_HOSTS } from '../src/subprocessors.ts';
import { RefusingMail, RetryingMail } from '../src/mail.ts';
import { LEGAL_DOCS } from '../src/legal.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Walk up to the repository root, so this works from source or build output. */
function fromRootPath(rel: string): string {
  let dir = here;
  for (let i = 0; i < 8; i++) {
    const p = resolve(dir, rel);
    if (existsSync(p)) return p;
    dir = dirname(dir);
  }
  throw new Error(`${rel} is not in this tree`);
}

const fromRoot = (rel: string): string => readFileSync(fromRootPath(rel), 'utf8');

const published = (): string => fromRoot('SUBPROCESSORS.md');

/** The register a customer is actually pointed at: /subprocessors, from legal.ts. */
const served = (): string => LEGAL_DOCS.find((d) => d.slug === 'subprocessors')!.body;

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

/**
 * The other direction, which is the one that actually broke.
 *
 * On 2026-09-01 the table listed `smtp.gmail.com` against a constant that does
 * not contain it, so a self-hoster who followed the document got the startup
 * refusal the document told them they would not get. The assertion above cannot
 * see that: it only walks code → prose. This walks prose → code, from the table
 * itself rather than from a third copy of the list (L-007).
 */
test('the permitted-host table and PERMITTED_MAIL_HOSTS are the same list, both ways', () => {
  const doc = published();
  const at = doc.indexOf('| Permitted mail host |');
  assert.ok(at >= 0, 'the permitted mail host table is gone from SUBPROCESSORS.md');
  const table = doc.slice(at, doc.indexOf('\n\n', at));
  const named = new Set(
    table.split('\n').slice(2)                       // drop the header and its rule
      .map((row) => row.split('|')[1] ?? '')          // first cell only
      .flatMap((cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!)),
  );
  assert.deepEqual(
    [...named].sort(),
    PERMITTED_MAIL_HOSTS.map((p) => p.host).sort(),
    'the table and the constant have forked. subprocessors.ts says they must be ' +
    'edited together; move whichever side is wrong, and say which in the commit.',
  );
});

/**
 * L-007 · restating a rule forks it, and this register is stated twice.
 *
 * The one people are pointed at is `/subprocessors`, served from legal.ts.
 * SUBPROCESSORS.md restates it for a reader of the repository. On 2026-09-01
 * they forked over a provider that was already in the deployed build: the
 * document named Zoom and the served page did not, for hours, with no test able
 * to tell. This is that gap made mechanical.
 *
 * The list below is knowingly a third copy — the same trade legal.test.ts makes
 * with FIELD_DISCLOSED_AS, and for the same reason. A party cannot be derived
 * from source, so the guard is not the assertion; it is that adding a
 * subprocessor forces someone to open both files and this one.
 */
const DISCLOSED_PARTIES = [
  'Cloudflare', 'Gmail API', 'Google Calendar', 'Microsoft', 'Zoom', '(sign-in)',
  'date.nager.at',
];

test('every disclosed party is named in BOTH copies of the register', () => {
  // Scoped to the disclosure itself, not to the page. Prose elsewhere that
  // happens to mention a provider is not a disclosure of it, and a check that
  // accepts one passes while the row it exists to guard is missing.
  const doc = published();
  const rows = doc.slice(doc.indexOf('| Provider | Sees | Why |'));
  const table = rows.slice(0, rows.indexOf('\n\n'));
  // The bullets under "In use now", and nothing else. The prose beneath them
  // names providers too, and counting that as disclosure is how M1 of this
  // file's own mutation check passed with the Zoom row deleted.
  const page = served();
  const section = page.slice(page.indexOf('## In use now'), page.indexOf('## Contacted'));
  const inUse = section.split('\n').filter((l) => l.startsWith('- ')).join('\n');
  assert.ok(table.length > 0 && inUse.length > 0, 'the register lost its list of parties');

  for (const party of DISCLOSED_PARTIES) {
    if (party === 'date.nager.at') continue; // sent no personal data; a section of its own
    assert.ok(inUse.includes(party),
      `/subprocessors — the register a customer is actually pointed at — does not name ` +
      `${party} under "In use now"`);
    assert.ok(table.includes(party), `SUBPROCESSORS.md's provider table does not name ${party}`);
  }
  assert.ok(page.includes('date.nager.at') && doc.includes('date.nager.at'),
    'the contacted-but-sent-nothing party fell out of a copy');
});

/**
 * D6/L-009 · the served register's scope note, checked against the thing it
 * describes rather than against its own words.
 *
 * The page used to say the list "is enforced by the software" full stop. Only
 * server.ts enforces it; worker.ts, which serves booking.pumasi.ai, does not
 * import this file and cannot — Workers have no SMTP. If that ever changes, the
 * register is what has to change with it, so this fails here first.
 */
test('the register names the right build as the one that enforces the mail list', () => {
  // Every importer of this module, not just worker.ts's own text. A reviewer
  // (qwen, 2026-09-01) pointed out that grepping worker.ts alone false-positives
  // on a comment and false-negatives on a re-export through some other module.
  // The importer set is derived, so both go away.
  const srcDir = resolve(dirname(fromRootPath('service/src/subprocessors.ts')));
  const importers = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /from '\.\/subprocessors\.ts'/.test(readFileSync(resolve(srcDir, f), 'utf8')));
  assert.deepEqual(importers.sort(), ['server.ts'],
    'the set of modules importing the allowlist changed. It is enforced on the Node ' +
    'build and nowhere else, and the served register says so — if the Workers build ' +
    '(or anything it imports) now reaches this list, update legal.ts and ' +
    'SUBPROCESSORS.md before this passes again.');
  assert.ok(fromRoot('service/src/server.ts').includes('isPermittedMailHost'),
    'server.ts imports the allowlist but no longer calls it, and the register says it does');
  assert.match(served(), /Cloudflare Workers build/,
    'the served register lost the scope note; an unqualified enforcement claim on the ' +
    'page a customer reads is the L-009 failure, and it shipped once already');
});
