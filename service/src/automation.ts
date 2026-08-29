/**
 * P7 — workflows, webhooks, and the job queue that carries them.
 *
 * Immediate triggers (created/cancelled/rescheduled) enqueue work at "now";
 * before/after triggers enqueue at the meeting's edge. One pump drains due
 * jobs: on Workers the Durable Object's alarm calls it, on Node an interval
 * does. A cancelled booking takes its pending jobs with it.
 *
 * Webhook deliveries are signed (HMAC-SHA256 of the body, hex, in
 * X-Pumasi-Signature) and retried with exponential backoff, five attempts.
 */

import { randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import type { SqlClient } from './store.ts';
import type { MailPort } from './mail.ts';
import { renderTime } from './mail-render.ts';

export type Trigger =
  | 'booking_created'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'before_event'
  | 'after_event';

export interface BookingCtx {
  bookingId: string;
  ownerId: string;
  title: string;
  start: string;
  end: string;
  bookerName: string;
  bookerEmail: string;
  bookerTz: string;
  location?: string;
}

const MAX_ATTEMPTS = 5;

/** {{name}}, {{title}}, {{start}}, {{end}}, {{location}} — and nothing else. */
export function renderTemplate(template: string, ctx: BookingCtx, timezone: string): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/g, ctx.bookerName)
    .replace(/\{\{\s*title\s*\}\}/g, ctx.title)
    .replace(/\{\{\s*start\s*\}\}/g, renderTime(ctx.start, timezone))
    .replace(/\{\{\s*end\s*\}\}/g, renderTime(ctx.end, timezone))
    .replace(/\{\{\s*location\s*\}\}/g, ctx.location ?? '');
}

async function enqueue(
  sql: SqlClient,
  kind: 'workflow_mail' | 'webhook',
  runAt: string,
  payload: unknown,
  bookingId?: string,
): Promise<void> {
  await sql.query(
    `INSERT INTO jobs (job_id, kind, run_at, payload, booking_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), kind, runAt, JSON.stringify(payload), bookingId ?? null],
  );
}

/**
 * Fire every workflow and webhook the event matches. Timed (before/after)
 * workflows are (re)enqueued on created and rescheduled events.
 */
export async function fireTrigger(
  sql: SqlClient,
  trigger: Trigger,
  ctx: BookingCtx,
  ownerEmail: string,
  ownerTimezone: string,
  now: string,
): Promise<void> {
  const { rows: flows } = await sql.query(
    `SELECT workflow_id, trigger, offset_minutes, recipient, subject, body
       FROM workflows WHERE owner_id = $1 AND enabled = 1`,
    [ctx.ownerId],
  );
  for (const f of flows) {
    const fTrigger = String(f['trigger']) as Trigger;
    const recipient = String(f['recipient']);
    const to = recipient === 'owner' ? ownerEmail : ctx.bookerEmail;
    const tz = recipient === 'owner' ? ownerTimezone : ctx.bookerTz;
    const payload = {
      to,
      subject: renderTemplate(String(f['subject']), ctx, tz),
      body: renderTemplate(String(f['body']), ctx, tz),
    };
    if (fTrigger === trigger) {
      await enqueue(sql, 'workflow_mail', now, payload, ctx.bookingId);
    } else if (
      (fTrigger === 'before_event' || fTrigger === 'after_event') &&
      (trigger === 'booking_created' || trigger === 'booking_rescheduled')
    ) {
      const minutes = Number(f['offset_minutes']);
      const at =
        fTrigger === 'before_event'
          ? Temporal.Instant.from(ctx.start).subtract({ minutes })
          : Temporal.Instant.from(ctx.end).add({ minutes });
      const runAt = at.toString();
      if (runAt > now) await enqueue(sql, 'workflow_mail', runAt, payload, ctx.bookingId);
    }
  }

  const { rows: hooks } = await sql.query(
    `SELECT url, secret, format, events FROM webhooks WHERE owner_id = $1`,
    [ctx.ownerId],
  );
  for (const h of hooks) {
    const events = String(h['events']);
    if (events !== 'all' && !events.split(',').includes(trigger)) continue;
    await enqueue(sql, 'webhook', now, {
      url: String(h['url']),
      secret: String(h['secret']),
      format: String(h['format']),
      event: trigger,
      data: {
        booking_id: ctx.bookingId,
        title: ctx.title,
        start: ctx.start,
        end: ctx.end,
        booker_name: ctx.bookerName,
        booker_email: ctx.bookerEmail,
        location: ctx.location ?? null,
      },
    }, ctx.bookingId);
  }
}

/** A cancelled booking takes its pending (future) jobs with it. */
export async function cancelPendingJobs(sql: SqlClient, bookingId: string, now: string): Promise<void> {
  await sql.query(
    `DELETE FROM jobs WHERE booking_id = $1 AND status = 'pending' AND run_at > $2`,
    [bookingId, now],
  );
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Drain everything due. Returns the next pending run_at, if any, so the
 * caller can set its alarm/timer.
 */
export async function processDueJobs(
  sql: SqlClient,
  mail: MailPort,
  now: string,
): Promise<string | undefined> {
  const { rows } = await sql.query(
    `SELECT job_id, kind, payload, attempts FROM jobs
      WHERE status = 'pending' AND run_at <= $1 ORDER BY run_at LIMIT 20`,
    [now],
  );
  for (const job of rows) {
    const jobId = String(job['job_id']);
    const payload = JSON.parse(String(job['payload'])) as Record<string, unknown>;
    let ok = true;
    if (String(job['kind']) === 'workflow_mail') {
      // Mail failures are already absorbed by RetryingMail (M3); a workflow
      // mail is one-shot by design.
      await mail.send({
        kind: 'custom',
        to: String(payload['to']),
        bookingId: '',
        start: now,
        subject: String(payload['subject']),
        body: String(payload['body']),
      });
    } else {
      ok = await deliverWebhook(payload);
    }
    if (ok) {
      await sql.query(`UPDATE jobs SET status = 'done' WHERE job_id = $1`, [jobId]);
    } else {
      const attempts = Number(job['attempts']) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await sql.query(`UPDATE jobs SET status = 'failed', attempts = $2 WHERE job_id = $1`,
          [jobId, attempts]);
      } else {
        const delayMinutes = Math.pow(4, attempts); // 4, 16, 64, 256 minutes
        const retryAt = Temporal.Instant.from(now).add({ minutes: delayMinutes }).toString();
        await sql.query(
          `UPDATE jobs SET attempts = $2, run_at = $3 WHERE job_id = $1`,
          [jobId, attempts, retryAt]);
      }
    }
  }
  const next = await sql.query(
    `SELECT run_at FROM jobs WHERE status = 'pending' ORDER BY run_at LIMIT 1`);
  return next.rows[0] ? String(next.rows[0]['run_at']) : undefined;
}

async function deliverWebhook(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const format = String(payload['format']);
    const data = payload['data'] as Record<string, unknown>;
    const body =
      format === 'slack'
        ? JSON.stringify({
            text: `${String(payload['event']).replace(/_/g, ' ')}: ${String(data['title'])} — ${String(data['booker_name'])}, ${String(data['start'])}`,
          })
        : JSON.stringify({ event: payload['event'], data });
    const signature = await hmacHex(String(payload['secret']), body);
    const res = await fetch(String(payload['url']), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pumasi-signature': signature,
      },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}
