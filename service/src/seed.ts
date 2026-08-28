/**
 * Demo data, so `npm run dev` gives something to actually open.
 * Never invoked unless SEED_DEMO=true.
 */

import type { SqlClient } from './store.ts';

export async function seedDemo(sql: SqlClient): Promise<{ slug: string }> {
  const existing = await sql.query(`SELECT slug FROM schedules LIMIT 1`);
  if (existing.rows[0]) return { slug: String(existing.rows[0]['slug']) };

  await sql.query(
    `INSERT INTO owners (owner_id, email, display_name, timezone)
     VALUES ('demo-owner', 'demo@example.invalid', 'Demo Owner', 'America/New_York')
     ON CONFLICT (owner_id) DO NOTHING`,
  );
  await sql.query(
    `INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
        granularity_minutes, minimum_notice_minutes, maximum_horizon_days)
     VALUES ('demo-schedule','demo-owner','demo','Demo 30-minute call',30,30,60,30)
     ON CONFLICT (schedule_id) DO NOTHING`,
  );
  for (const day of ['MO', 'TU', 'WE', 'TH', 'FR']) {
    await sql.query(
      `INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
       VALUES ('demo-schedule', $1, '09:00', '17:00')`,
      [day],
    );
  }
  return { slug: 'demo' };
}
