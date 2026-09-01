/**
 * SPEC-0002 I1–I4, against real PostgreSQL with parallel connections.
 *
 * I1's whole claim is about concurrency -- two redemptions of one invite must
 * produce exactly one account -- so it is tested where transactions can
 * actually interleave.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import {
  consumeSignInToken,
  createSession,
  destroySession,
  issueSignInToken,
  ownerForSession,
  readCookie,
  redeemInvite,
  secretsMatch,
  sessionCookie,
} from '../src/identity.ts';

let pg: TestPostgres;
let db: Database;
const NOW = '2026-06-01T08:00:00Z';

before(async () => {
  pg = await startPostgres('identity');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, schedules, owners RESTART IDENTITY CASCADE`);
});

const invite = async (code: string) => db.query(`INSERT INTO invites (code) VALUES ($1)`, [code]);
const person = (n: string) => ({
  code: 'INV-1', email: `${n}@example.invalid`, displayName: n, timezone: 'UTC',
});

test('I1 an invite creates exactly one account under concurrent redemption', async () => {
  for (let round = 0; round < 15; round++) {
    await db.query(`TRUNCATE invites, owners RESTART IDENTITY CASCADE`);
    await invite('INV-1');

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => redeemInvite(db, db, person(`p${round}x${i}`), 100)),
    );
    const won = results.filter((r) => r.ok).length;
    assert.equal(won, 1, `round ${round}: one invite, one account -- got ${won}`);

    const owners = await db.query(`SELECT count(*)::int AS c FROM owners`);
    assert.equal(Number(owners.rows[0]?.['c']), 1);
  }
});

test('I1 a spent invite cannot be redeemed again', async () => {
  await invite('INV-1');
  assert.equal((await redeemInvite(db, db, person('first'), 100)).ok, true);
  const second = await redeemInvite(db, db, person('second'), 100);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, 'invalid_invite');
});

test('I1 an unknown invite code is refused and creates nothing', async () => {
  const r = await redeemInvite(db, db, { ...person('nobody'), code: 'NOPE' }, 100);
  assert.equal(r.ok, false);
  assert.equal(Number((await db.query(`SELECT count(*)::int AS c FROM owners`)).rows[0]?.['c']), 0);
});

test('D1 the owner ceiling is enforced inside the transaction', async () => {
  for (const c of ['A', 'B', 'C']) await invite(c);
  assert.equal((await redeemInvite(db, db, { ...person('one'), code: 'A' }, 2)).ok, true);
  assert.equal((await redeemInvite(db, db, { ...person('two'), code: 'B' }, 2)).ok, true);
  const third = await redeemInvite(db, db, { ...person('three'), code: 'C' }, 2);
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.reason, 'ceiling');
  // The refused redemption must not have spent the invite.
  const inv = await db.query(`SELECT consumed_by FROM invites WHERE code = 'C'`);
  assert.equal(inv.rows[0]?.['consumed_by'], null, 'a refused redemption spends nothing');
});

test('I3 a sign-in link works once, and not after expiry', async () => {
  await invite('INV-1');
  const r = await redeemInvite(db, db, person('ada'), 100);
  assert.ok(r.ok);
  if (!r.ok) return;

  const token = await issueSignInToken(db, r.owner.owner_id, NOW);
  assert.equal(await consumeSignInToken(db, token, NOW), r.owner.owner_id);
  assert.equal(await consumeSignInToken(db, token, NOW), undefined, 'single use');

  const later = await issueSignInToken(db, r.owner.owner_id, NOW, 20);
  assert.equal(
    await consumeSignInToken(db, later, '2026-06-01T09:00:00Z'),
    undefined,
    'an expired link does not sign anyone in',
  );
});

test('I3 a session resolves to its owner and dies on logout', async () => {
  await invite('INV-1');
  const r = await redeemInvite(db, db, person('grace'), 100);
  assert.ok(r.ok);
  if (!r.ok) return;

  const sid = await createSession(db, r.owner.owner_id, NOW, 24);
  assert.equal((await ownerForSession(db, sid, NOW))?.owner_id, r.owner.owner_id);

  await destroySession(db, sid);
  assert.equal(
    await ownerForSession(db, sid, NOW),
    undefined,
    'logout invalidates server-side, not merely by clearing the cookie',
  );
});

test('I3 an expired session does not authenticate', async () => {
  await invite('INV-1');
  const r = await redeemInvite(db, db, person('hopper'), 100);
  assert.ok(r.ok);
  if (!r.ok) return;
  const sid = await createSession(db, r.owner.owner_id, NOW, 1);
  assert.equal(await ownerForSession(db, sid, '2026-06-01T10:00:00Z'), undefined);
});

test('I3 the cookie carries no readable claims and no account identifier', async () => {
  await invite('INV-1');
  const r = await redeemInvite(db, db, person('lovelace'), 100);
  assert.ok(r.ok);
  if (!r.ok) return;
  const sid = await createSession(db, r.owner.owner_id, NOW, 24);
  const cookie = sessionCookie(sid, true, 24);

  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(!cookie.includes(r.owner.owner_id), 'the account id must not be in the cookie');
  assert.ok(!cookie.includes(r.owner.email), 'nor the address');
  assert.equal(readCookie(cookie.replace(/; .*/, ''), 'pumasi_session'), sid);
  // Opaque: nothing decodes to anything.
  assert.ok(!/\./.test(sid), 'not a JWT-shaped token with readable segments');
});

test('a garbage or absent session authenticates nobody', async () => {
  assert.equal(await ownerForSession(db, undefined, NOW), undefined);
  assert.equal(await ownerForSession(db, 'not-a-session', NOW), undefined);
  assert.equal(await ownerForSession(db, '', NOW), undefined);
});

test('secret comparison is length-safe and constant-time', () => {
  const a = 'a'.repeat(43);
  assert.equal(secretsMatch(a, a), true);
  assert.equal(secretsMatch(a, 'b'.repeat(43)), false);
  assert.equal(secretsMatch(a, 'short'), false, 'differing lengths must not throw');
});
