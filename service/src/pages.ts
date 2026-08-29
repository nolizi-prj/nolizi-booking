/**
 * SPEC-0002 F2, F3, D9 — the booking page.
 *
 * The server renders UTC. The browser converts for display, in one place, and
 * submits the UTC value it was given. No converted value is ever sent back or
 * stored — that is the architecture the steward confirmed, and the hidden field
 * below is where it is kept honest.
 */

import type { Slot } from '@pumasi/booking-core';
import { locationText, type EventQuestion, type Schedule } from './schedules.ts';
import { renderLegalBody, LEGAL_STATUS_LINE, type LegalDoc } from './legal.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

// The product name. It belongs in the browser tab, where it identifies the tool
// without competing with the page's own heading -- a public booking page is the
// OWNER'S page, and their schedule title stays the largest thing on it.
const PRODUCT = 'Pumasi Booking';

/** D-105 · every public page carries the way to the privacy answers. */
export const FOOTER = `<footer class="foot">
  <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot;
  <a href="/subprocessors">Who sees data</a>
</footer>
<style>
 .foot{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);
   font-size:.8rem;color:var(--muted)}
 .foot a{color:var(--muted)}
</style>`;

/** D-105 · the published documents, rendered from one source (legal.ts). */
export function legalPage(doc: LegalDoc): string {
  return SHELL(
    doc.title,
    `<p class="muted"><a href="/">&lsaquo; ${esc(PRODUCT)}</a></p>
<h1>${esc(doc.title)}</h1>
<p class="muted">${esc(LEGAL_STATUS_LINE)}</p>
<div class="legal">${renderLegalBody(doc.body)}</div>
${FOOTER}
<style>
 .legal{max-width:42rem}
 .legal h2{font-size:1.05rem;margin:1.75rem 0 .4rem}
 .legal p{margin:.6rem 0}
 .legal ul{margin:.5rem 0;padding-left:1.25rem}
 .legal li{margin:.35rem 0}
</style>`,
  );
}

/**
 * The design system.
 *
 * One stylesheet serves every page, so a token changed here changes the whole
 * product. Structure follows what the category has taught people to expect: a
 * persistent left rail for the signed-in application, a centred column for
 * public pages. Owner pages opt into the rail by starting their body with a
 * `<!--nav:key-->` sentinel, which keeps each page function's own markup about
 * its own content.
 *
 * Constraints that outrank prettiness: the booking page still works with
 * JavaScript off, colour is never the only signal, focus is always visible,
 * and an owner's brand colour can override the accent without breaking
 * contrast elsewhere.
 */
const NAV: { key: string; href: string; label: string; icon: string }[] = [
  { key: 'scheduling', href: '/app', label: 'Event types', icon: 'M4 5h16M4 12h16M4 19h10' },
  { key: 'meetings', href: '/app/meetings', label: 'Meetings', icon: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
  { key: 'contacts', href: '/app/contacts', label: 'Contacts', icon: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
  { key: 'team', href: '/app/team', label: 'Team', icon: 'M9 11a3 3 0 100-6 3 3 0 000 6zM2 20a7 7 0 0114 0M17 11a3 3 0 100-6M22 20a7 7 0 00-4-6.3' },
  { key: 'routing', href: '/app/routing', label: 'Routing', icon: 'M6 3v6a3 3 0 003 3h9M18 8l3 4-3 4M6 12v9' },
  { key: 'polls', href: '/app/polls', label: 'Polls', icon: 'M6 20V10M12 20V4M18 20v-6' },
  { key: 'workflows', href: '/app/workflows', label: 'Workflows', icon: 'M5 7a2 2 0 100-4 2 2 0 000 4zM5 21a2 2 0 100-4 2 2 0 000 4zM19 14a2 2 0 100-4 2 2 0 000 4zM7 5h6a4 4 0 014 4v1M7 19h6a4 4 0 004-4' },
  { key: 'webhooks', href: '/app/webhooks', label: 'Webhooks', icon: 'M10 8a4 4 0 116 3.5M8 13a4 4 0 105 5M12 12l3 6M12 12l-5 2' },
  { key: 'api', href: '/app/api-keys', label: 'API keys', icon: 'M14 7a4 4 0 11-3.5 6H8v3H5v-3H3l3.5-3.5A4 4 0 0114 7z' },
  { key: 'analytics', href: '/app/analytics', label: 'Analytics', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
  { key: 'audit', href: '/app/audit', label: 'Audit log', icon: 'M9 5h9a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V8M9 5V3h6v2M8 12h8M8 16h5' },
  { key: 'settings', href: '/app/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L6 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h4l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5a7 7 0 00.2-1z' },
];

const icon = (d: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

const sidebar = (active: string): string => `<a class="skip" href="#main">Skip to content</a>
<nav class="rail" aria-label="Sections">
  <a class="brand" href="/app">${esc(PRODUCT)}</a>
  <ul>
    ${NAV.map((n) => `<li><a href="${n.href}" class="${n.key === active ? 'on' : ''}"
      ${n.key === active ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a></li>`).join('')}
  </ul>
  <form method="post" action="/logout" class="railout">
    <button type="submit">${icon('M15 12H3m0 0l4-4m-4 4l4 4M13 4h6a1 1 0 011 1v14a1 1 0 01-1 1h-6')}<span>Sign out</span></button>
  </form>
</nav>`;

const SHELL = (title: string, rawBody: string): string => {
  const m = rawBody.match(/^\s*<!--nav:([a-z-]+)-->/);
  const body = m ? rawBody.replace(m[0], '') : rawBody;
  const inner = m
    ? `<div class="app">${sidebar(m[1]!)}<main id="main" class="main">${body}</main></div>`
    : `<main id="main" class="page">${body}</main>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === PRODUCT ? PRODUCT : `${esc(title)} &middot; ${PRODUCT}`}</title>
<style>
 :root{color-scheme:light dark;
   --bg:#fff;--surface:#fff;--rail:#f7f8fa;--fg:#101828;--muted:#667085;
   --line:#e4e7ec;--line-soft:#f0f2f5;--accent:#1a56db;--accent-soft:#eef2ff;
   --danger:#b42318;--ok:#067647;--radius:10px;
   --shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.04)}
 @media(prefers-color-scheme:dark){:root{
   --bg:#0f1117;--surface:#161922;--rail:#12141b;--fg:#e7eaf0;--muted:#98a2b3;
   --line:#262b36;--line-soft:#1c2029;--accent:#7aa2f7;--accent-soft:#1b2440;
   --danger:#f97066;--ok:#6fcf97;--shadow:none}}
 *{box-sizing:border-box}
 html{-webkit-text-size-adjust:100%}
 body{margin:0;background:var(--bg);color:var(--fg);
   font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
   -webkit-font-smoothing:antialiased}
 .page{max-width:40rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
 h1{font-size:1.55rem;line-height:1.25;letter-spacing:-.01em;margin:0 0 .35rem;font-weight:650}
 h2{font-size:1.02rem;margin:0 0 .3rem;font-weight:620}
 a{color:var(--accent)} a:hover{text-decoration:underline}
 .muted{color:var(--muted);font-size:.9rem}
 p{margin:.55rem 0}
 :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
 .skip{position:absolute;left:-999px}
 .skip:focus{left:.5rem;top:.5rem;background:var(--surface);padding:.5rem .75rem;
   border:1px solid var(--line);border-radius:8px;z-index:10}

 /* application shell */
 .app{display:grid;grid-template-columns:15rem minmax(0,1fr);min-height:100vh}
 .rail{background:var(--rail);border-right:1px solid var(--line);
   display:flex;flex-direction:column;padding:1.1rem .75rem;gap:.15rem;position:sticky;top:0;height:100vh}
 .brand{font-weight:680;letter-spacing:-.01em;color:var(--fg);text-decoration:none;
   padding:.25rem .5rem 1rem;font-size:1.02rem}
 .brand:hover{text-decoration:none}
 .rail ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
 .rail a,.railout button{display:flex;align-items:center;gap:.6rem;width:100%;
   padding:.5rem .6rem;border-radius:8px;color:var(--fg);text-decoration:none;
   font:inherit;font-size:.92rem;background:none;border:0;cursor:pointer;text-align:left}
 .rail a:hover,.railout button:hover{background:var(--line-soft);text-decoration:none}
 .rail a.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
 .rail svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;
   stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
 .railout{margin-top:auto;padding-top:.5rem;border-top:1px solid var(--line)}
 .main{padding:2rem 2rem 4rem;max-width:56rem}
 @media(max-width:52rem){
   .app{grid-template-columns:1fr}
   .rail{position:static;height:auto;flex-direction:row;flex-wrap:wrap;align-items:center;
     border-right:0;border-bottom:1px solid var(--line);padding:.6rem}
   .brand{padding:.25rem .5rem;width:100%}
   .rail ul{flex-direction:row;flex-wrap:wrap}
   .rail a span,.railout button span{font-size:.85rem}
   .railout{margin:0;border:0;padding:0}
   .main{padding:1.25rem 1rem 3rem}
 }

 /* surfaces */
 .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);
   padding:1.1rem 1.2rem;margin:1rem 0;box-shadow:var(--shadow)}
 .card h2{font-size:1.02rem;margin:0 0 .3rem}
 .ev{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);
   border-radius:var(--radius);padding:1rem 1.15rem;margin:.75rem 0;box-shadow:var(--shadow)}
 .ev h2{margin:0 0 .2rem}
 .row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
 .spread{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap}
 .pill{display:inline-block;font-size:.74rem;font-weight:600;letter-spacing:.01em;
   border:1px solid var(--line);border-radius:999px;padding:.15rem .55rem;color:var(--muted)}
 .navrow{display:flex;gap:.85rem;align-items:center;margin:.25rem 0 1.25rem;flex-wrap:wrap}

 /* controls */
 label{display:block;margin:.8rem 0 .3rem;font-size:.88rem;font-weight:550;color:var(--fg)}
 input,select,textarea{width:100%;padding:.55rem .7rem;border:1px solid var(--line);
   border-radius:8px;background:var(--surface);color:var(--fg);font:inherit;font-size:.94rem}
 input:hover,select:hover{border-color:var(--muted)}
 input[type=checkbox],input[type=radio]{width:auto;accent-color:var(--accent)}
 .submit{margin-top:1rem;padding:.55rem 1.05rem;border:0;border-radius:8px;
   background:var(--accent);color:#fff;font:inherit;font-weight:600;font-size:.92rem;cursor:pointer}
 .submit:hover{filter:brightness(1.07)}
 .linkish{background:none;border:0;color:var(--accent);font:inherit;font-size:.88rem;
   cursor:pointer;padding:0}
 .linkish:hover{text-decoration:underline}
 .notice{font-size:.82rem;color:var(--muted);margin-top:.4rem}
 code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;
   background:var(--line-soft);padding:.12em .38em;border-radius:5px;word-break:break-all}

 /* slots and calendar */
 .day{margin:1.25rem 0 .5rem;font-weight:620;font-size:.94rem}
 .slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(6.5rem,1fr));gap:.5rem}
 button.slot{padding:.6rem;border:1px solid var(--line);border-radius:8px;
   background:var(--surface);color:var(--accent);font:inherit;font-weight:600;
   font-size:.9rem;cursor:pointer}
 button.slot:hover{border-color:var(--accent);background:var(--accent-soft)}
 button.slot[aria-pressed=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
 form{margin-top:1.25rem} .js form:not(.on){display:none}

 /* tables and states */
 table.rows{border-collapse:collapse;width:100%}
 table.rows td,table.rows th{padding:.5rem .6rem;border-bottom:1px solid var(--line);
   text-align:left;font-size:.9rem}
 table.rows th{color:var(--muted);font-weight:600;font-size:.78rem;text-transform:uppercase;
   letter-spacing:.04em}
 .err{border-left:3px solid var(--danger);background:var(--line-soft);
   padding:.6rem .8rem;margin:1rem 0;border-radius:0 8px 8px 0}
 .ok{border-left:3px solid var(--ok);background:var(--line-soft);
   padding:.6rem .8rem;margin:1rem 0;border-radius:0 8px 8px 0}
</style></head><body>${inner}</body></html>`;
};

export function bookingPage(
  schedule: Schedule,
  slots: Slot[],
  opts: {
    error?: string; csrf?: string; action?: string; recurrence?: string;
    questions?: EventQuestion[];
    /** What the booker already typed, so a failed submit does not lose it. */
    answers?: Record<string, string>;
    /** The owner's logo, as a data URL. */
    logo?: string;
  } = {},
): string {
  const err = opts.error ? `<p class="err">${esc(opts.error)}</p>` : '';
  const qs = opts.questions ?? [];
  const prior = opts.answers ?? {};
  // Built as one string rather than interpolated inline, so the no-questions
  // wording stays byte-identical to what it has always been.
  const collectsLine = qs.length
    ? 'We store your name, email, your answers above and the meeting time so the '
      + 'organiser can meet you. Nobody else sees them. The questions above were '
      + 'written by the organiser, who decides what they are for. The confirmation '
      + 'email has a link that cancels the booking and deletes these details.'
    : 'We store your name, email and the meeting time so the organiser can meet '
      + 'you. Nobody else sees them. The confirmation email has a link that '
      + 'cancels the booking and deletes these details.';
  const questionFields = qs
    .map((q) => {
      const id = `q_${esc(q.question_id)}`;
      const name = `q:${esc(q.question_id)}`;
      const was = prior[q.question_id] ?? '';
      const req = q.required ? ' required' : '';
      const label = `<label for="${id}">${esc(q.label)}${q.required ? '' : ' <span class="muted">(optional)</span>'}</label>`;
      if (q.kind === 'textarea') {
        return `${label}<textarea id="${id}" name="${name}"${req} rows="3">${esc(was)}</textarea>`;
      }
      if (q.kind === 'select' && q.options.length > 0) {
        const opts2 = q.options
          .map((o) => `<option${o === was ? ' selected' : ''}>${esc(o)}</option>`)
          .join('');
        return `${label}<select id="${id}" name="${name}"${req}>
          <option value="">Choose…</option>${opts2}</select>`;
      }
      return `${label}<input id="${id}" name="${name}" value="${esc(was)}"${req}>`;
    })
    .join('\n  ');
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
  ${opts.logo ? `<p style="margin:0 0 .6rem"><img src="${esc(opts.logo)}" alt="" class="brandlogo"></p>` : ''}
  ${schedule.owner_name ? `<p class="muted" style="margin:0 0 .2rem">${esc(schedule.owner_name)}</p>` : ''}
  <h1>${esc(schedule.title)}</h1>
  <p class="muted">${schedule.duration_minutes} minutes${where ? ` &middot; ${esc(where)}` : ''}</p>
  ${schedule.description ? `<p>${esc(schedule.description)}</p>` : ''}
  ${opts.recurrence ? `<p class="muted">Repeats ${esc(opts.recurrence)}</p>` : ''}
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
  ${questionFields}
  <!-- D9 · told at the point of collection, next to the field, not behind a link.
       The wording tracks what is actually collected: with questions of the
       organiser's own on the page, a sentence naming only the name and email
       would be false, and a false privacy line is worse than none. With no
       questions the sentence is unchanged, word for word, from before they
       existed — so the promise this page has always made still reads exactly
       the same to everyone it was already made to. -->
  <p class="notice">${collectsLine} <a href="/privacy">What we keep</a>.</p>
  <input type="hidden" name="booker_tz" id="btz">
  ${opts.recurrence ? `<label style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.9rem">
    <input type="checkbox" name="repeat" checked>
    <span>Book the whole series — ${esc(opts.recurrence)}</span></label>` : ''}
  <button class="submit" type="submit">Confirm booking</button>
</form>
</div></div>
${FOOTER}
<style>
 .book-grid{display:grid;grid-template-columns:1fr;gap:0;background:var(--surface);
   border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
 @media(min-width:46rem){.book-grid{grid-template-columns:17.5rem minmax(0,1fr)}}
 .brandlogo{max-height:2.75rem;max-width:100%}
 .book-meta{padding:1.5rem;border-bottom:1px solid var(--line)}
 @media(min-width:46rem){.book-meta{border-bottom:0;border-right:1px solid var(--line);
   background:var(--rail);height:100%}}
 .book-pick{padding:1.5rem}
 .cal-head{display:flex;align-items:center;justify-content:space-between;margin:.5rem 0}
 .navbtn{border:1px solid var(--line);background:transparent;color:var(--fg);
   border-radius:.4rem;padding:.2rem .7rem;font:inherit;cursor:pointer}
 .cal-dow,.cal-days{display:grid;grid-template-columns:repeat(7,1fr);gap:.2rem}
 .cal-dow{font-size:.7rem;color:var(--muted);text-transform:uppercase;text-align:center}
 .cal-days button{aspect-ratio:1;border:0;border-radius:50%;background:transparent;
   color:var(--fg);font:inherit;cursor:pointer}
 .cal-days button:disabled{color:var(--muted);opacity:.35;cursor:default}
 .cal-days button.has{background:var(--accent-soft);color:var(--accent);font-weight:650}
 .cal-days button.has:hover{background:var(--accent);color:#fff}
 .cal-days button[aria-pressed=true]{background:var(--accent);color:#fff}
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
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d){ var c=document.createElement('div'); c.textContent=d; dow.appendChild(c); });

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
Accounts are invite-only while the service stays small.</p>
${FOOTER}`,
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
  logo?: string,
): string {
  return SHELL(
    'Settings',
    `<!--nav:settings-->
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
  <label for="lf">Logo</label>
  ${logo ? `<p><img src="${esc(logo)}" alt="Your logo" class="logopv"></p>
    <label style="display:flex;gap:.5rem;align-items:center">
      <input type="checkbox" name="remove_logo" style="width:auto"> Remove it</label>` : ''}
  <input id="lf" type="file" accept="image/png,image/jpeg,image/webp">
  <input type="hidden" name="logo" id="logodata">
  <p class="notice" id="logonote">Shown above your booking pages. It is resized
    to 240 pixels before it leaves your computer. Choosing a file needs
    JavaScript; everything else on this page works without it.</p>
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
<div class="card risk">
  <h2>Your account</h2>
  <p class="muted">Deleting removes your account, your booking pages, and every
    booking on them — including the names and email addresses of people who
    booked with you. It cannot be undone.</p>
  <form method="post" action="/app/delete">
    <label><input type="checkbox" name="confirm" value="yes" required style="width:auto">
      I understand this deletes everything, permanently</label>
    <button class="danger" type="submit">Delete my account</button>
  </form>
</div>

<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 .logopv{max-height:4rem;border:1px solid var(--line);border-radius:.4rem;padding:.3rem;
   background:var(--surface)}
 /* The only destructive control in the product. It must not wear the same
    blue as Create: colour is the fastest signal a person reads, and the
    token existed while nothing used it. */
 .card.risk{border-color:var(--danger)}
 .danger{background:var(--danger);color:#fff;border:1px solid var(--danger);
   border-radius:var(--radius);padding:.55rem .9rem;font:inherit;font-weight:600;cursor:pointer}
 .danger:hover{filter:brightness(.94)}
</style>
<script>
// The resize is a courtesy to the owner, not a control: the server checks the
// media type, the signature and the size of whatever actually arrives.
(function () {
  var file = document.getElementById('lf');
  var out = document.getElementById('logodata');
  var note = document.getElementById('logonote');
  if (!file || !out) return;
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) { out.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 240;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out.value = c.toDataURL('image/png');
        if (note) note.textContent = 'Ready to save: ' + c.width + '\u00d7' + c.height + '.';
      };
      img.onerror = function () {
        if (note) note.textContent = 'That file could not be read as an image.';
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  });
})();
</script>`,
  );
}

export interface ScheduleSummary {
  schedule_id: string;
  slug: string;
  title: string;
  duration_minutes: number;
  rules: { weekday: string; start: string; end: string }[];
  upcoming: number;
  /** The event type's accent, shown as the card's rail. */
  color?: string;
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
    answers?: { label: string; answer: string }[];
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
  ${(m.answers ?? []).length > 0 ? `<dl class="answers">${(m.answers ?? [])
      .map((a) => `<dt>${esc(a.label)}</dt><dd>${esc(a.answer)}</dd>`).join('')}</dl>` : ''}
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
    `<!--nav:meetings-->
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

/** P3 — contacts accreted from bookings, with exclusions and blocks. */
export function contactsPage(
  contacts: { email: string; name: string; times_booked: number; last_booked_at: string }[],
  exclusions: string[],
  blocks: { pattern: string; note: string }[] = [],
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
  const bl = blocks
    .map(
      (b) => `<tr><td>${esc(b.pattern)}</td><td class="muted">${esc(b.note)}</td>
  <td><form method="post" action="/app/contacts/blocks" style="margin:0">
    <input type="hidden" name="remove" value="${esc(b.pattern)}">
    <button class="linkish" type="submit">unblock</button></form></td></tr>`,
    )
    .join('');
  return SHELL(
    'Contacts',
    `<!--nav:contacts-->
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
<div class="card">
  <h2>Blocked from booking</h2>
  <p class="muted">Addresses or whole domains that cannot book you at all. They
    are told the page is not taking bookings from their address — not who
    blocked them. This is separate from exclusions above: excluding someone
    keeps them out of your contacts, it does not stop them booking.</p>
  ${bl ? `<table class="rows"><tr><th>Address or domain</th><th>Note</th><th></th></tr>${bl}</table>` : ''}
  <form method="post" action="/app/contacts/blocks">
    <input name="pattern" placeholder="person@company.com or company.com">
    <input name="note" placeholder="Note for yourself (optional)">
    <button class="submit" type="submit">Block</button>
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
    `<!--nav:scheduling-->
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
    `<!--nav:scheduling-->
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
/** P7 — workflows: booking-lifecycle automations. */
export function workflowsPage(
  flows: {
    workflow_id: string; title: string; trigger: string; offset_minutes: number;
    recipient: string; subject: string;
  }[],
): string {
  const label = (t: string, o: number) =>
    t === 'before_event' ? `${o} min before the meeting`
    : t === 'after_event' ? `${o} min after the meeting`
    : t.replace('booking_', 'when a booking is ').replace('_', ' ');
  const list = flows
    .map(
      (w) => `<div class="card">
  <h2>${esc(w.title)}</h2>
  <p class="muted">${esc(label(w.trigger, w.offset_minutes))} → email the ${esc(w.recipient)}:
    “${esc(w.subject)}”</p>
  <form method="post" action="/app/workflows/delete">
    <input type="hidden" name="id" value="${esc(w.workflow_id)}">
    <button class="linkish" type="submit">delete</button>
  </form>
</div>`,
    )
    .join('');
  return SHELL(
    'Workflows',
    `<!--nav:workflows-->
<h1>Workflows</h1>
<p class="muted">Emails that send themselves around the booking's life. Templates
  may use {{name}}, {{title}}, {{start}}, {{end}}, {{location}}.</p>
${list || '<p class="muted">No workflows yet.</p>'}
<div class="card">
  <h2>New workflow</h2>
  <form method="post" action="/app/workflows">
    <label for="wt">Name</label><input id="wt" name="title" required placeholder="Reminder">
    <label for="wg">When</label>
    <select id="wg" name="trigger">
      <option value="before_event">Before the meeting</option>
      <option value="after_event">After the meeting</option>
      <option value="booking_created">When a booking is created</option>
      <option value="booking_cancelled">When a booking is cancelled</option>
      <option value="booking_rescheduled">When a booking is rescheduled</option>
    </select>
    <label for="wo">Offset (minutes, for before/after)</label>
    <input id="wo" name="offset_minutes" type="number" min="0" value="60">
    <label for="wr">Send to</label>
    <select id="wr" name="recipient">
      <option value="booker">The booker</option>
      <option value="owner">Me</option>
    </select>
    <label for="ws">Subject</label>
    <input id="ws" name="subject" value="Reminder: {{title}} at {{start}}">
    <label for="wb">Body</label>
    <input id="wb" name="body" value="Hi {{name}}, see you at {{start}}. {{location}}">
    <button class="submit" type="submit">Create workflow</button>
  </form>
</div>
${CARD_CSS}
<style>select{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;background:transparent;color:var(--fg);font:inherit}</style>`,
  );
}

/** P7 — outbound webhooks (a Slack incoming-webhook URL works directly). */
export function webhooksPage(
  hooks: { webhook_id: string; url: string; secret: string; format: string }[],
): string {
  const list = hooks
    .map(
      (h) => `<div class="card">
  <p><code>${esc(h.url.slice(0, 70))}</code> <span class="pill">${esc(h.format)}</span></p>
  <p class="muted">Signing secret: <code>${esc(h.secret)}</code> — verify
    X-Pumasi-Signature (HMAC-SHA256 of the body, hex).</p>
  <form method="post" action="/app/webhooks/delete">
    <input type="hidden" name="id" value="${esc(h.webhook_id)}">
    <button class="linkish" type="submit">delete</button>
  </form>
</div>`,
    )
    .join('');
  return SHELL(
    'Webhooks',
    `<!--nav:webhooks-->
<h1>Webhooks</h1>
<p class="muted">Booking events, delivered as signed JSON POSTs with retries.
  Pick the Slack format to paste a Slack incoming-webhook URL directly.</p>
${list || '<p class="muted">No webhooks yet.</p>'}
<div class="card">
  <h2>New webhook</h2>
  <form method="post" action="/app/webhooks">
    <label for="hu">URL</label><input id="hu" name="url" type="url" required placeholder="https://…">
    <label for="hf">Format</label>
    <select id="hf" name="format">
      <option value="json">JSON (event + data)</option>
      <option value="slack">Slack message</option>
    </select>
    <button class="submit" type="submit">Add webhook</button>
  </form>
</div>
${CARD_CSS}
<style>code{font-size:.85em;background:var(--line);padding:.1em .3em;border-radius:.25rem}
select{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;background:transparent;color:var(--fg);font:inherit}</style>`,
  );
}

/** P7 — API keys: shown once, stored as digests. */
export function apiKeysPage(
  keys: { key_hash: string; name: string; created_at: string }[],
  baseUrl: string,
  freshKey?: string,
): string {
  const list = keys
    .map(
      (k) => `<p>${esc(k.name)} <span class="muted">· ${esc(k.created_at)}</span>
  <form method="post" action="/app/api-keys/delete" style="display:inline">
    <input type="hidden" name="hash" value="${esc(k.key_hash)}">
    <button class="linkish" type="submit">revoke</button></form></p>`,
    )
    .join('');
  return SHELL(
    'API keys',
    `<!--nav:api-->
<h1>API</h1>
${freshKey
    ? `<p class="ok">Your new key — copy it now, it is not shown again:<br><code>${esc(freshKey)}</code></p>`
    : ''}
<p class="muted">Send it as <code>Authorization: Bearer &lt;key&gt;</code>. Endpoints:
  GET ${esc(baseUrl)}/api/v1/event-types · GET /api/v1/slots?event_type=&lt;slug&gt; ·
  GET /api/v1/bookings · POST /api/v1/bookings (form fields event_type, start, end,
  name, email) · POST /api/v1/bookings/&lt;id&gt;/cancel</p>
${list || '<p class="muted">No keys yet.</p>'}
<div class="card">
  <h2>New key</h2>
  <form method="post" action="/app/api-keys">
    <label for="kn">Name</label><input id="kn" name="name" placeholder="Zapier">
    <button class="submit" type="submit">Create key</button>
  </form>
</div>
${CARD_CSS}
<style>code{font-size:.85em;background:var(--line);padding:.1em .3em;border-radius:.25rem;word-break:break-all}</style>`,
  );
}

/** P8 — the audit trail, newest first. */
export function auditPage(
  events: { actor: string; action: string; detail: string; at: string }[],
): string {
  const rows = events
    .map(
      (e) => `<tr><td><time datetime="${esc(e.at)}" class="lt">${esc(e.at.slice(0, 16))}</time></td>
  <td>${esc(e.actor)}</td><td>${esc(e.action.replace(/_/g, ' '))}</td>
  <td class="muted">${esc(e.detail)}</td></tr>`,
    )
    .join('');
  return SHELL(
    'Audit log',
    `<!--nav:audit-->
<h1>Audit log</h1>
<p class="muted">Sign-ins and administrative changes on your account and the
  teams you administer.</p>
${rows ? `<table class="rows"><tr><th>When</th><th>Who</th><th>What</th><th></th></tr>${rows}</table>`
       : '<p class="muted">Nothing yet.</p>'}
${CARD_CSS}
<script>document.querySelectorAll('time.lt').forEach(function(t){
  t.textContent = new Date(t.getAttribute('datetime')).toLocaleString();
});</script>`,
  );
}

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
    `<!--nav:routing-->
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
    `<!--nav:polls-->
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
    `<!--nav:polls-->
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
  ssoByOrg: Map<string, { issuer: string; email_domain?: string }> = new Map(),
  freshScimToken?: string,
  mintedInvite?: string,
): string {
  const ssoSection = (o: { org_id: string; my_role: string }): string => {
    if (o.my_role !== 'admin') return '';
    const sso = ssoByOrg.get(o.org_id);
    return `<details style="margin-top:.75rem"><summary class="muted">Single sign-on (OIDC) &amp; SCIM</summary>
  ${sso
    ? `<p class="muted">IdP: <code>${esc(sso.issuer)}</code>${sso.email_domain ? ` · domain ${esc(sso.email_domain)} is steered here at login` : ''}<br>
    Sign-in URL: <code>${esc(baseUrl)}/login/sso/${esc(o.org_id)}</code> ·
    SCIM base: <code>${esc(baseUrl)}/scim/v2</code></p>
    <form method="post" action="/app/team/${esc(o.org_id)}/sso" style="display:inline">
      <input type="hidden" name="remove" value="1">
      <button class="linkish" type="submit">remove SSO</button></form>`
    : ''}
  <form method="post" action="/app/team/${esc(o.org_id)}/sso">
    <label>Issuer URL <input name="issuer" placeholder="https://login.example.com" required></label>
    <label>Client ID <input name="client_id" required></label>
    <label>Client secret <input name="client_secret" required></label>
    <label>Email domain (optional) <input name="email_domain" placeholder="example.com"></label>
    <p class="notice">Redirect URI for your IdP: <code>${esc(baseUrl)}/oauth/oidc/callback</code>.
      Saving (re)generates the SCIM token, shown once.</p>
    <button class="submit" type="submit">${sso ? 'Update' : 'Enable'} SSO</button>
  </form>
</details>`;
  };
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
  ${ssoSection(o)}
</div>`,
    )
    .join('');
  return SHELL(
    'Team',
    `<!--nav:team-->
<h1>Team</h1>
${freshScimToken
    ? `<p class="ok">SCIM bearer token — copy it now, it is not shown again:<br>
  <code>${esc(freshScimToken)}</code></p>` : ''}
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
  ${mintedInvite
    ? `<p class="ok">New invite — copy it now:<br><code>${esc(baseUrl)}/signup?invite=${esc(mintedInvite)}</code></p>`
    : ''}
  ${openInvites.map((c) => `<p><code>${esc(baseUrl)}/signup?invite=${esc(c)}</code></p>`).join('')}
  <form method="post" action="/app/invites" style="display:inline">
    <input type="hidden" name="kind" value="org">
    <button class="submit" type="submit">Invite a teammate</button>
  </form>
  <form method="post" action="/app/invites" style="display:inline">
    <input type="hidden" name="kind" value="platform">
    <button class="submit" type="submit">Invite a new company</button>
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
  questions: EventQuestion[] = [],
): string {
  const questionRows = questions
    .map(
      (q) => `<tr><td>${esc(q.label)}</td>
  <td class="muted">${esc(q.kind)}${q.required ? ' · required' : ''}</td>
  <td><form method="post" action="/app/event/${esc(s.schedule_id)}/questions" style="margin:0">
    <input type="hidden" name="remove" value="${esc(q.question_id)}">
    <button class="linkish" type="submit">remove</button></form></td></tr>`,
    )
    .join('');
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
    `<!--nav:scheduling-->
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
  <label for="rr">Repeats (RFC 5545 rule, blank = single meetings)</label>
  <input id="rr" name="recurrence_rule" value="${esc(s.recurrence_rule ?? '')}"
    placeholder="FREQ=WEEKLY;COUNT=4">
  <p class="notice">A booker may take the whole series in one go; it is booked
    all-or-nothing and cancels as one. Up to 12 occurrences.</p>
  <label style="display:flex;gap:.5rem;align-items:center">
    <input type="checkbox" name="require_email_verification" style="width:auto"
      ${s.require_email_verification ? 'checked' : ''}>
    Make bookers confirm their email address first</label>
  <p class="notice">They get a link that confirms the booking. The time is not
    held while they do, so it may go to someone else — holding it would let
    anyone fill your calendar with addresses they do not own.</p>
  <label for="av">Availability schedule</label>
  <select id="av" name="availability_set_id">${setOptions}</select>
  <label for="gr">Start-time spacing (minutes)</label><input id="gr" name="granularity_minutes" type="number" min="1" value="${s.granularity_minutes}">
  <label for="bb">Buffer before (minutes)</label><input id="bb" name="buffer_before_minutes" type="number" min="0" value="${s.buffer_before_minutes}">
  <label for="ba">Buffer after (minutes)</label><input id="ba" name="buffer_after_minutes" type="number" min="0" value="${s.buffer_after_minutes}">
  <label for="mn">Minimum notice (minutes)</label><input id="mn" name="minimum_notice_minutes" type="number" min="0" value="${s.minimum_notice_minutes}">
  <label for="mh">How far ahead people can book (days)</label><input id="mh" name="maximum_horizon_days" type="number" min="1" value="${s.maximum_horizon_days}">
  <label for="mb">Max bookings per day (blank = no limit)</label><input id="mb" name="max_bookings_per_day" type="number" min="1" value="${s.max_bookings_per_day ?? ''}">
  <label for="mbw">Max bookings per week</label><input id="mbw" name="max_bookings_per_week" type="number" min="1" value="${s.max_bookings_per_week ?? ''}">
  <label for="mbm">Max bookings per month</label><input id="mbm" name="max_bookings_per_month" type="number" min="1" value="${s.max_bookings_per_month ?? ''}">
  <label for="mmd">Max booked minutes per day</label><input id="mmd" name="max_minutes_per_day" type="number" min="1" value="${s.max_minutes_per_day ?? ''}">
  <label for="mmw">Max booked minutes per week</label><input id="mmw" name="max_minutes_per_week" type="number" min="1" value="${s.max_minutes_per_week ?? ''}">
  <p class="notice">Limits are counted across every booking page you own, in your
    own timezone, and a time is refused when taking it would cross the limit.</p>
  <label for="af">Only bookable from (date, optional)</label><input id="af" name="available_from" type="date" value="${esc(s.available_from ?? '')}">
  <label for="au">…until (date, optional)</label><input id="au" name="available_until" type="date" value="${esc(s.available_until ?? '')}">
</div>
<button class="submit" type="submit">Save event type</button>
</form>
<!-- Its own form, not part of the settings form above: a half-typed question
     must not be lost when the owner saves an unrelated setting, and HTML has
     no nested forms. -->
<div class="card"><h2>Questions you ask</h2>
  <p class="muted">Asked on the booking page, under name and email. You choose
    what these collect and what you use it for; bookers are told that the
    questions are yours. Answers are deleted when the booking is.</p>
  ${questionRows ? `<table class="rows"><tr><th>Question</th><th>Type</th><th></th></tr>${questionRows}</table>` : '<p class="muted">No questions — bookers give a name and email only.</p>'}
  <form method="post" action="/app/event/${esc(s.schedule_id)}/questions">
    <label for="ql">Question</label>
    <input id="ql" name="label" placeholder="What would you like to cover?" required>
    <label for="qk">Answer type</label>
    <select id="qk" name="kind">
      <option value="text">One line</option>
      <option value="textarea">Several lines</option>
      <option value="select">Pick from a list</option>
    </select>
    <label for="qo">Choices, one per line (only for a list)</label>
    <textarea id="qo" name="options" rows="3"></textarea>
    <label style="display:flex;gap:.5rem;align-items:center">
      <input type="checkbox" name="required" style="width:auto"> Must be answered</label>
    <button class="submit" type="submit">Add question</button>
  </form>
</div>
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
  logo?: string,
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
${logo ? `<p style="margin:0 0 .75rem"><img src="${esc(logo)}" alt="" style="max-height:3.5rem;max-width:100%"></p>` : ''}
<h1>${esc(displayName)}</h1>
<p class="muted">${welcome ? esc(welcome) : 'Pick a meeting to see available times.'}</p>
<div class="evlist">${cards || '<p class="muted">No booking pages yet.</p>'}</div>
${FOOTER}
<style>
 .ev{display:flex;flex-direction:column;gap:.15rem;text-decoration:none;color:var(--fg);
   transition:border-color .12s ease,transform .12s ease}
 .ev:hover{border-color:var(--accent);text-decoration:none;transform:translateY(-1px)}
 .ev b{font-size:1rem}
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
  <form method="post" action="/app/calendar/google/connect" style="display:inline">
    <button class="submit" type="submit">Connect Google Calendar</button>
  </form>
  <form method="post" action="/app/calendar/microsoft/connect" style="display:inline">
    <button class="submit" type="submit">Connect Microsoft 365 / Outlook</button>
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
      (s) => `<div class="ev" ${s.color ? `style="border-left-color:${esc(s.color)}"` : ''}>
  <div class="spread">
    <div>
      <h2>${esc(s.title)}</h2>
      <p class="muted">${s.duration_minutes} min &middot; ${s.upcoming} upcoming</p>
      <p class="muted"><a href="${esc(pageUrl(s.slug))}">${esc(pageUrl(s.slug))}</a></p>
    </div>
    <div class="row">
      <a class="linkish" href="/app/event/${esc(s.schedule_id)}">Settings</a>
      <a class="linkish" href="/app/event/${esc(s.schedule_id)}/snippet">Offer times</a>
      <a class="linkish" href="${esc(pageUrl(s.slug))}">View</a>
    </div>
  </div>
</div>`,
    )
    .join('');

  return SHELL(
    'Your schedules',
    `<!--nav:scheduling-->
<div class="spread">
  <div>
    <h1>Your schedules</h1>
    <p class="muted">${esc(owner.display_name)} &middot; ${esc(owner.email)} &middot; ${esc(owner.timezone)}</p>
  </div>
  <a class="submit" href="#new" style="text-decoration:none">+ New event type</a>
</div>
${notice ? `<p class="ok">${esc(notice)}</p>` : ''}
${setupBanner}
${linkSlug ? `<p class="muted">Your public page: <a href="${esc(baseUrl)}/${esc(linkSlug)}">${esc(baseUrl)}/${esc(linkSlug)}</a></p>` : ''}
${schedules.length === 0 ? '<p class="muted">No booking pages yet — create your first below.</p>' : list}
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
<div class="card" id="new">
  <h2>New event type</h2>
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

/**
 * The owner's own numbers.
 *
 * Aggregates only. No booker is named here and none needs to be: the question
 * this page answers is "how is my scheduling going", not "who booked me", and
 * the meetings page already answers the latter for anyone who needs it. That
 * also means the page keeps working unchanged after a booker exercises their
 * deletion right — the row survives with its identity fields emptied, and the
 * counts were never about the identity.
 */
export function analyticsPage(a: {
  days: number;
  timezone: string;
  booked: number;
  cancelled: number;
  noShows: number;
  minutes: number;
  leadDays: number | null;
  byEvent: { title: string; count: number }[];
  byWeekday: number[];
  byHour: number[];
}): string {
  const pct = (n: number, of: number) => (of === 0 ? '—' : `${Math.round((n / of) * 100)}%`);
  const hours = (m: number) => (m < 60 ? `${m} min` : `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)} h`);

  const stat = (label: string, value: string, sub = '') =>
    `<div class="stat"><div class="statv">${esc(value)}</div>
      <div class="statl">${esc(label)}</div>
      ${sub ? `<div class="statsub">${esc(sub)}</div>` : ''}</div>`;

  // A bar chart in CSS: no library, no canvas, and it degrades to a readable
  // list of numbers when styles do not load.
  const bars = (values: number[], labels: string[]) => {
    const peak = Math.max(1, ...values);
    return `<div class="bars">${values
      .map(
        (v, i) => `<div class="bar" title="${esc(labels[i] ?? '')}: ${v}">
        <div class="barfill" style="height:${Math.round((v / peak) * 100)}%"></div>
        <div class="barl">${esc(labels[i] ?? '')}</div>
        <div class="barn">${v}</div></div>`,
      )
      .join('')}</div>`;
  };

  const eventRows = a.byEvent
    .map((e) => `<tr><td>${esc(e.title)}</td><td>${e.count}</td></tr>`)
    .join('');

  const ranges = [30, 90, 365]
    .map(
      (d) => `<a class="pill${d === a.days ? ' on' : ''}" href="/app/analytics?days=${d}">${d} days</a>`,
    )
    .join(' ');

  return SHELL(
    'Analytics',
    `<!--nav:analytics-->
<h1>Analytics</h1>
<p class="muted">Meetings starting in the last ${a.days} days, counted in
  ${esc(a.timezone)}. Nobody is named here.</p>
<p>${ranges}</p>
<div class="stats">
  ${stat('Meetings booked', String(a.booked))}
  ${stat('Time booked', hours(a.minutes))}
  ${stat('Cancelled', String(a.cancelled), pct(a.cancelled, a.booked + a.cancelled))}
  ${stat('No-shows', String(a.noShows), pct(a.noShows, a.booked))}
  ${stat('Booked ahead by', a.leadDays === null ? '—' : `${a.leadDays} days`, 'median')}
</div>
<div class="card"><h2>By event type</h2>
  ${eventRows ? `<table class="rows"><tr><th>Event type</th><th>Meetings</th></tr>${eventRows}</table>`
    : '<p class="muted">Nothing booked in this window.</p>'}
</div>
<div class="card"><h2>Which day</h2>
  ${bars(a.byWeekday, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])}
</div>
<div class="card"><h2>Which hour</h2>
  ${bars(a.byHour, a.byHour.map((_, h) => String(h).padStart(2, '0')))}
</div>
<style>
 .stats{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));margin:1rem 0}
 .stat{border:1px solid var(--line);border-radius:.6rem;padding:.85rem 1rem;background:var(--surface)}
 .statv{font-size:1.6rem;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.1}
 .statl{color:var(--muted);font-size:.8rem;margin-top:.15rem}
 .statsub{color:var(--muted);font-size:.75rem}
 .pill.on{background:var(--accent);color:#fff;border-color:var(--accent)}
 .bars{display:flex;align-items:flex-end;gap:.25rem;height:8rem;overflow-x:auto;padding-top:.5rem}
 .bar{flex:1 1 0;min-width:1.4rem;display:flex;flex-direction:column;justify-content:flex-end;
   height:100%;text-align:center}
 .barfill{background:var(--accent-soft);border:1px solid var(--accent);border-bottom:0;
   border-radius:.25rem .25rem 0 0;min-height:2px}
 .barl,.barn{font-size:.65rem;color:var(--muted);font-variant-numeric:tabular-nums}
 .barn{font-weight:600;color:var(--fg)}
</style>
${CARD_CSS}`,
  );
}
