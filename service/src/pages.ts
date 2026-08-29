/**
 * SPEC-0002 F2, F3, D9 — the booking page.
 *
 * The server renders UTC. The browser converts for display, in one place, and
 * submits the UTC value it was given. No converted value is ever sent back or
 * stored — that is the architecture the steward confirmed, and the hidden field
 * below is where it is kept honest.
 */

import type { Slot } from '@pumasi/booking-core';
import { locationText, type Schedule } from './schedules.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

// The product name. It belongs in the browser tab, where it identifies the tool
// without competing with the page's own heading -- a public booking page is the
// OWNER'S page, and their schedule title stays the largest thing on it.
const PRODUCT = 'Pumasi Booking';

const SHELL = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === PRODUCT ? PRODUCT : `${esc(title)} &middot; ${PRODUCT}`}</title>
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
  opts: { error?: string; csrf?: string; action?: string } = {},
): string {
  const err = opts.error ? `<p class="err">${esc(opts.error)}</p>` : '';
  // Rendered server-side so the page works without JavaScript. The script
  // below replaces this with a month calendar in the viewer's timezone —
  // enhancement, not the only path to a booking.
  const buttons = slots
    .map(
      (s) =>
        `<button type="button" class="slot" data-start="${esc(s.start)}" data-end="${esc(s.end)}" aria-pressed="false">${esc(s.start.slice(0, 10))} ${esc(s.start.slice(11, 16))} UTC</button>`,
    )
    .join('');

  const empty = slots.length === 0 ? '<p class="muted">No times available in this window.</p>' : '';
  const where = locationText(schedule);

  return SHELL(
    schedule.title,
    `<div class="book-grid">
<div class="book-meta">
  <h1>${esc(schedule.title)}</h1>
  <p class="muted">${schedule.duration_minutes} minutes${where ? ` &middot; ${esc(where)}` : ''}</p>
  ${schedule.description ? `<p>${esc(schedule.description)}</p>` : ''}
  <p class="muted">Times shown in <span id="tzname"></span></p>
  <div id="tzwrap" hidden><label for="tzsel">Timezone</label><select id="tzsel"></select></div>
</div>
<div class="book-pick">
${err}${empty}
<div id="cal" hidden>
  <div class="cal-head">
    <button type="button" id="prev" class="navbtn" aria-label="Previous month">&lsaquo;</button>
    <div id="month" class="day" style="margin:0"></div>
    <button type="button" id="next" class="navbtn" aria-label="Next month">&rsaquo;</button>
  </div>
  <div class="cal-dow" id="dow"></div>
  <div class="cal-days" id="days"></div>
  <div class="day" id="picked-day" hidden></div>
  <div class="slots" id="times"></div>
</div>
<div id="list"><div class="slots">${buttons}</div></div>
<script type="application/json" id="slots-data">${JSON.stringify(slots).replace(/</g, '\\u003c')}</script>
<form method="post" action="${esc(opts.action ?? `/${schedule.slug}/book`)}" id="f">
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
</div></div>
<style>
 .book-grid{display:grid;grid-template-columns:1fr;gap:1rem}
 @media(min-width:44rem){.book-grid{grid-template-columns:16rem 1fr}}
 .cal-head{display:flex;align-items:center;justify-content:space-between;margin:.5rem 0}
 .navbtn{border:1px solid var(--line);background:transparent;color:var(--fg);
   border-radius:.4rem;padding:.2rem .7rem;font:inherit;cursor:pointer}
 .cal-dow,.cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:.2rem}
 .cal-dow{font-size:.7rem;color:var(--muted);text-transform:uppercase;text-align:center}
 .cal-days button{aspect-ratio:1;border:0;border-radius:50%;background:transparent;
   color:var(--fg);font:inherit;cursor:pointer}
 .cal-days button:disabled{color:var(--muted);opacity:.35;cursor:default}
 .cal-days button.has{background:var(--accent);color:#fff;opacity:.85}
 .cal-days button.has:hover,.cal-days button[aria-pressed=true]{opacity:1;outline:2px solid var(--accent);outline-offset:2px}
 .cal-days .blank{visibility:hidden}
 select{width:100%;padding:.45rem;border:1px solid var(--line);border-radius:.4rem;
   background:transparent;color:var(--fg);font:inherit}
</style>
<script>
// F2 — conversion happens HERE and nowhere else. The values submitted below are
// the UTC instants the server sent, untouched.
(function(){
  document.documentElement.className += ' js';
  var all = JSON.parse(document.getElementById('slots-data').textContent);
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  var tzSel = document.getElementById('tzsel');
  try {
    var zones = Intl.supportedValuesOf('timeZone');
    zones.forEach(function(z){ var o=document.createElement('option'); o.value=z; o.textContent=z; tzSel.appendChild(o); });
    tzSel.value = tz;
    document.getElementById('tzwrap').hidden = false;
  } catch(e) {}
  tzSel.onchange = function(){ tz = tzSel.value; render(); };

  var cal = document.getElementById('cal'), list = document.getElementById('list');
  if (all.length) { cal.hidden = false; list.hidden = true; }

  function ymd(iso, zone){ // the slot's local calendar date in that zone
    return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));
  }
  var view = null, pickedDay = null;
  function render(){
    document.getElementById('tzname').textContent = tz;
    document.getElementById('btz').value = tz;
    var byDay = {};
    all.forEach(function(s){ var k = ymd(s.start, tz); (byDay[k]=byDay[k]||[]).push(s); });
    var dayKeys = Object.keys(byDay).sort();
    if (!dayKeys.length) return;
    if (!view || !pickedDay || !byDay[pickedDay]) { pickedDay = dayKeys[0]; }
    if (!view) view = pickedDay.slice(0,7);
    var months = {}; dayKeys.forEach(function(k){ months[k.slice(0,7)] = 1; });
    var monthKeys = Object.keys(months).sort();
    if (!months[view]) view = monthKeys[0];

    var mFmt = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
    document.getElementById('month').textContent = mFmt.format(new Date(view + '-01T00:00:00Z'));
    var i = monthKeys.indexOf(view);
    document.getElementById('prev').disabled = i <= 0;
    document.getElementById('next').disabled = i >= monthKeys.length - 1;
    document.getElementById('prev').onclick = function(){ view = monthKeys[i-1]; render(); };
    document.getElementById('next').onclick = function(){ view = monthKeys[i+1]; render(); };

    var dow = document.getElementById('dow'); dow.textContent='';
    ['S','M','T','W','T','F','S'].forEach(function(d){ var c=document.createElement('div'); c.textContent=d; dow.appendChild(c); });

    var days = document.getElementById('days'); days.textContent='';
    var first = new Date(view + '-01T00:00:00Z');
    var startDow = first.getUTCDay();
    var dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth()+1, 0)).getUTCDate();
    for (var b=0;b<startDow;b++){ var bl=document.createElement('button'); bl.className='blank'; bl.disabled=true; days.appendChild(bl); }
    for (var d=1;d<=dim;d++){
      var key = view + '-' + String(d).padStart(2,'0');
      var btn = document.createElement('button'); btn.type='button'; btn.textContent=d;
      if (byDay[key]) {
        btn.className='has';
        if (key === pickedDay) btn.setAttribute('aria-pressed','true');
        btn.onclick = (function(k){ return function(){ pickedDay = k; render(); }; })(key);
      } else { btn.disabled = true; }
      days.appendChild(btn);
    }

    var dayFmt = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:tz});
    var timeFmt = new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:tz});
    var pd = document.getElementById('picked-day');
    pd.hidden = false; pd.textContent = dayFmt.format(new Date(byDay[pickedDay][0].start));
    var times = document.getElementById('times'); times.textContent='';
    byDay[pickedDay].forEach(function(s){
      var b=document.createElement('button');
      b.type='button'; b.className='slot'; b.textContent=timeFmt.format(new Date(s.start));
      b.onclick=function(){
        times.querySelectorAll('.slot').forEach(function(x){x.setAttribute('aria-pressed','false')});
        b.setAttribute('aria-pressed','true');
        document.getElementById('start').value = s.start;
        document.getElementById('end').value = s.end;
        document.getElementById('f').classList.add('on');
        document.getElementById('name').focus();
      };
      times.appendChild(b);
    });
  }
  render();
})();
</script>`,
  );
}

export function confirmedPage(opts: { title: string; start: string; location?: string }): string {
  return SHELL(
    'Booked',
    `<h1>Booked</h1>
<p class="ok">${esc(opts.title)} is confirmed for <time datetime="${esc(opts.start)}" id="t">${esc(opts.start)}</time>.</p>
${opts.location ? `<p class="muted">Where: ${esc(opts.location)}</p>` : ''}
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

/**
 * The front door. Until this existed, `/` answered 404 and the service read as
 * broken to anyone who typed the bare domain. It explains what lives here and
 * where the doors are; the real surfaces are the owners' booking pages.
 */
export function homePage(): string {
  return SHELL(
    PRODUCT,
    `<h1>${PRODUCT}</h1>
<p class="muted">Share a link; people pick a time.</p>
<p>Booking pages live at their own links. If someone sent you one,
use that link to pick a time — this page cannot list them.</p>
<p><a href="/login">Sign in</a> to manage your booking pages.
Accounts are invite-only while the service stays small.</p>`,
  );
}

export function errorPage(code: number, message: string): string {
  return SHELL(String(code), `<h1>${code}</h1><p class="err">${esc(message)}</p>`);
}

// ── owner surfaces ─────────────────────────────────────────────────────────

/** P4 — the "Continue with Google" form, shared by sign-in and sign-up. */
function googleButton(inviteCode = ''): string {
  return `<form method="post" action="/auth/google/start" class="ssoform">
  <input type="hidden" name="invite" value="${esc(inviteCode)}">
  <input type="hidden" name="timezone" class="tzauto">
  <button class="submit sso" type="submit">Continue with Google</button>
</form>
<p class="muted" style="text-align:center">or</p>
<script>document.querySelectorAll('.tzauto').forEach(function(i){
  try{i.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}});</script>
<style>.sso{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.ssoform{margin:1rem 0 .25rem}</style>`;
}

export function signupPage(
  inviteCode: string,
  error?: string,
  opts: { sso?: boolean; publicSignup?: boolean } = {},
): string {
  return SHELL(
    'Create your account',
    `<h1>Create your account</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
${opts.sso ? googleButton(inviteCode) : ''}
<form method="post" action="/signup">
  <input type="hidden" name="invite" value="${esc(inviteCode)}">
  <label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email">
  <label for="n">Your name</label><input id="n" name="display_name" required autocomplete="name">
  <label for="tz">Your timezone</label><input id="tz" name="timezone" required value="UTC">
  <p class="notice">${opts.publicSignup ? '' : 'Invite-only. '}Your address is used to sign you in and to tell
    you about your own bookings, nothing else.</p>
  <button class="submit" type="submit">Create account</button>
</form>
<script>var t=document.getElementById('tz');
 t.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';</script>`,
  );
}

export function loginPage(sent?: boolean, error?: string, sso?: boolean): string {
  return SHELL(
    'Sign in',
    `<h1>Sign in</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
${
  sent
    ? `<p class="ok">If that address has an account, a sign-in link is on its way.
         It works once and expires in 20 minutes.</p>`
    : `${sso ? googleButton() : ''}
       <form method="post" action="/login">
         <label for="e">Email</label><input id="e" name="email" type="email" required autocomplete="email">
         <p class="notice">We send a link rather than asking for a password. There
           is no password on this account to forget or to leak.</p>
         <button class="submit" type="submit">Send me a link</button>
       </form>`
}`,
  );
}

/** P4 — profile, brand, and the owner's link. */
export function settingsPage(
  s: {
    display_name: string; email: string; timezone: string; link_slug: string;
    welcome_message: string; brand_color: string;
  },
  baseUrl: string,
  error?: string,
): string {
  return SHELL(
    'Settings',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Settings</h1>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/app/settings">
<div class="card"><h2>Profile</h2>
  <label for="dn">Your name</label><input id="dn" name="display_name" value="${esc(s.display_name)}">
  <label>Email</label><input value="${esc(s.email)}" disabled>
  <label for="tz">Timezone</label><input id="tz" name="timezone" value="${esc(s.timezone)}">
  <label for="wm">Welcome message (shown on your public page)</label>
  <input id="wm" name="welcome_message" value="${esc(s.welcome_message)}" maxlength="500"
    placeholder="Pick a meeting to see available times.">
</div>
<div class="card"><h2>Brand</h2>
  <label for="bc">Accent color</label>
  <input id="bc" name="brand_color" value="${esc(s.brand_color)}" placeholder="#1a56db" size="8">
</div>
<div class="card"><h2>Your link</h2>
  <p class="muted">${esc(baseUrl)}/<b>${esc(s.link_slug)}</b></p>
  <label for="ls">Link name</label>
  <input id="ls" name="link_slug" value="${esc(s.link_slug)}" pattern="[a-z0-9-]{2,40}">
  <p class="notice">Changing this breaks every link you have already shared —
    they will need the new address.</p>
</div>
<button class="submit" type="submit">Save settings</button>
</form>
<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
</style>`,
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

const DAYS_FULL = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

const CARD_CSS = `<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 .linkish{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0}
 table.rows{border-collapse:collapse;width:100%}
 table.rows td,table.rows th{padding:.4rem .5rem;border-bottom:1px solid var(--line);text-align:left;font-size:.92rem}
 .pill{font-size:.75rem;border:1px solid var(--line);border-radius:1rem;padding:.1rem .5rem;color:var(--muted)}
 .navrow{display:flex;gap:1rem;margin:.25rem 0 1rem;flex-wrap:wrap}
</style>`;

/** P3 — the owner's meetings, filterable, actionable. */
export function meetingsPage(
  items: {
    booking_id: string; start: string; end: string; status: string;
    name: string; email: string; no_show: boolean; note: string; title: string;
  }[],
  range: string,
  q: string,
  timezone: string,
): string {
  const rows = items
    .map(
      (m) => `<div class="card">
  <p><b>${esc(m.title)}</b> &middot; <time datetime="${esc(m.start)}" class="lt">${esc(m.start)}</time>
    ${m.status === 'cancelled' ? '<span class="pill">cancelled</span>' : ''}
    ${m.no_show ? '<span class="pill">no-show</span>' : ''}</p>
  <p class="muted">${esc(m.name)} &middot; ${esc(m.email)}</p>
  <form method="post" action="/app/meetings/${esc(m.booking_id)}/note" class="noterow">
    <input type="hidden" name="range" value="${esc(range)}">
    <input name="note" value="${esc(m.note)}" placeholder="Private note (only you see this)">
    <button class="linkish" type="submit">save note</button>
  </form>
  <p>
  ${m.status === 'confirmed' ? `<form method="post" action="/app/meetings/${esc(m.booking_id)}/cancel" style="display:inline">
    <input type="hidden" name="range" value="${esc(range)}">
    <button class="linkish" type="submit">cancel meeting</button></form> &middot; ` : ''}
  <form method="post" action="/app/meetings/${esc(m.booking_id)}/noshow" style="display:inline">
    <input type="hidden" name="range" value="${esc(range)}">
    <button class="linkish" type="submit">${m.no_show ? 'clear no-show' : 'mark no-show'}</button></form>
  </p>
</div>`,
    )
    .join('');

  return SHELL(
    'Meetings',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Meetings</h1>
<div class="navrow">
  <a href="/app/meetings" ${range !== 'past' ? 'style="font-weight:600"' : ''}>Upcoming</a>
  <a href="/app/meetings?range=past" ${range === 'past' ? 'style="font-weight:600"' : ''}>Past</a>
  <form method="get" action="/app/meetings" style="margin:0">
    <input type="hidden" name="range" value="${esc(range)}">
    <input name="q" value="${esc(q)}" placeholder="Search name or email" size="24">
  </form>
</div>
${rows || '<p class="muted">Nothing here.</p>'}
${CARD_CSS}
<style>.noterow{display:flex;gap:.5rem;margin:.5rem 0}.noterow input[name=note]{flex:1}</style>
<script>document.querySelectorAll('time.lt').forEach(function(t){
  t.textContent = new Date(t.getAttribute('datetime')).toLocaleString(undefined,
    {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
});</script>`,
  );
}

/** P3 — contacts accreted from bookings, with exclusions. */
export function contactsPage(
  contacts: { email: string; name: string; times_booked: number; last_booked_at: string }[],
  exclusions: string[],
): string {
  const rows = contacts
    .map(
      (c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.email)}</td>
  <td>${c.times_booked}</td><td>${esc(c.last_booked_at)}</td>
  <td><form method="post" action="/app/contacts/delete" style="margin:0">
    <input type="hidden" name="email" value="${esc(c.email)}">
    <button class="linkish" type="submit">delete</button></form></td></tr>`,
    )
    .join('');
  const ex = exclusions
    .map(
      (p) => `<li>${esc(p)} <form method="post" action="/app/contacts/exclusions" style="display:inline">
  <input type="hidden" name="remove" value="${esc(p)}">
  <button class="linkish" type="submit">remove</button></form></li>`,
    )
    .join('');
  return SHELL(
    'Contacts',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Contacts</h1>
<p class="muted">People who booked with you, newest first. Deleting a contact
  does not touch their bookings.</p>
${rows ? `<table class="rows"><tr><th>Name</th><th>Email</th><th>Bookings</th><th>Last</th><th></th></tr>${rows}</table>` : '<p class="muted">No contacts yet.</p>'}
<div class="card">
  <h2>Exclusions</h2>
  <p class="muted">Addresses or whole domains that never become contacts.</p>
  ${ex ? `<ul>${ex}</ul>` : ''}
  <form method="post" action="/app/contacts/exclusions">
    <input name="pattern" placeholder="person@company.com or company.com">
    <button class="submit" type="submit">Exclude</button>
  </form>
</div>
${CARD_CSS}`,
  );
}

/** P3 — "offer times in email": a paste-ready list of upcoming openings. */
export function snippetPage(
  title: string,
  url: string,
  timezone: string,
  slots: Slot[],
): string {
  return SHELL(
    'Offer times',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Offer times in an email</h1>
<p class="muted">Copy this into a message. Times are in your timezone
  (${esc(timezone)}); the link lets them pick anything else.</p>
<textarea id="snip" rows="12" style="width:100%;font:inherit;padding:.75rem;border:1px solid var(--line);border-radius:.4rem;background:transparent;color:var(--fg)"></textarea>
<p><button class="submit" id="copy" type="button">Copy to clipboard</button></p>
<script type="application/json" id="snip-data">${JSON.stringify({ title, url, timezone, slots }).replace(/</g, '\\u003c')}</script>
<script>
(function(){
  var d = JSON.parse(document.getElementById('snip-data').textContent);
  var fmt = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',
    hour:'numeric',minute:'2-digit',timeZone:d.timezone});
  var lines = ['Here are some times that work for a ' + d.title + ':', ''];
  var seen = {};
  d.slots.forEach(function(s){
    var t = fmt.format(new Date(s.start));
    if (!seen[t]) { seen[t] = 1; lines.push('  - ' + t); }
  });
  lines.push('', 'Or pick any other time here: ' + d.url);
  var ta = document.getElementById('snip');
  ta.value = lines.join('\\n');
  document.getElementById('copy').onclick = function(){
    ta.select(); navigator.clipboard.writeText(ta.value);
    this.textContent = 'Copied';
  };
})();
</script>`,
  );
}

/** P2 — the editor for one named availability set. */
export function availabilityEditor(set: {
  set_id: string;
  name: string;
  timezone: string;
  rules: { weekday: string; start: string; end: string }[];
  overrides: { date: string; start?: string; end?: string }[];
}): string {
  const weekly = DAYS_FULL.map((d) => {
    const r = set.rules.find((x) => x.weekday === d);
    return `<tr><th>${d}</th>
      <td><input name="${d}_start" value="${esc(r?.start ?? '')}" placeholder="09:00" size="5"></td>
      <td><input name="${d}_end" value="${esc(r?.end ?? '')}" placeholder="17:00" size="5"></td></tr>`;
  }).join('');

  const ov = set.overrides
    .map(
      (o) => `<tr><td>${esc(o.date)}</td>
  <td>${o.start ? `${esc(o.start)}–${esc(o.end ?? '')}` : '<span class="muted">unavailable</span>'}</td>
  <td><form method="post" action="/app/availability/${esc(set.set_id)}/overrides" style="margin:0">
    <input type="hidden" name="remove" value="${esc(o.date)}">
    <button class="linkish" type="submit">remove</button></form></td></tr>`,
    )
    .join('');

  return SHELL(
    set.name,
    `<p class="muted"><a href="/app">&lsaquo; back</a></p>
<h1>${esc(set.name)}</h1>
<p class="muted">Times are in your own timezone (${esc(set.timezone)}). Every event
  type using this schedule follows what you save here.</p>
<div class="card">
  <h2>Weekly hours</h2>
  <form method="post" action="/app/availability/${esc(set.set_id)}/hours">
    <table class="avail">${weekly}</table>
    <p class="notice">Leave a day blank to be unavailable.</p>
    <button class="submit" type="submit">Save weekly hours</button>
  </form>
</div>
<div class="card">
  <h2>Date-specific hours</h2>
  <p class="muted">A date listed here replaces that day's weekly hours entirely.
    No times means the whole day is unavailable.</p>
  ${ov ? `<table class="avail">${ov}</table>` : ''}
  <form method="post" action="/app/availability/${esc(set.set_id)}/overrides">
    <label>Date <input type="date" name="date" required></label>
    <label>From <input name="start" placeholder="09:00" size="5"></label>
    <label>To <input name="end" placeholder="12:00" size="5"></label>
    <button class="submit" type="submit">Add override</button>
  </form>
</div>
<div class="card">
  <h2>Holidays</h2>
  <p class="muted">Marks your country's public holidays (this year and next) as
    unavailable, as date overrides you can remove one by one.</p>
  <form method="post" action="/app/availability/${esc(set.set_id)}/holidays">
    <label>Country code <input name="country" placeholder="US" size="3" maxlength="2" required></label>
    <button class="submit" type="submit">Block holidays</button>
  </form>
</div>
<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 table.avail{border-collapse:collapse} table.avail th{text-align:left;padding-right:.5rem;font-weight:600}
 table.avail td{padding:.15rem .35rem}
 .linkish{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0}
 label{display:inline-block;margin-right:.75rem}
 input[type=date]{width:auto}
</style>`,
  );
}

/** P2 — the editor for one event type. */
/** P6 — a plain page carrying one message, for routing/poll endpoints. */
export function messagePage(title: string, message: string): string {
  return SHELL(title, `<h1>${esc(title)}</h1>\n<p class="ok">${esc(message)}</p>`);
}

/** P6 — the routing forms manager: every form, editable in place. */
export function routingPage(
  forms: {
    form_id: string; slug: string; title: string; question: string;
    options: { option_id: string; label: string; kind: string; value: string }[];
  }[],
  myEvents: { schedule_id: string; title: string }[],
  baseUrl: string,
): string {
  const evOptions = myEvents
    .map((e) => `<option value="${esc(e.schedule_id)}">${esc(e.title)}</option>`).join('');
  const list = forms
    .map(
      (f) => `<div class="card">
  <h2>${esc(f.title)}</h2>
  <p class="muted"><a href="${esc(baseUrl)}/r/${esc(f.slug)}">${esc(baseUrl)}/r/${esc(f.slug)}</a>
    &middot; “${esc(f.question)}”</p>
  ${f.options
    .map(
      (o) => `<p>${esc(o.label)} <span class="muted">→ ${esc(o.kind)}${o.kind !== 'event' ? `: ${esc(o.value.slice(0, 60))}` : ''}</span>
    <form method="post" action="/app/routing/${esc(f.form_id)}/options" style="display:inline">
      <input type="hidden" name="remove" value="${esc(o.option_id)}">
      <button class="linkish" type="submit">remove</button></form></p>`,
    )
    .join('')}
  <form method="post" action="/app/routing/${esc(f.form_id)}/options" class="optrow">
    <input name="label" placeholder="Answer (e.g. Sales)" required>
    <select name="destination_kind" onchange="this.parentNode.querySelectorAll('[data-k]').forEach(x=>x.hidden=x.dataset.k!==this.value)">
      <option value="event">→ booking page</option>
      <option value="url">→ external URL</option>
      <option value="message">→ message</option>
    </select>
    <select name="destination_value" data-k="event">${evOptions}</select>
    <input name="destination_value" data-k="url" placeholder="https://…" hidden disabled>
    <input name="destination_value" data-k="message" placeholder="What to tell them" hidden disabled>
    <button class="submit" type="submit">Add option</button>
  </form>
  <form method="post" action="/app/routing/${esc(f.form_id)}/delete">
    <button class="linkish" type="submit">Delete form</button>
  </form>
</div>`,
    )
    .join('');
  return SHELL(
    'Routing',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Routing forms</h1>
<p class="muted">Ask one question first; the answer sends people to the right
  booking page, an external link, or a message. Answers are not stored.</p>
${list}
<div class="card">
  <h2>New routing form</h2>
  <form method="post" action="/app/routing">
    <label for="rt">Title</label><input id="rt" name="title" required placeholder="Talk to us">
    <label for="rs">Link</label><input id="rs" name="slug" required pattern="[a-z0-9-]{2,40}" placeholder="talk">
    <label for="rq">The question</label><input id="rq" name="question" required placeholder="What do you need?">
    <button class="submit" type="submit">Create</button>
  </form>
</div>
${CARD_CSS}
<script>
// keep only the matching destination input enabled so one value posts
document.querySelectorAll('.optrow').forEach(function(f){
  var sel=f.querySelector('select[name=destination_kind]');
  function sync(){ f.querySelectorAll('[data-k]').forEach(function(x){
    var on = x.dataset.k===sel.value; x.hidden=!on; x.disabled=!on; }); }
  sel.onchange=sync; sync();
});
</script>`,
  );
}

/** P6 — the public routing form. */
export function routeFormPage(
  title: string,
  question: string,
  action: string,
  options: { option_id: string; label: string }[],
): string {
  return SHELL(
    title,
    `<h1>${esc(title)}</h1>
<form method="post" action="${esc(action)}" style="margin-top:.5rem">
  <p><b>${esc(question)}</b></p>
  ${options
    .map(
      (o) => `<label style="display:block;margin:.4rem 0">
    <input type="radio" name="answer" value="${esc(o.option_id)}" required style="width:auto"> ${esc(o.label)}</label>`,
    )
    .join('')}
  <button class="submit" type="submit">Continue</button>
</form>`,
  );
}

/** P6 — the owner's poll list and creator. */
export function pollsPage(
  polls: { poll_id: string; title: string; status: string }[],
  timezone: string,
): string {
  const list = polls
    .map(
      (p) => `<p><a href="/app/polls/${esc(p.poll_id)}">${esc(p.title)}</a>
  <span class="pill">${esc(p.status)}</span></p>`,
    )
    .join('');
  return SHELL(
    'Meeting polls',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Meeting polls</h1>
<p class="muted">Propose times, let people vote, book the winner.</p>
${list || '<p class="muted">No polls yet.</p>'}
<div class="card">
  <h2>New poll</h2>
  <form method="post" action="/app/polls">
    <label for="pt">Title</label><input id="pt" name="title" required placeholder="Q3 retro">
    <label for="pd">Duration (minutes)</label><input id="pd" name="duration_minutes" type="number" value="30" min="1">
    <p class="notice">Proposed times, in your timezone (${esc(timezone)}). At least two.</p>
    ${[1, 2, 3, 4, 5]
      .map((i) => `<label>Option ${i}</label><input name="opt${i}" type="datetime-local">`)
      .join('')}
    <button class="submit" type="submit">Create poll</button>
  </form>
</div>
${CARD_CSS}`,
  );
}

/** P6 — one poll's tally, and the button that books the winner. */
export function pollDetailPage(
  poll: { poll_id: string; title: string; status: string; token: string },
  tally: { option_id: string; start: string; votes: number; names: string }[],
  baseUrl: string,
): string {
  return SHELL(
    poll.title,
    `<p class="muted"><a href="/app/polls">&lsaquo; polls</a></p>
<h1>${esc(poll.title)} <span class="pill">${esc(poll.status)}</span></h1>
<p class="muted">Voting link: <code>${esc(baseUrl)}/p/${esc(poll.token)}</code></p>
${tally
  .map(
    (t) => `<div class="card">
  <p><time datetime="${esc(t.start)}" class="lt">${esc(t.start)}</time>
    &middot; <b>${t.votes}</b> vote${t.votes === 1 ? '' : 's'}
    ${t.names ? `<span class="muted">— ${esc(t.names)}</span>` : ''}</p>
  ${poll.status === 'open'
    ? `<form method="post" action="/app/polls/${esc(poll.poll_id)}/book">
    <input type="hidden" name="option" value="${esc(t.option_id)}">
    <button class="submit" type="submit">Book this time</button></form>` : ''}
</div>`,
  )
  .join('')}
<form method="post" action="/app/polls/${esc(poll.poll_id)}/delete">
  <button class="linkish" type="submit">Delete poll (and its votes)</button>
</form>
${CARD_CSS}
<style>code{font-size:.85em;background:var(--line);padding:.1em .3em;border-radius:.25rem}</style>
<script>document.querySelectorAll('time.lt').forEach(function(t){
  t.textContent = new Date(t.getAttribute('datetime')).toLocaleString(undefined,
    {weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
});</script>`,
  );
}

/** P6 — the public voting page. */
export function pollVotePage(
  title: string,
  action: string,
  options: { option_id: string; start: string; end: string }[],
  status: string,
  error?: string,
): string {
  return SHELL(
    title,
    `<h1>${esc(title)}</h1>
${status !== 'open'
    ? '<p class="ok">This poll has closed — the organiser is confirming the time by email.</p>'
    : `${error ? `<p class="err">${esc(error)}</p>` : ''}
<p class="muted">Tick every time that works for you (shown in your timezone).</p>
<form method="post" action="${esc(action)}">
  ${options
    .map(
      (o) => `<label style="display:block;margin:.4rem 0">
    <input type="checkbox" name="vote:${esc(o.option_id)}" style="width:auto">
    <time datetime="${esc(o.start)}" class="lt">${esc(o.start)}</time></label>`,
    )
    .join('')}
  <label for="vn">Your name</label><input id="vn" name="name" required autocomplete="name">
  <label for="ve">Your email</label><input id="ve" name="email" type="email" required autocomplete="email">
  <p class="notice">The organiser sees your name, email and choices; the vote is
    deleted with the poll.</p>
  <button class="submit" type="submit">Send my answer</button>
</form>
<script>document.querySelectorAll('time.lt').forEach(function(t){
  t.textContent = new Date(t.getAttribute('datetime')).toLocaleString(undefined,
    {weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});
});</script>`}`,
  );
}

/** P5 — organizations and their members. */
export function teamPage(
  orgs: {
    org_id: string; name: string; my_role: string;
    members: { owner_id: string; role: string; display_name: string; email: string }[];
  }[],
  myOwnerId: string,
  openInvites: string[] = [],
  baseUrl = '',
): string {
  const list = orgs
    .map(
      (o) => `<div class="card">
  <h2>${esc(o.name)} <span class="pill">${esc(o.my_role)}</span></h2>
  ${o.members
    .map(
      (m) => `<p>${esc(m.display_name)} <span class="muted">${esc(m.email)} · ${esc(m.role)}</span>
    ${o.my_role === 'admin' && m.owner_id !== myOwnerId
      ? `<form method="post" action="/app/team/${esc(o.org_id)}/members" style="display:inline">
      <input type="hidden" name="remove" value="${esc(m.owner_id)}">
      <button class="linkish" type="submit">remove</button></form>` : ''}</p>`,
    )
    .join('')}
  ${o.my_role === 'admin'
    ? `<form method="post" action="/app/team/${esc(o.org_id)}/members">
    <label>Add member by email <input name="email" type="email" required></label>
    <button class="submit" type="submit">Add</button>
  </form>` : ''}
</div>`,
    )
    .join('');
  return SHELL(
    'Team',
    `<p class="muted"><a href="/app">&lsaquo; dashboard</a></p>
<h1>Team</h1>
<p class="muted">Members can host round-robin and collective event types together.
  New members need their own account here first.</p>
${list || '<p class="muted">No teams yet.</p>'}
<div class="card">
  <h2>New team</h2>
  <form method="post" action="/app/team">
    <label for="tn">Name</label><input id="tn" name="name" required placeholder="Sales">
    <button class="submit" type="submit">Create team</button>
  </form>
</div>
<div class="card">
  <h2>Invites</h2>
  <p class="muted">An account is created from an invite link; each works once.</p>
  ${openInvites.map((c) => `<p><code>${esc(baseUrl)}/signup?invite=${esc(c)}</code></p>`).join('')}
  <form method="post" action="/app/invites">
    <button class="submit" type="submit">Mint an invite</button>
  </form>
</div>
${CARD_CSS}
<style>code{font-size:.85em;background:var(--line);padding:.1em .3em;border-radius:.25rem}</style>`,
  );
}

export function eventTypeEditor(
  s: Schedule,
  sets: { set_id: string; name: string }[],
  linkSlug: string,
  baseUrl: string,
  singleUseTokens: string[] = [],
  hostChoices: { owner_id: string; label: string }[] = [],
  currentHosts: string[] = [],
): string {
  const setOptions = sets
    .map(
      (x) =>
        `<option value="${esc(x.set_id)}" ${x.set_id === s.availability_set_id ? 'selected' : ''}>${esc(x.name)}</option>`,
    )
    .join('');
  const kinds: [string, string][] = [
    ['custom', 'Custom note'], ['phone', 'Phone call'],
    ['in_person', 'In person'], ['meet', 'Google Meet'],
  ];
  const kindOptions = kinds
    .map(([v, l]) => `<option value="${v}" ${v === s.location_kind ? 'selected' : ''}>${l}</option>`)
    .join('');
  const url = linkSlug ? `${baseUrl}/${linkSlug}/${s.slug}` : `${baseUrl}/${s.slug}`;

  return SHELL(
    s.title,
    `<p class="muted"><a href="/app">&lsaquo; back</a></p>
<h1>${esc(s.title)}</h1>
<p class="muted"><a href="${esc(url)}">${esc(url)}</a></p>
<form method="post" action="/app/event/${esc(s.schedule_id)}">
<div class="card"><h2>What</h2>
  <label for="t">Title</label><input id="t" name="title" value="${esc(s.title)}" required>
  <label for="de">Description</label><input id="de" name="description" value="${esc(s.description ?? '')}" placeholder="What this meeting is for">
  <label for="du">Duration (minutes)</label><input id="du" name="duration_minutes" type="number" min="1" value="${s.duration_minutes}">
  <label for="co">Accent color</label><input id="co" name="color" value="${esc(s.color ?? '')}" placeholder="#1a56db" size="8">
</div>
<div class="card"><h2>Where</h2>
  <label for="lk">Location</label>
  <select id="lk" name="location_kind">${kindOptions}</select>
  <label for="lv">Details (address, phone note, or link)</label>
  <input id="lv" name="location_value" value="${esc(s.location_value ?? '')}" placeholder="Optional">
  <p class="notice">Google Meet needs the calendar connection's "add bookings to
    calendar" grant; the link is minted per booking.</p>
</div>
<div class="card"><h2>Who</h2>
  <label for="sk">Scheduling</label>
  <select id="sk" name="scheduling_kind">
    <option value="solo" ${s.scheduling_kind === 'solo' ? 'selected' : ''}>Just me</option>
    <option value="round_robin" ${s.scheduling_kind === 'round_robin' ? 'selected' : ''}>Round robin — one host per booking, rotated fairly</option>
    <option value="collective" ${s.scheduling_kind === 'collective' ? 'selected' : ''}>Collective — every host attends</option>
  </select>
  ${hostChoices.length
    ? `<p class="notice">Hosts (team events use each host's own hours and calendar):</p>
  ${hostChoices
    .map(
      (h) => `<label style="display:block;margin:.2rem 0">
    <input type="checkbox" name="host:${esc(h.owner_id)}" ${currentHosts.includes(h.owner_id) ? 'checked' : ''} style="width:auto"> ${esc(h.label)}</label>`,
    )
    .join('')}`
    : '<p class="notice">Create a team under /app/team to host with others.</p>'}
</div>
<div class="card"><h2>When</h2>
  <label for="av">Availability schedule</label>
  <select id="av" name="availability_set_id">${setOptions}</select>
  <label for="gr">Start-time spacing (minutes)</label><input id="gr" name="granularity_minutes" type="number" min="1" value="${s.granularity_minutes}">
  <label for="bb">Buffer before (minutes)</label><input id="bb" name="buffer_before_minutes" type="number" min="0" value="${s.buffer_before_minutes}">
  <label for="ba">Buffer after (minutes)</label><input id="ba" name="buffer_after_minutes" type="number" min="0" value="${s.buffer_after_minutes}">
  <label for="mn">Minimum notice (minutes)</label><input id="mn" name="minimum_notice_minutes" type="number" min="0" value="${s.minimum_notice_minutes}">
  <label for="mh">How far ahead people can book (days)</label><input id="mh" name="maximum_horizon_days" type="number" min="1" value="${s.maximum_horizon_days}">
  <label for="mb">Max bookings per day (blank = no limit)</label><input id="mb" name="max_bookings_per_day" type="number" min="1" value="${s.max_bookings_per_day ?? ''}">
  <label for="af">Only bookable from (date, optional)</label><input id="af" name="available_from" type="date" value="${esc(s.available_from ?? '')}">
  <label for="au">…until (date, optional)</label><input id="au" name="available_until" type="date" value="${esc(s.available_until ?? '')}">
</div>
<button class="submit" type="submit">Save event type</button>
</form>
<div class="card"><h2>Share</h2>
  <p class="muted"><a href="/app/event/${esc(s.schedule_id)}/snippet">Offer times in an email</a> —
    a paste-ready list of your next openings.</p>
  <p class="muted">Single-use links work exactly once, then die:</p>
  ${singleUseTokens.map((t) => `<p><code>${esc(baseUrl)}/s/${esc(t)}</code></p>`).join('')}
  <form method="post" action="/app/event/${esc(s.schedule_id)}/single-use">
    <button class="submit" type="submit">Create single-use link</button>
  </form>
  <p class="muted" style="margin-top:1rem">Embed on your own site:</p>
  <pre style="overflow-x:auto"><code>&lt;script src="${esc(baseUrl)}/embed.js" data-pumasi="/${esc(linkSlug ? `${linkSlug}/${s.slug}` : s.slug)}"&gt;&lt;/script&gt;</code></pre>
</div>
<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 select{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;
   background:transparent;color:var(--fg);font:inherit}
 code{font-size:.85em;background:var(--line);padding:.1em .3em;border-radius:.25rem}
</style>`,
  );
}

/** P2 — the owner's public landing page: their event types, nothing else. */
export function ownerLanding(
  displayName: string,
  linkSlug: string,
  events: { slug: string; title: string; duration_minutes: number; description?: string; color?: string }[],
  welcome?: string,
  brandColor?: string,
): string {
  const cards = events
    .map(
      (e) => `<a class="ev" href="/${esc(linkSlug)}/${esc(e.slug)}"
  ${e.color ? `style="border-left-color:${esc(e.color)}"` : ''}>
  <b>${esc(e.title)}</b>
  <span class="muted">${e.duration_minutes} min</span>
  ${e.description ? `<span class="muted">${esc(e.description)}</span>` : ''}
</a>`,
    )
    .join('');
  return SHELL(
    displayName,
    `${brandColor ? `<style>:root{--accent:${esc(brandColor)}}</style>` : ''}
<h1>${esc(displayName)}</h1>
<p class="muted">${welcome ? esc(welcome) : 'Pick a meeting to see available times.'}</p>
${cards || '<p class="muted">No booking pages yet.</p>'}
<style>
 .ev{display:flex;flex-direction:column;gap:.15rem;border:1px solid var(--line);
   border-left:3px solid var(--accent);border-radius:.4rem;padding:.8rem 1rem;
   margin:.6rem 0;text-decoration:none;color:var(--fg)}
 .ev:hover{border-color:var(--accent)}
</style>`,
  );
}

export interface ConnectionView {
  connection_id: string;
  provider: string;
  account_email: string;
  scope_level: 'freebusy' | 'events';
  status: 'active' | 'error';
  error_reason?: string;
  calendars: { calendar_id: string; name: string; check_conflicts: boolean; is_destination: boolean }[];
}

/** SPEC-0003 — the calendar section of the dashboard. */
function calendarSection(connections: ConnectionView[]): string {
  const rows = connections
    .map((c) => {
      const cals = c.calendars
        .map(
          (cal) => `<tr>
  <td><label><input type="checkbox" name="check:${esc(cal.calendar_id)}" ${cal.check_conflicts ? 'checked' : ''} style="width:auto"> ${esc(cal.name)}</label></td>
  <td><label><input type="radio" name="destination" value="${esc(cal.calendar_id)}" ${cal.is_destination ? 'checked' : ''} style="width:auto"> bookings land here</label></td>
</tr>`,
        )
        .join('');
      return `<div class="conn">
  <p><b>${esc(c.account_email)}</b> <span class="muted">(${esc(c.provider)})</span>
    ${c.status === 'error'
      ? `<span class="err-inline">needs attention: ${esc(c.error_reason ?? 'reconnect')}</span>`
      : c.scope_level === 'events'
        ? '<span class="muted">· checks conflicts and receives bookings</span>'
        : '<span class="muted">· checks conflicts only</span>'}</p>
  <form method="post" action="/app/calendar/${esc(c.connection_id)}/calendars">
    <table class="avail">${cals}</table>
    <button class="submit" type="submit">Save calendar choices</button>
  </form>
  ${c.scope_level !== 'events'
    ? `<form method="post" action="/app/calendar/${esc(c.provider)}/upgrade" style="display:inline">
    <input type="hidden" name="account" value="${esc(c.account_email)}">
    <button class="submit" type="submit">Also add bookings to this calendar</button></form>`
    : ''}
  <form method="post" action="/app/calendar/${esc(c.connection_id)}/delete" style="display:inline">
    <button class="linkish" type="submit">Disconnect (deletes what we hold)</button>
  </form>
</div>`;
    })
    .join('');

  return `<div class="card">
  <h2>Calendar</h2>
  <p class="muted">Connected calendars block their busy times from your booking
    pages. While a connection is broken, no times are offered — the service
    refuses rather than double-books.</p>
  ${rows || '<p class="muted">No calendar connected. Times are offered from your weekly hours alone.</p>'}
  <form method="post" action="/app/calendar/google/connect">
    <button class="submit" type="submit">Connect Google Calendar</button>
  </form>
</div>`;
}

export function ownerHome(
  owner: { display_name: string; email: string; timezone: string },
  schedules: ScheduleSummary[],
  baseUrl: string,
  notice?: string,
  connections?: ConnectionView[],
  sets?: { set_id: string; name: string }[],
  linkSlug?: string,
  setup?: { calendar: boolean; hours: boolean; event: boolean },
): string {
  const setupBanner =
    setup && !(setup.calendar && setup.hours && setup.event)
      ? `<div class="card" style="border-left:3px solid var(--accent)">
  <h2>Getting started</h2>
  <p>${setup.calendar ? '✓' : '○'} <a href="#cal-section">Connect your calendar</a>
    <span class="muted">— so busy times block your pages</span></p>
  <p>${setup.hours ? '✓' : '○'} Set your weekly hours
    <span class="muted">— in an availability schedule below</span></p>
  <p>${setup.event ? '✓' : '○'} Create your first booking page</p>
</div>`
      : '';
  const pageUrl = (slug: string) =>
    linkSlug ? `${baseUrl}/${linkSlug}/${slug}` : `${baseUrl}/${slug}`;
  const list = schedules
    .map(
      (s) => `<div class="card">
  <h2>${esc(s.title)} <a class="linkish" href="/app/event/${esc(s.schedule_id)}" style="font-size:.85rem">settings</a></h2>
  <p class="muted">${s.duration_minutes} min &middot;
    <a href="${esc(pageUrl(s.slug))}">${esc(pageUrl(s.slug))}</a>
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
<p class="muted"><a href="/app/meetings">Meetings</a> &middot; <a href="/app/contacts">Contacts</a> &middot; <a href="/app/team">Team</a> &middot; <a href="/app/routing">Routing</a> &middot; <a href="/app/polls">Polls</a> &middot; <a href="/app/settings">Settings</a></p>
${setupBanner}
${linkSlug ? `<p class="muted">Your page: <a href="${esc(baseUrl)}/${esc(linkSlug)}">${esc(baseUrl)}/${esc(linkSlug)}</a></p>` : ''}
${schedules.length === 0 ? '<p class="muted">No booking pages yet.</p>' : list}
<div class="card">
  <h2>Availability schedules</h2>
  <p class="muted">Named sets of hours; each event type follows one.</p>
  ${(sets ?? []).map((x) => `<p><a href="/app/availability/${esc(x.set_id)}">${esc(x.name)}</a></p>`).join('')}
  <form method="post" action="/app/availability">
    <label for="setname">New schedule</label>
    <input id="setname" name="name" placeholder="Working hours">
    <button class="submit" type="submit">Create</button>
  </form>
</div>
${connections ? calendarSection(connections) : ''}
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
 .conn{border-top:1px solid var(--line);padding-top:.75rem;margin-top:.75rem}
 .err-inline{color:#c33;font-size:.9rem}
</style>`,
  );
}
