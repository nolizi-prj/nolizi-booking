/**
 * First-run bootstrap.
 *
 * The guard is the whole point: an invite that appears only while there are no
 * accounts is a way in; one that keeps appearing is a back door.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { bootstrapInvite, createInvite } from '../src/bootstrap.ts';
import { redeemInvite } from '../src/identity.ts';

const PORT = 55436;
let pg: EmbeddedPostgres;
let db: Database;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-bootstrap', user: 'pumasi', password: 'pumasi',
    port: PORT, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  db = await createPostgresDriver(`postgres://pumasi:pumasi@localhost:${PORT}/postgres`);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sessions, invites, schedules, owners RESTART IDENTITY CASCADE`);
});

test('a first invite is issued when the service has no accounts', async () => {
  const r = await bootstrapInvite(db);
  assert.equal(r.created, true);
  assert.ok(r.code.length > 8, 'and it is not guessable');
});

test('it does not mint a second invite while the first is unused', async () => {
  const first = await bootstrapInvite(db);
  const again = await bootstrapInvite(db);
  assert.equal(again.created, false);
  assert.equal(again.code, first.code, 'the same unused invite is offered again');
  const { rows } = await db.query(`SELECT count(*)::int AS c FROM invites`);
  assert.equal(Number(rows[0]?.['c']), 1);
});

test('it goes silent the moment an account exists — this is the guard', async () => {
  const boot = await bootstrapInvite(db);
  const owner = await redeemInvite(
    db, db,
    { code: boot.code, email: 'first@example.invalid', displayName: 'First', timezone: 'UTC' },
    10,
  );
  assert.ok(owner.ok);

  const after = await bootstrapInvite(db);
  assert.equal(after.created, false);
  assert.equal(after.reason, 'owners_exist');
  assert.equal(after.code, '', 'nothing is handed out once anyone has signed up');

  // Not even with an explicit request. A back door that honours configuration
  // is still a back door.
  const forced = await bootstrapInvite(db, 'LET-ME-IN');
  assert.equal(forced.created, false);
  assert.equal(forced.reason, 'owners_exist');
  const { rows } = await db.query(`SELECT count(*)::int AS c FROM invites WHERE code = 'LET-ME-IN'`);
  assert.equal(Number(rows[0]?.['c']), 0, 'and no such invite was created');
});

test('an operator can still mint invites deliberately, once running', async () => {
  const boot = await bootstrapInvite(db);
  await redeemInvite(db, db, { code: boot.code, email: 'a@example.invalid', displayName: 'A', timezone: 'UTC' }, 10);

  const code = await createInvite(db, 'FOR-BOB');
  assert.equal(code, 'FOR-BOB');
  const second = await redeemInvite(db, db, { code, email: 'bob@example.invalid', displayName: 'Bob', timezone: 'UTC' }, 10);
  assert.equal(second.ok, true, 'a deliberately minted invite works normally');
});

test('a requested bootstrap code is honoured when the service is empty', async () => {
  const r = await bootstrapInvite(db, 'MY-CODE');
  assert.equal(r.code, 'MY-CODE');
  assert.equal(r.created, true);
});

test('an invite stays spent after the account that used it is deleted', async () => {
  const boot = await bootstrapInvite(db);
  const owner = await redeemInvite(
    db, db, { code: boot.code, email: 'gone@example.invalid', displayName: 'Gone', timezone: 'UTC' }, 10,
  );
  assert.ok(owner.ok);
  if (!owner.ok) return;

  await db.query(`DELETE FROM owners WHERE owner_id = $1`, [owner.owner.owner_id]);

  // The row survives with its consumer detached -- and must NOT be reusable.
  const inv = await db.query(`SELECT consumed_by, consumed_at FROM invites WHERE code = $1`, [boot.code]);
  assert.equal(inv.rows[0]?.['consumed_by'], null, 'the departed account is not named here any more');
  assert.ok(inv.rows[0]?.['consumed_at'], 'but it is still recorded as spent');

  const reuse = await redeemInvite(
    db, db, { code: boot.code, email: 'other@example.invalid', displayName: 'Other', timezone: 'UTC' }, 10,
  );
  assert.equal(reuse.ok, false, 'leaving must not mint a fresh way in');

  // And bootstrap does not offer it again either.
  const boot2 = await bootstrapInvite(db);
  assert.notEqual(boot2.code, boot.code, 'a spent invite is never re-offered');
});

test('P6 a migration file is applied exactly once, however often we boot', async () => {
  const { migrate } = await import('../src/db.ts');
  const first = await migrate(db);
  assert.equal(first.length, 0, 'already applied by the before() hook');

  const ledger = await db.query(`SELECT count(*)::int AS c FROM schema_migrations`);
  assert.ok(Number(ledger.rows[0]?.['c']) >= 4, 'every file is recorded');

  // Booting repeatedly must not re-run anything -- 001 rebuilds the exclusion
  // constraint, which revalidates the table under a lock.
  for (let i = 0; i < 3; i++) assert.equal((await migrate(db)).length, 0);

  // And concurrent boots claim files rather than racing to apply them.
  const together = await Promise.all([migrate(db), migrate(db), migrate(db)]);
  assert.deepEqual(together, [[], [], []]);
});
