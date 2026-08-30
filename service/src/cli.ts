#!/usr/bin/env node
/** Small operator commands. `node dist/cli.js invite [code] | report held|published [--send]` */

import { existsSync } from 'node:fs';
import { loadConfig } from './config.ts';
import { createDatabase } from './driver.ts';
import { migrate } from './db.ts';
import { createInvite } from './bootstrap.ts';
import {
  buildHeldReport, asDbKind, buildPublishedReport, readConformance, renderReport, sendReport,
} from './reporting.ts';

const [command, argument] = process.argv.slice(2);
const config = loadConfig();
const db = await createDatabase(config.databaseUrl);
await migrate(db);

try {
  switch (command) {
    // SPEC-0004 R3 · stdout carries the exact payload that would be sent, and
    // nothing else; commentary goes to stderr.
    case 'report': {
      if (argument !== 'held' && argument !== 'published') {
        console.error('usage: cli report held|published [--send]');
        process.exitCode = 1;
        break;
      }
      const send = process.argv.includes('--send');
      const report =
        argument === 'published'
          ? buildPublishedReport(config, readConformance(findConformance()), { dbKind: asDbKind(db.kind) })
          : buildHeldReport(config, {
              dbKind: asDbKind(db.kind), uptimeSeconds: process.uptime(), errorsTotal: 0,
            });
      console.log(renderReport(report));
      if (send) {
        const result = await sendReport(report, config);
        console.error(`[reporting] ${result.detail}`);
        if (!result.sent) process.exitCode = 1;
      } else {
        console.error(`[reporting] printed, not sent — add --send to send to ${config.reportUrl}`);
      }
      break;
    }
    case 'invite': {
      const code = await createInvite(db, argument);
      console.log(`${config.baseUrl}/signup?invite=${code}`);
      break;
    }
    case 'invites': {
      const { rows } = await db.query(
        `SELECT code, consumed_at IS NOT NULL AS used FROM invites ORDER BY created_at`,
      );
      for (const r of rows) console.log(`${r['used'] ? 'used  ' : 'unused'}  ${r['code']}`);
      break;
    }
    default:
      console.log('usage: cli invite [code] | cli invites | cli report held|published [--send]');
      process.exitCode = 1;
  }
} finally {
  await db.close();
}

/** `npm run conformance` (in service/) writes this; find it from either cwd. */
function findConformance(): string {
  const candidates = [
    process.env['PUMASI_CONFORMANCE_FILE'],
    '.build/conformance.json',
    'service/.build/conformance.json',
  ].filter((c): c is string => Boolean(c));
  return candidates.find((c) => existsSync(c)) ?? candidates[candidates.length - 1]!;
}
