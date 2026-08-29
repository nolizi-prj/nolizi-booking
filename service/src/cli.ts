#!/usr/bin/env node
/** Small operator commands. `node dist/cli.js invite [code]` */

import { loadConfig } from './config.ts';
import { createDatabase } from './driver.ts';
import { migrate } from './db.ts';
import { createInvite } from './bootstrap.ts';

const [command, argument] = process.argv.slice(2);
const config = loadConfig();
const db = await createDatabase(config.databaseUrl);
await migrate(db);

try {
  switch (command) {
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
      console.log('usage: cli invite [code] | cli invites');
      process.exitCode = 1;
  }
} finally {
  await db.close();
}
