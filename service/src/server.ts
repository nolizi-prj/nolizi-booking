/**
 * Process entry point. Host-agnostic: it needs a port and, optionally, a
 * database URL. Nothing here knows about any particular platform.
 */

import { createServer } from 'node:http';
import { loadConfig, refusals } from './config.ts';
import { migrate } from './db.ts';
import { CalendarHub } from './calendars.ts';
import { GoogleCalendarProvider } from './calendar-google.ts';
import { createDatabase, type Database } from './driver.ts';
import { handle, type AppDeps } from './app.ts';
import { RecordingMail, RetryingMail, type MailPort } from './mail.ts';
import { FileMail, SmtpMail } from './mail-smtp.ts';
import { isPermittedMailHost, mailHostOf, PERMITTED_MAIL_HOSTS } from './subprocessors.ts';
import { seedDemo } from './seed.ts';
import { bootstrapInvite } from './bootstrap.ts';
import { checkTransitions, checkTzdata } from '@pumasi/booking-core';
import { classifyWallTime } from '@pumasi/booking-core';

export async function start(): Promise<{ close: () => Promise<void>; port: number }> {
  const config = loadConfig();

  // D-001 · refusals are logged, so a setting that did not take effect is
  // visible rather than silently ignored.
  for (const r of refusals()) console.warn(`[config] refused ${r.setting}: ${r.reason}`);

  // O4 · refuse to start on a timezone-data disagreement. A scheduling service
  // that serves wrong times while reporting itself healthy is worse than one
  // that does not start: the first is discovered by a person missing a meeting.
  const transitions = checkTransitions((z, d, tm) => classifyWallTime(z, d, tm));
  const broken = transitions.filter((x) => !x.ok);
  if (broken.length > 0) {
    console.error('');
    console.error('  REFUSING TO START — the host timezone database disagrees');
    for (const b of broken) {
      console.error(`    ${b.zone} ${b.local}: expected ${b.expect}, host says ${b.actual}`);
      console.error(`      ${b.note}`);
    }
    console.error('');
    console.error('  Every stored time would be computed against rules this build');
    console.error('  was not verified for. Fix the host, do not start the service.');
    throw new Error('tzdata transition mismatch');
  }
  const tz = checkTzdata();
  if (!tz.matches) {
    console.warn(
      `[tz] finding: pinned ${tz.pinned}, host ${tz.runtime ?? 'unknown'} — ` +
        `all ${transitions.length} transitions this build depends on were verified and agree`,
    );
  }

  const db: Database = await createDatabase(config.databaseUrl);
  console.log(`[db] ${db.describe}`);
  if (db.kind === 'pglite') {
    console.warn('[db] no DATABASE_URL — using an in-process database. Nothing survives a restart.');
  }

  let ready = false;
  const applied = await migrate(db, db.kind === 'sqlite' ? { dir: 'migrations-sqlite' } : undefined);
  console.log(`[db] migrations applied: ${applied.join(', ')}`);
  // Invite-only needs a first invite, or nobody can ever start.
  const boot = await bootstrapInvite(db, process.env['BOOTSTRAP_INVITE']);
  if (boot.reason === 'owners_exist') {
    console.log('[invite] accounts already exist — no bootstrap invite issued');
  } else {
    console.log('');
    console.log(`  Sign up here:  ${config.baseUrl}/signup?invite=${boot.code}`);
    console.log(`  Invite code:   ${boot.code}${boot.created ? '' : '  (existing, unused)'}`);
    console.log('');
  }

  if (process.env['SEED_DEMO'] === 'true') {
    const seeded = await seedDemo(db);
    console.log(`[db] demo data seeded: http://localhost:${config.port}/${seeded.slug}`);
  }
  ready = true; // P6 · migrations complete before anything serves

  // M1 · one adapter behind the port. SMTP is a standard, so the provider is a
  // URL rather than a dependency in the tree.
  let inner: MailPort;
  if (config.smtpUrl) {
    // D6 · a provider that will see people's names, addresses and meeting times
    // must be named publicly first. Refusing here is what makes the published
    // list a control rather than a description.
    const host = mailHostOf(config.smtpUrl);
    if (!isPermittedMailHost(host)) {
      console.error('');
      console.error(`  REFUSING TO START — mail host "${host}" is not a named subprocessor`);
      console.error('  Add it to SUBPROCESSORS.md and src/subprocessors.ts, together,');
      console.error('  saying what it will see and why. Currently permitted:');
      for (const p of PERMITTED_MAIL_HOSTS) console.error(`    ${p.host} — ${p.why}`);
      console.error('');
      throw new Error(`unnamed mail subprocessor: ${host}`);
    }
    inner = new SmtpMail({ url: config.smtpUrl, from: config.mailFrom, baseUrl: config.baseUrl });
    console.log(`[mail] SMTP via ${host} (named in SUBPROCESSORS.md)`);
  } else if (config.mailDir) {
    inner = new FileMail(config.mailDir, config.baseUrl);
    console.log(`[mail] writing messages to ${config.mailDir}`);
  } else {
    inner = new RecordingMail();
    console.warn('[mail] no SMTP_URL and no MAIL_DIR — messages are recorded in memory and discarded.');
  }

  // SPEC-0003 · calendar integration only when fully configured.
  let calendars: CalendarHub | undefined;
  if (config.googleClientId && config.googleClientSecret && config.tokenKey) {
    calendars = new CalendarHub(
      { google: new GoogleCalendarProvider(config.googleClientId, config.googleClientSecret) },
      config.tokenKey,
    );
    console.log('[calendar] Google Calendar integration active');
  } else {
    console.warn('[calendar] GOOGLE_OAUTH_CLIENT_ID/SECRET/TOKEN_KEY unset — calendar integration off.');
  }

  const deps: AppDeps = {
    sql: db,
    tx: db,
    config,
    mail: new RetryingMail(inner),
    now: () => new Date().toISOString().replace('.000Z', 'Z'),
    ready: () => ready,
    calendars,
  };

  const trustProxy = process.env['TRUST_PROXY'] === 'true';
  if (!trustProxy) {
    console.log('[http] X-Forwarded-For ignored — set TRUST_PROXY=true only behind a proxy that overwrites it');
  }

  // A form on this service carries a name, an address and two timestamps.
  // Buffering whatever arrives lets one request exhaust memory, so the cap is
  // generous for the real thing and useless for that.
  const MAX_BODY_BYTES = 64 * 1024;

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        if (!tooLarge) {
          tooLarge = true;
          res.writeHead(413, { 'content-type': 'text/plain' });
          res.end('request too large');
          req.destroy();
        }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      const form = Object.fromEntries(new URLSearchParams(raw));
      const url = new URL(req.url ?? '/', 'http://localhost');
      // I6 · X-Forwarded-For is set by the client unless something in front is
      // trusted to overwrite it. Honouring it by default lets an attacker
      // rotate the header and make every rate limit meaningless, which is worse
      // than having none because it reads as protection.
      const ip = trustProxy
        ? String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]!.trim()
        : (req.socket.remoteAddress ?? 'unknown');
      handle(deps, {
        method: req.method ?? 'GET',
        path: url.pathname,
        ip,
        form,
        cookie: req.headers.cookie,
        query: Object.fromEntries(url.searchParams),
      })
        .then((reply) => {
          res.writeHead(reply.status, reply.headers);
          res.end(reply.body);
        })
        .catch((err: Error) => {
          console.error('[error]', err.message);
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('internal error');
        });
    });
  });

  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  console.log(`[http] listening on ${config.port}`);

  return {
    port: config.port,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

const invokedDirectly = process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts');
if (invokedDirectly) {
  start().catch((e: Error) => {
    console.error(e);
    process.exit(1);
  });
}
