/**
 * Sharding — the directory: invites, the global ceiling, and the name maps.
 * Runs the same class the directory DO runs, over PostgreSQL.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { Directory } from '../src/directory.ts';

const PORT = 55447;
let pg: EmbeddedPostgres;
let db: Database;
let dir: Directory;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-directory', user: 'pumasi', password: 'pumasi',
    port: PORT, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  db = await createPostgresDriver(`postgres://pumasi:pumasi@localhost:${PORT}/postgres`);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  dir = new Directory(db, 5);
  await dir.ensure('inv-boot');
  await db.query(`TRUNCATE dir_orgs, dir_emails, dir_links, dir_forms, dir_domains, dir_invites`);
  await dir.ensure('inv-boot'); // re-mint the bootstrap invite after the wipe
});

test('the bootstrap invite exists while nobody does, and founds the first org', async () => {
  const claim = await dir.claimSignup('inv-boot', 'first@example.com');
  assert.ok(claim.ok && claim.newOrg);
  // Spent is spent.
  const again = await dir.claimSignup('inv-boot', 'second@example.com');
  assert.deepEqual(again, { ok: false, reason: 'invalid_invite' });
  // With an owner on the books, ensure() must not mint fresh platform invites.
  assert.equal(await dir.ensure('inv-boot2'), undefined);
});

test('org invites join the inviting org; platform invites found new ones', async () => {
  const founder = await dir.claimSignup('inv-boot', 'a@x.example');
  assert.ok(founder.ok);
  const tag = founder.ok ? founder.tag : '';

  const orgInvite = await dir.mintInvite('org', tag);
  const mate = await dir.claimSignup(orgInvite, 'b@x.example');
  assert.ok(mate.ok && !mate.newOrg && mate.tag === tag);

  const platformInvite = await dir.mintInvite('platform');
  const rival = await dir.claimSignup(platformInvite, 'c@y.example');
  assert.ok(rival.ok && rival.newOrg && rival.tag !== tag);

  assert.equal(await dir.lookup('email', 'B@X.EXAMPLE'), tag);
});

test('the global ceiling counts owners across every org', async () => {
  const f = await dir.claimSignup('inv-boot', 'a@x.example');
  assert.ok(f.ok);
  for (const n of [1, 2, 3, 4]) {
    const inv = await dir.mintInvite('org', f.ok ? f.tag : '');
    const c = await dir.claimSignup(inv, `m${n}@x.example`);
    assert.ok(c.ok, `member ${n} refused early`);
  }
  const inv = await dir.mintInvite('org', f.ok ? f.tag : '');
  const sixth = await dir.claimSignup(inv, 'm5@x.example');
  assert.deepEqual(sixth, { ok: false, reason: 'ceiling' });
  // SSO JIT respects the same ceiling.
  assert.deepEqual(await dir.claimEmailForOrg('jit@x.example', f.ok ? f.tag : ''),
    { ok: false, reason: 'ceiling' });
});

test('a duplicate email is refused wherever it arrives from', async () => {
  const f = await dir.claimSignup('inv-boot', 'dup@x.example');
  assert.ok(f.ok);
  const inv = await dir.mintInvite('platform');
  assert.deepEqual(await dir.claimSignup(inv, 'DUP@x.example'),
    { ok: false, reason: 'already_registered' });
  // …but re-claiming for the SAME org is idempotent (SSO re-login).
  const jit = await dir.claimEmailForOrg('dup@x.example', f.ok ? f.tag : '');
  assert.ok(jit.ok);
});

test('links and form slugs are first-come across orgs, and move cleanly', async () => {
  assert.ok(await dir.registerLink('t1', 'ada'));
  assert.ok(await dir.registerLink('t1', 'ada'), 'idempotent for the holder');
  assert.equal(await dir.registerLink('t2', 'ada'), false);
  assert.ok(await dir.registerLink('t1', 'ada-lovelace', 'ada'));
  assert.equal(await dir.lookup('link', 'ada'), undefined, 'old name released');
  assert.ok(await dir.registerLink('t2', 'ada'), 'freed name is claimable');

  assert.ok(await dir.registerForm('t1', 'talk'));
  assert.equal(await dir.registerForm('t2', 'talk'), false);
  await dir.releaseForm('t1', 'talk');
  assert.ok(await dir.registerForm('t2', 'talk'));
});

test('one steered domain per org, released with the SSO config', async () => {
  await dir.registerDomain('t1', 'corp.example');
  assert.equal(await dir.lookup('domain', 'CORP.example'), 't1');
  await dir.registerDomain('t1', 'other.example');
  assert.equal(await dir.lookup('domain', 'corp.example'), undefined);
  await dir.registerDomain('t1', null);
  assert.equal(await dir.lookup('domain', 'other.example'), undefined);
});

test('releasing an owner frees the email, the link, and a ceiling seat', async () => {
  const f = await dir.claimSignup('inv-boot', 'gone@x.example');
  assert.ok(f.ok);
  const tag = f.ok ? f.tag : '';
  await dir.registerLink(tag, 'gone');
  await dir.releaseOwner(tag, 'gone@x.example', 'gone');
  assert.equal(await dir.lookup('email', 'gone@x.example'), undefined);
  assert.equal(await dir.lookup('link', 'gone'), undefined);
  assert.equal(await dir.ownerCount(), 0);
});
