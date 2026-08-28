/**
 * SPEC-0002 F2, F3, D9 — the booking page.
 *
 * The server renders UTC. The browser converts for display, in one place, and
 * submits the UTC value it was given. No converted value is ever sent back or
 * stored — that is the architecture the steward confirmed, and the hidden field
 * below is where it is kept honest.
 */

import type { Slot } from '@pumasi/scheduling-core';
import type { Schedule } from './schedules.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

const SHELL = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
 :root{color-scheme:light dark;--fg:#111;--muted:#666;--line:#ddd;--accent:#1a56db}
 @media(prefers-color-scheme:dark){:root{--fg:#eee;--muted:#999;--line:#333;--accent:#7aa2f7}}
 *{box-sizing:border-box}
 body{font:16px/1.5 system-ui,-apple-system,sans-serif;color:var(--fg);
      max-width:34rem;margin:0 auto;padding:2rem 1rem}
 h1{font-size:1.5rem;margin:0 0 .25rem} .muted{color:var(--muted);font-size:.9rem}
 .day{margin:1.5rem 0 .5rem;font-weight:600;font-size:.95rem}
 .slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(7rem,1fr));gap:.5rem}
 button.slot{padding:.6rem;border:1px solid var(--line);border-radius:.4rem;
   background:transparent;color:var(--fg);font:inherit;cursor:pointer}
 button.slot:hover,button.slot[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}
 form{margin-top:1.5rem} .js form:not(.on){display:none}
 label{display:block;margin:.75rem 0 .25rem;font-size:.9rem}
 input{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;
   background:transparent;color:var(--fg);font:inherit}
 .notice{font-size:.8rem;color:var(--muted);margin-top:.4rem}
 .submit{margin-top:1rem;padding:.65rem 1.2rem;border:0;border-radius:.4rem;
   background:var(--accent);color:#fff;font:inherit;cursor:pointer}
 .err{border-left:3px solid #c33;padding:.5rem .75rem;margin:1rem 0}
 .ok{border-left:3px solid #2a2;padding:.5rem .75rem;margin:1rem 0}
</style></head><body>${body}</body></html>`;

export function bookingPage(
  schedule: Schedule,
  slots: Slot[],
  opts: { error?: string; csrf?: string } = {},
): string {
  const err = opts.error ? `<p class="err">${esc(opts.error)}</p>` : '';
  // Rendered server-side so the page works without JavaScript. The script
  // below replaces this with the same slots grouped and formatted in the
  // viewer's zone — enhancement, not the only path to a booking.
  const buttons = slots
    .map(
      (s) =>
        `<button type="button" class="slot" data-start="${esc(s.start)}" data-end="${esc(s.end)}" aria-pressed="false">${esc(s.start.slice(11, 16))} UTC</button>`,
    )
    .join('');

  const empty = slots.length === 0 ? '<p class="muted">No times available in this window.</p>' : '';

  return SHELL(
    schedule.title,
    `<h1>${esc(schedule.title)}</h1>
<p class="muted">${schedule.duration_minutes} minutes &middot; times shown in <span id="tz"></span></p>
${err}${empty}
<div id="list"><div class="slots">${buttons}</div></div>
<script type="application/json" id="slots-data">${JSON.stringify(slots).replace(/</g, '\\u003c')}</script>
<form method="post" action="/${esc(schedule.slug)}/book" id="f">
  <noscript><p class="muted">Times above are shown in UTC. With JavaScript on they
    appear in your own timezone.</p></noscript>
  <input type="hidden" name="start" id="start"><input type="hidden" name="end" id="end">
  <label for="name">Your name</label><input id="name" name="name" required autocomplete="name">
  <label for="email">Your email</label><input id="email" name="email" type="email" required autocomplete="email">
  <!-- D9 · told at the point of collection, next to the field, not behind a link -->
  <p class="notice">We store your name, email and the meeting time so the organiser
    can meet you. Nobody else sees them. The confirmation email has a link that
    cancels the booking and deletes these details.</p>
  <input type="hidden" name="booker_tz" id="btz">
  <button class="submit" type="submit">Confirm booking</button>
</form>
<script>
// F2 — conversion happens HERE and nowhere else. The values submitted below are
// the UTC instants the server sent, untouched.
(function(){
  document.documentElement.className += ' js';
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById('tz').textContent = tz;
  document.getElementById('btz').value = tz;
  var all = JSON.parse(document.getElementById('slots-data').textContent);
  var dayFmt = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'});
  var timeFmt = new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'});
  var byDay = {};
  all.forEach(function(s){
    var d = new Date(s.start), k = dayFmt.format(d);
    (byDay[k] = byDay[k] || []).push(s);
  });
  var list = document.getElementById('list');
  list.textContent = '';            // replace the server-rendered fallback
  Object.keys(byDay).forEach(function(k){
    var h = document.createElement('div'); h.className='day'; h.textContent=k; list.appendChild(h);
    var g = document.createElement('div'); g.className='slots';
    byDay[k].forEach(function(s){
      var b=document.createElement('button');
      b.type='button'; b.className='slot'; b.textContent=timeFmt.format(new Date(s.start));
      b.onclick=function(){
        document.querySelectorAll('.slot').forEach(function(x){x.setAttribute('aria-pressed','false')});
        b.setAttribute('aria-pressed','true');
        document.getElementById('start').value = s.start;
        document.getElementById('end').value = s.end;
        document.getElementById('f').classList.add('on');
        document.getElementById('name').focus();
      };
      g.appendChild(b);
    });
    list.appendChild(g);
  });
})();
</script>`,
  );
}

export function confirmedPage(opts: { title: string; start: string }): string {
  return SHELL(
    'Booked',
    `<h1>Booked</h1>
<p class="ok">${esc(opts.title)} is confirmed for <time datetime="${esc(opts.start)}" id="t">${esc(opts.start)}</time>.</p>
<p class="muted">A confirmation is on its way. It contains the link for changing
  or cancelling this booking — that link is deliberately not shown here, so that
  only whoever holds the mailbox can act on it.</p>
<script>var t=document.getElementById('t');
 t.textContent=new Date(t.getAttribute('datetime')).toLocaleString();</script>`,
  );
}

export function managePage(opts: {
  title: string;
  start: string;
  token: string;
  status: string;
  slots?: Slot[];
  error?: string;
}): string {
  const active = opts.status === 'confirmed';
  const slots = opts.slots ?? [];

  // L4 · reschedule. The slots come from the engine exactly as the booking page
  // gets them; this offers them, it does not compute them.
  const moveForm =
    active && slots.length > 0
      ? `<h2>Move it</h2>
<form method="post" action="/b/${esc(opts.token)}/reschedule" id="mv">
  <input type="hidden" name="start" id="ms"><input type="hidden" name="end" id="me">
  <div class="slots">${slots
    .map(
      (s) =>
        `<button type="button" class="slot" data-start="${esc(s.start)}" data-end="${esc(s.end)}">${esc(s.start.slice(11, 16))} UTC</button>`,
    )
    .join('')}</div>
  <button class="submit" type="submit" id="mb" disabled>Move to the selected time</button>
</form>`
      : active
        ? '<p class="muted">No other times are available to move to right now.</p>'
        : '';

  return SHELL(
    'Your booking',
    `<h1>Your booking</h1>
<p>${esc(opts.title)} — <time datetime="${esc(opts.start)}" id="t">${esc(opts.start)}</time></p>
<p class="muted">Status: ${esc(opts.status)}</p>
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ''}
${
  active
    ? `${moveForm}
       <h2>Or cancel</h2>
       <form method="post" action="/b/${esc(opts.token)}/cancel">
         <button class="submit" type="submit">Cancel this booking</button>
       </form>
       <!-- D8 · a bearer link may cancel, but deleting data takes a second step -->
       <form method="post" action="/b/${esc(opts.token)}/delete">
         <label><input type="checkbox" name="confirm" value="yes" required style="width:auto">
           Also delete my name and email</label>
         <button class="submit" type="submit">Cancel and delete my details</button>
       </form>`
    : '<p class="muted">This booking is no longer active.</p>'
}
<style>h2{font-size:1rem;margin:1.5rem 0 .5rem}</style>
<script>
var t=document.getElementById('t');
t.textContent=new Date(t.getAttribute('datetime')).toLocaleString();
document.querySelectorAll('#mv .slot').forEach(function(b){
  b.textContent=new Date(b.dataset.start).toLocaleString();
  b.onclick=function(){
    document.querySelectorAll('#mv .slot').forEach(function(x){x.setAttribute('aria-pressed','false')});
    b.setAttribute('aria-pressed','true');
    document.getElementById('ms').value=b.dataset.start;
    document.getElementById('me').value=b.dataset.end;
    document.getElementById('mb').disabled=false;
  };
});
</script>`,
  );
}

export function errorPage(code: number, message: string): string {
  return SHELL(String(code), `<h1>${code}</h1><p class="err">${esc(message)}</p>`);
}

// ── owner surfaces ─────────────────────────────────────────────────────────

export function signupPage(inviteCode: string, error?: string): string {
  return SHELL(
    'Create your account',
    `<h1>Create your account</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/signup">
  <input type="hidden" name="invite" value="${esc(inviteCode)}">
  <label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email">
  <label for="n">Your name</label><input id="n" name="display_name" required autocomplete="name">
  <label for="tz">Your timezone</label><input id="tz" name="timezone" required value="UTC">
  <p class="notice">Invite-only. Your address is used to sign you in and to tell
    you about your own bookings, nothing else.</p>
  <button class="submit" type="submit">Create account</button>
</form>
<script>var t=document.getElementById('tz');
 t.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';</script>`,
  );
}

export function loginPage(sent?: boolean, error?: string): string {
  return SHELL(
    'Sign in',
    `<h1>Sign in</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
${
  sent
    ? `<p class="ok">If that address has an account, a sign-in link is on its way.
         It works once and expires in 20 minutes.</p>`
    : `<form method="post" action="/login">
         <label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email">
         <p class="notice">We send a link rather than asking for a password. There
           is no password on this account to forget or to leak.</p>
         <button class="submit" type="submit">Send me a link</button>
       </form>`
}`,
  );
}

export interface ScheduleSummary {
  schedule_id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  rules: { weekday: string; start: string; end: string }[];
  upcoming: number;
}

const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

export function ownerHome(
  owner: { display_name: string; email: string; timezone: string },
  schedules: ScheduleSummary[],
  baseUrl: string,
  notice?: string,
): string {
  const list = schedules
    .map(
      (s) => `<div class="card">
  <h2>${esc(s.title)}</h2>
  <p class="muted">${s.duration_minutes} min &middot;
    <a href="${esc(baseUrl)}/${esc(s.slug)}">${esc(baseUrl)}/${esc(s.slug)}</a>
    &middot; ${s.upcoming} upcoming</p>
  <form method="post" action="/app/schedules/${esc(s.schedule_id)}/availability">
    <table class="avail">
      ${DAYS.map((d) => {
        const r = s.rules.find((x) => x.weekday === d);
        return `<tr><th>${d}</th>
          <td><input name="${d}_start" value="${esc(r?.start ?? '')}" placeholder="09:00" size="5"></td>
          <td><input name="${d}_end" value="${esc(r?.end ?? '')}" placeholder="17:00" size="5"></td></tr>`;
      }).join('')}
    </table>
    <p class="notice">Times are in your own timezone (${esc(owner.timezone)}).
      Leave a day blank to be unavailable.</p>
    <button class="submit" type="submit">Save availability</button>
  </form>
</div>`,
    )
    .join('');

  return SHELL(
    'Your schedules',
    `<h1>Your schedules</h1>
<p class="muted">${esc(owner.display_name)} &middot; ${esc(owner.email)} &middot; ${esc(owner.timezone)}
  &middot; <form method="post" action="/logout" style="display:inline">
    <button type="submit" class="linkish">sign out</button></form></p>
${notice ? `<p class="ok">${esc(notice)}</p>` : ''}
${schedules.length === 0 ? '<p class="muted">No booking pages yet.</p>' : list}
<div class="card">
  <h2>Your account</h2>
  <p class="muted">Deleting removes your account, your booking pages, and every
    booking on them — including the names and email addresses of people who
    booked with you. It cannot be undone.</p>
  <form method="post" action="/app/delete">
    <label><input type="checkbox" name="confirm" value="yes" required style="width:auto">
      I understand this deletes everything, permanently</label>
    <button class="submit" type="submit">Delete my account</button>
  </form>
</div>
<div class="card">
  <h2>New booking page</h2>
  <form method="post" action="/app/schedules">
    <label for="t">Title</label><input id="t" name="title" required placeholder="Intro call">
    <label for="sl">Link</label><input id="sl" name="slug" required placeholder="intro"
      pattern="[a-z0-9-]{2,40}" title="lowercase letters, digits and dashes">
    <label for="d">Minutes</label><input id="d" name="duration_minutes" type="number" value="30" min="1" required>
    <button class="submit" type="submit">Create</button>
  </form>
</div>
<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 table.avail{border-collapse:collapse} table.avail th{text-align:left;padding-right:.5rem;font-weight:600}
 table.avail td{padding:.15rem .25rem}
 .linkish{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0}
</style>`,
  );
}
