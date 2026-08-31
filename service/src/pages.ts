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
import { VERSION } from './version.ts';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' }[c]};`);

// The product name. It belongs in the browser tab, where it identifies the tool
// without competing with the page's own heading -- a public booking page is the
// OWNER'S page, and their schedule title stays the largest thing on it.
const PRODUCT = 'Pumasi Booking';

/** Favicon SVG asset served at /favicon.ico and inlined in data URLs. */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#1a56db"/>
  <path d="M8 10h16M8 16h16M8 22h9" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="23" cy="22" r="2.5" fill="#ffffff"/>
</svg>`;

export const FAVICON_DATA_URL = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;

/**
 * D-105 · every public page carries the way to the privacy answers.
 * PR-1 · and the version it is being served by, so a person can find it
 * without reading source. One source of truth: `version.ts` is generated
 * from the root `package.json` (tools/sync-version.mjs).
 */
export const FOOTER = `<footer class="foot">
  <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot;
  <a href="/subprocessors">Who sees data</a>
  <span class="foot-v">v${VERSION}</span>
</footer>
<style>
 .foot{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--line);
   font-size:.8rem;color:var(--muted)}
 .foot a{color:var(--muted)}
 .foot-v{margin-left:.5rem;opacity:.75}
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
  { key: 'integrations', href: '/app/integrations', label: 'Apps & Video', icon: 'M15 10l5-3v10l-5-3v-4zM4 6h11a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z' },
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
  const wide = rawBody.includes('<!--wide-->');
  let body = m ? rawBody.replace(m[0], '') : rawBody;
  if (wide) body = body.replace('<!--wide-->', '');
  const inner = m
    ? `<div class="app">${sidebar(m[1]!)}<main id="main" class="main">${body}</main></div>`
    : `<main id="main" class="page ${wide ? 'page-wide' : ''}">${body}</main>`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === PRODUCT ? PRODUCT : `${esc(title)} &middot; ${PRODUCT}`}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URL}">
<link rel="alternate icon" href="/favicon.ico">
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
 .page-wide{max-width:68rem;padding:1.5rem 1.25rem 5rem}
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
 select option,select optgroup{background:var(--surface);color:var(--fg)}
 @media(prefers-color-scheme:dark){
   select,select option,select optgroup{background-color:#161922!important;color:#e7eaf0!important}
 }
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

 /* feedback widget */
 .pf-widget{position:fixed;bottom:1.25rem;right:1.25rem;z-index:999990}
 .pf-trigger-btn{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .9rem;
   border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);
   font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;box-shadow:var(--shadow);
   transition:transform .15s ease,box-shadow .15s ease}
 .pf-trigger-btn:hover{transform:translateY(-1px);border-color:var(--accent);box-shadow:0 4px 12px rgba(16,24,40,.1)}
 .pf-trigger-btn svg{color:var(--accent)}
 
 .pf-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);
   display:flex;align-items:center;justify-content:center;padding:1rem;z-index:999999}
 .pf-backdrop[hidden]{display:none}
 .pf-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;
   width:100%;max-width:32rem;max-height:92vh;overflow-y:auto;box-shadow:0 12px 32px rgba(0,0,0,.15);
   padding:1.4rem}
 .pf-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;
   padding-bottom:.6rem;border-bottom:1px solid var(--line-soft)}
 .pf-header h3{margin:0;font-size:1.15rem;font-weight:650;display:flex;align-items:center;gap:.5rem}
 .pf-close{background:none;border:0;font-size:1.4rem;line-height:1;color:var(--muted);
   cursor:pointer;padding:.2rem .4rem;border-radius:6px}
 .pf-close:hover{background:var(--line-soft);color:var(--fg)}
 
 .pf-type-row{display:flex;gap:.5rem;margin-bottom:.9rem}
 .pf-type-chip{flex:1;display:flex;align-items:center;justify-content:center;gap:.35rem;
   padding:.45rem .6rem;border:1px solid var(--line);border-radius:8px;cursor:pointer;
   font-size:.84rem;font-weight:550;background:var(--surface);color:var(--fg);transition:all .15s ease}
 .pf-type-chip input{display:none}
 .pf-type-chip:has(input:checked){background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
 
 .pf-label{display:block;margin:.6rem 0 .25rem;font-size:.84rem;font-weight:550;color:var(--fg)}
 .pf-input{width:100%;padding:.5rem .65rem;border:1px solid var(--line);border-radius:8px;
   background:var(--bg);color:var(--fg);font:inherit;font-size:.88rem;resize:vertical}
 
  .pf-attach-box{background:var(--line-soft);border:1px solid var(--line);border-radius:8px;
    padding:.75rem;margin:.8rem 0}
  .pf-attach-top{display:flex;align-items:center;justify-content:space-between;font-size:.82rem;font-weight:550}
  .pf-toggle-label{display:inline-flex;align-items:center;gap:.35rem;font-size:.8rem;color:var(--muted);cursor:pointer}
  .pf-tool-btn{display:inline-flex;align-items:center;gap:.25rem;padding:.2rem .45rem;
    border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--fg);
    font:inherit;font-size:.76rem;font-weight:550;text-decoration:none;cursor:pointer}
  .pf-tool-btn:hover{background:var(--line-soft);text-decoration:none;border-color:var(--muted)}
  .pf-tool-btn svg{width:12px;height:12px}
  .pf-tool-danger{color:var(--danger)}
  .pf-tool-danger:hover{background:rgba(180,35,24,.1);border-color:var(--danger)}
  .pf-shot-wrap{position:relative;margin:.5rem 0}
  .pf-shot-preview{width:100%;max-height:140px;object-fit:contain;background:#000;
    border-radius:6px;border:1px solid var(--line);display:block}
  .pf-shot-wrap:hover .pf-shot-zoom-hint{opacity:1}
  .pf-shot-zoom-hint{position:absolute;bottom:.5rem;right:.5rem;background:rgba(0,0,0,.75);
    color:#fff;font-size:.7rem;padding:.15rem .45rem;border-radius:4px;opacity:0;
    transition:opacity .15s;pointer-events:none}
  .pf-upload-btn{display:inline-flex;align-items:center;gap:.3rem;font-size:.78rem;font-weight:600;
    color:var(--accent);cursor:pointer;padding:.2rem .4rem;border-radius:4px}
  .pf-upload-btn:hover{text-decoration:underline}
 
  .pf-diag{margin:.7rem 0;font-size:.8rem;color:var(--muted)}
  .pf-diag summary{cursor:pointer;font-weight:550;color:var(--fg)}
  .pf-diag-table{margin-top:.4rem;background:var(--surface);border:1px solid var(--line);
    border-radius:6px;padding:.5rem;font-size:.75rem;font-family:monospace;white-space:pre-wrap;
    word-break:break-all;max-height:120px;overflow-y:auto}
 
  .pf-actions{display:flex;align-items:center;justify-content:flex-end;gap:.6rem;margin-top:1.1rem}
  .pf-btn-cancel{background:none;border:1px solid var(--line);padding:.5rem .9rem;
    border-radius:8px;color:var(--fg);font:inherit;font-size:.86rem;font-weight:550;cursor:pointer}
  .pf-btn-cancel:hover{background:var(--line-soft)}
  .pf-btn-submit{background:var(--accent);color:#fff;border:0;padding:.5rem 1.1rem;
    border-radius:8px;font:inherit;font-size:.86rem;font-weight:600;cursor:pointer}
  .pf-btn-submit:hover{filter:brightness(1.08)}
  .pf-btn-submit:disabled{opacity:.6;cursor:not-allowed}
  .pf-toast{padding:.6rem .8rem;border-radius:8px;font-size:.85rem;margin:.6rem 0}
  .pf-toast-ok{background:rgba(6,118,71,.1);border:1px solid var(--ok);color:var(--ok)}
  .pf-toast-err{background:rgba(180,35,24,.1);border:1px solid var(--danger);color:var(--danger)}
</style></head><body>${inner}
<div class="pf-widget">
  <button type="button" class="pf-trigger-btn" id="pf-open-btn" aria-label="Send Feedback">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>Feedback</span>
  </button>
</div>

<div id="pf-modal" class="pf-backdrop" hidden>
  <div class="pf-card" role="dialog" aria-modal="true" aria-labelledby="pf-heading">
    <div class="pf-header">
      <div class="pf-header-title">
        <h3 id="pf-heading">💬 Send Feedback & Report Issues</h3>
      </div>
      <button type="button" class="pf-close" id="pf-close-btn" aria-label="Close modal">&times;</button>
    </div>
    
    <form id="pf-form">
      <div class="pf-type-row">
        <label class="pf-type-chip"><input type="radio" name="pf_type" value="bug" checked><span>🐛 Bug</span></label>
        <label class="pf-type-chip"><input type="radio" name="pf_type" value="feature"><span>✨ Idea</span></label>
        <label class="pf-type-chip"><input type="radio" name="pf_type" value="general"><span>💬 Other</span></label>
      </div>

      <label for="pf-desc" class="pf-label">What happened or what would you like to see?</label>
      <textarea id="pf-desc" class="pf-input" rows="3" required placeholder="Describe the issue or feature in detail..."></textarea>

      <label for="pf-email" class="pf-label">Your email (optional, for notifications)</label>
      <input type="email" id="pf-email" class="pf-input" placeholder="you@company.com">

      <div class="pf-attach-box">
        <div class="pf-attach-top">
          <span>📷 Screenshot & Attachment</span>
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;">
            <button type="button" id="pf-snip-btn" class="pf-tool-btn" title="Capture exact screen or browser window">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>Capture Screen</span>
            </button>
            <a id="pf-download-btn" class="pf-tool-btn" download="pumasi-screenshot.png" href="#" style="display:none;" title="Download attached screenshot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <span>Download</span>
            </a>
            <button type="button" id="pf-remove-btn" class="pf-tool-btn pf-tool-danger" title="Remove attached file or screenshot" style="display:none;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              <span>Remove</span>
            </button>
            <label class="pf-toggle-label" style="margin-left:.25rem;">
              <input type="checkbox" id="pf-include-shot" checked>
              <span>Attach</span>
            </label>
          </div>
        </div>
        <div id="pf-preview-wrap" style="margin-top:.4rem">
          <div id="pf-shot-loading" class="muted" style="font-size:.8rem;">Capturing preview... (or press Ctrl+V to paste)</div>
          <div id="pf-shot-wrap" class="pf-shot-wrap" style="display:none;">
            <img id="pf-shot-preview" class="pf-shot-preview" alt="Preview" style="cursor:zoom-in;" title="Click to view full size" />
            <span class="pf-shot-zoom-hint">Click to view full size &middot; Ctrl+V to paste new</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.3rem;flex-wrap:wrap;">
            <label class="pf-upload-btn">
              <span>📎 Attach / Replace file (or paste Ctrl+V)</span>
              <input type="file" id="pf-file-upload" accept="image/*,.pdf,.txt,.log" style="display:none;">
            </label>
            <div style="display:flex;align-items:center;gap:.3rem;">
              <span id="pf-file-label" class="muted" style="font-size:.78rem;"></span>
              <button type="button" id="pf-clear-file-btn" class="linkish" style="display:none;color:var(--danger);font-size:.76rem;" title="Clear attached file">&times; Clear</button>
            </div>
          </div>
        </div>
      </div>

      <details class="pf-diag">
        <summary>🔍 Included Diagnostics (Full Transparency)</summary>
        <div id="pf-diag-view" class="pf-diag-table"></div>
      </details>

      <div id="pf-status-box" hidden></div>

      <div class="pf-actions">
        <button type="button" class="pf-btn-cancel" id="pf-cancel-btn">Cancel</button>
        <button type="submit" class="pf-btn-submit" id="pf-submit-btn">Submit Feedback &rarr;</button>
      </div>
    </form>
  </div>
</div>

<script>
(function() {
  const errLog = [];
  window.addEventListener('error', function(e) {
    errLog.push({
      message: e.message || String(e),
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      timestamp: new Date().toISOString()
    });
    if (errLog.length > 10) errLog.shift();
  });
  window.addEventListener('unhandledrejection', function(e) {
    errLog.push({
      message: 'Unhandled Promise Rejection: ' + (e.reason?.message || String(e.reason)),
      timestamp: new Date().toISOString()
    });
    if (errLog.length > 10) errLog.shift();
  });

  const modal = document.getElementById('pf-modal');
  const openBtn = document.getElementById('pf-open-btn');
  const closeBtn = document.getElementById('pf-close-btn');
  const cancelBtn = document.getElementById('pf-cancel-btn');
  const form = document.getElementById('pf-form');
  const shotPreview = document.getElementById('pf-shot-preview');
  const shotWrap = document.getElementById('pf-shot-wrap');
  const shotLoading = document.getElementById('pf-shot-loading');
  const fileUpload = document.getElementById('pf-file-upload');
  const fileLabel = document.getElementById('pf-file-label');
  const clearFileBtn = document.getElementById('pf-clear-file-btn');
  const includeShot = document.getElementById('pf-include-shot');
  const downloadBtn = document.getElementById('pf-download-btn');
  const snipBtn = document.getElementById('pf-snip-btn');
  const removeBtn = document.getElementById('pf-remove-btn');
  const diagView = document.getElementById('pf-diag-view');
  const statusBox = document.getElementById('pf-status-box');
  const submitBtn = document.getElementById('pf-submit-btn');

  let currentScreenshot = null;

  function updateScreenshotUI(dataUrl, fileName) {
    currentScreenshot = dataUrl;
    if (dataUrl) {
      shotPreview.src = dataUrl;
      shotWrap.style.display = 'block';
      shotLoading.style.display = 'none';
      if (downloadBtn) {
        downloadBtn.href = dataUrl;
        downloadBtn.style.display = 'inline-flex';
      }
      if (removeBtn) removeBtn.style.display = 'inline-flex';
      if (fileName) {
        if (fileLabel) fileLabel.innerText = fileName;
        if (clearFileBtn) clearFileBtn.style.display = 'inline';
      }
      includeShot.checked = true;
    } else {
      shotWrap.style.display = 'none';
      shotLoading.innerText = 'No screenshot or file attached. (Press Ctrl+V to paste)';
      shotLoading.style.display = 'block';
      if (downloadBtn) downloadBtn.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'none';
      if (fileUpload) fileUpload.value = '';
      if (fileLabel) fileLabel.innerText = '';
      if (clearFileBtn) clearFileBtn.style.display = 'none';
      includeShot.checked = false;
    }
  }

  function removeAttachment() {
    updateScreenshotUI(null);
    if (fileLabel) fileLabel.innerText = 'Attachment removed';
  }

  function loadHtml2Canvas(callback) {
    if (window.html2canvas) {
      callback(window.html2canvas);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = function() {
      if (window.html2canvas) callback(window.html2canvas);
      else drawFallbackCanvas();
    };
    s.onerror = function() {
      drawFallbackCanvas();
    };
    document.head.appendChild(s);
  }

  function autoCaptureDOM() {
    if (shotLoading) {
      shotLoading.style.display = 'block';
      shotLoading.innerText = 'Capturing page preview... (or press Ctrl+V to paste)';
    }
    if (shotWrap) shotWrap.style.display = 'none';

    // Draw instant fallback immediately so preview is available with zero lag
    drawFallbackCanvas();

    loadHtml2Canvas(function(h2c) {
      try {
        h2c(document.body, {
          ignoreElements: function(el) {
            return el && (el.id === 'pf-modal' || (el.classList && el.classList.contains('pf-widget')));
          },
          logging: false,
          useCORS: true,
          scale: Math.min(window.devicePixelRatio || 1, 2)
        }).then(function(canvas) {
          if (canvas) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            updateScreenshotUI(dataUrl);
          }
        }).catch(function(err) {
          console.warn('html2canvas capture error:', err);
        });
      } catch (err) {}
    });
  }

  function drawFallbackCanvas() {
    try {
      const w = Math.min(window.innerWidth, 1280);
      const h = Math.min(window.innerHeight, 800);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(document.body).color || '#101828';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('Pumasi Booking Session Snapshot', 24, 45);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText('URL: ' + location.href, 24, 80);
      ctx.fillText('Title: ' + document.title, 24, 110);
      ctx.fillText('Time: ' + new Date().toLocaleString(), 24, 140);
      ctx.fillText('Tip: Press Ctrl+V anytime to paste your screenshot!', 24, 180);
      updateScreenshotUI(canvas.toDataURL('image/png', 0.8));
    } catch(e) {}
  }

  async function captureDisplayMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Screen capture API is not available in this browser. You can press Ctrl+V to paste your screenshot directly.');
      return;
    }
    try {
      modal.hidden = true;
      modal.style.display = 'none';
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never' },
        preferCurrentTab: true
      });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      await new Promise(function(resolve) { video.onloadedmetadata = resolve; });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      track.stop();
      modal.hidden = false;
      modal.style.display = 'flex';
      updateScreenshotUI(canvas.toDataURL('image/png', 0.85), 'Screen capture (' + new Date().toLocaleTimeString() + ')');
    } catch(err) {
      modal.hidden = false;
      modal.style.display = 'flex';
    }
  }

  function handleImageFile(file, label) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      if (modal && (modal.hidden || modal.style.display === 'none')) {
        openModal();
      }
      updateScreenshotUI(evt.target?.result, label || ('Pasted image (' + new Date().toLocaleTimeString() + ')'));
    };
    reader.readAsDataURL(file);
  }

  // Global Clipboard Paste Listener (Ctrl+V / Cmd+V)
  window.addEventListener('paste', function(e) {
    if (!e.clipboardData) return;
    const items = e.clipboardData.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageFile(file, 'Pasted screenshot (' + new Date().toLocaleTimeString() + ')');
          e.preventDefault();
          return;
        }
      }
    }
    const files = e.clipboardData.files || [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) {
        handleImageFile(files[i], 'Pasted screenshot (' + new Date().toLocaleTimeString() + ')');
        e.preventDefault();
        return;
      }
    }
  });

  // Drag & drop screenshot or attachment
  window.addEventListener('dragover', function(e) {
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
    }
  });
  window.addEventListener('drop', function(e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.indexOf('image') !== -1 || file.name.match(/\.(png|jpg|jpeg|gif|webp|svg|pdf|txt|log)$/i)) {
        handleImageFile(file, file.name);
        e.preventDefault();
      }
    }
  });

  function renderDiagnostics() {
    const diag = {
      version: '${VERSION}',
      url: location.href,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      errors: errLog
    };
    if (diagView) diagView.innerText = JSON.stringify(diag, null, 2);
    return diag;
  }

  function openModal(e) {
    if (e) e.preventDefault();
    if (!modal) return;
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.style.display = 'flex';
    if (statusBox) {
      statusBox.hidden = true;
      statusBox.innerHTML = '';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Submit Feedback \u2192';
    }
    try { autoCaptureDOM(); } catch(err) { drawFallbackCanvas(); }
    try { renderDiagnostics(); } catch(err) {}
    setTimeout(function() {
      document.getElementById('pf-desc')?.focus();
    }, 60);
  }

  function closeModal() {
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('hidden', '');
      modal.style.display = 'none';
    }
  }

  if (openBtn) {
    openBtn.onclick = openModal;
    openBtn.addEventListener('click', openModal);
  }

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });
  }

  if (removeBtn) removeBtn.addEventListener('click', removeAttachment);
  if (clearFileBtn) clearFileBtn.addEventListener('click', removeAttachment);
  if (snipBtn) snipBtn.addEventListener('click', captureDisplayMedia);

  if (shotPreview) {
    shotPreview.addEventListener('click', function() {
      if (currentScreenshot) {
        const w = window.open('');
        if (w) {
          w.document.write('<title>Screenshot Preview</title><body style="margin:0;background:#0b0c10;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="' + currentScreenshot + '" style="max-width:98%;max-height:98vh;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.5);" /></body>');
        }
      }
    });
  }

  if (fileUpload) {
    fileUpload.addEventListener('change', function(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        updateScreenshotUI(evt.target?.result, file.name);
      };
      reader.readAsDataURL(file);
    });
  }

  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.innerText = 'Posting issue...';
      statusBox.hidden = true;

      const typeEl = form.querySelector('input[name="pf_type"]:checked');
      const payload = {
        version: '${VERSION}',
        type: typeEl ? typeEl.value : 'bug',
        description: document.getElementById('pf-desc')?.value || '',
        email: document.getElementById('pf-email')?.value || '',
        url: location.href,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        errors: errLog,
        screenshot: includeShot.checked ? currentScreenshot : undefined
      };

      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          statusBox.className = 'pf-toast pf-toast-ok';
          statusBox.innerHTML = '\u2714 Feedback posted! ' + 
            (data.issueUrl ? '<a href="' + data.issueUrl + '" target="_blank" rel="noopener" style="font-weight:600;text-decoration:underline;">View Issue on GitHub \u2197</a>' : 'Thank you for your feedback.');
          statusBox.hidden = false;
          submitBtn.innerText = '\u2714 Sent';
          setTimeout(function() {
            closeModal();
            form.reset();
          }, 3500);
        } else {
          statusBox.className = 'pf-toast pf-toast-err';
          statusBox.innerText = data.error || 'Failed to submit feedback. Please try again.';
          statusBox.hidden = false;
          submitBtn.disabled = false;
          submitBtn.innerText = 'Try Again';
        }
      } catch(err) {
        statusBox.className = 'pf-toast pf-toast-err';
        statusBox.innerText = 'Network error: ' + err.message;
        statusBox.hidden = false;
        submitBtn.disabled = false;
        submitBtn.innerText = 'Try Again';
      }
    });
  }
})();
</script>
</body></html>`;
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
  // Z2a/Z2d · this page is unauthenticated: whatever it prints, it prints to
  // everyone. A conferencing event type says where, never with what link.
  const where = locationText(schedule, undefined, 'public');

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
    });
    try {
      var savedName = localStorage.getItem('pumasi_booker_name');
      var savedEmail = localStorage.getItem('pumasi_booker_email');
      if (savedName && !document.getElementById('name').value) document.getElementById('name').value = savedName;
      if (savedEmail && !document.getElementById('email').value) document.getElementById('email').value = savedEmail;
      var formEl = document.getElementById('f');
      if (formEl) {
        formEl.addEventListener('submit', function() {
          var n = document.getElementById('name').value;
          var e = document.getElementById('email').value;
          if (n) localStorage.setItem('pumasi_booker_name', n);
          if (e) localStorage.setItem('pumasi_booker_email', e);
        });
      }
    } catch(err) {}
  }
  render();
})();
</script>`,
  );
}

export function confirmedPage(opts: { title: string; start: string; location?: string }): string {
  const loc = opts.location;
  const isUrl = Boolean(loc && (loc.startsWith('http://') || loc.startsWith('https://') || loc.includes('zoom.us') || loc.includes('meet.google.com') || loc.includes('teams.microsoft.com')));
  const cleanUrl = isUrl && loc ? (loc.match(/https?:\/\/[^\s]+/)?.[0] || loc) : undefined;

  let videoBtnText = 'Join Video Call ↗';
  let videoClass = 'video-btn-generic';
  if (cleanUrl?.includes('zoom.us')) {
    videoBtnText = 'Join Zoom Meeting ↗';
    videoClass = 'video-btn-zoom';
  } else if (cleanUrl?.includes('meet.google.com')) {
    videoBtnText = 'Join Google Meet ↗';
    videoClass = 'video-btn-meet';
  } else if (cleanUrl?.includes('teams.microsoft.com')) {
    videoBtnText = 'Join Microsoft Teams ↗';
    videoClass = 'video-btn-teams';
  }

  return SHELL(
    'Booked',
    `<div class="confirmed-card">
<div class="conf-badge">✔ BOOKING CONFIRMED</div>
<h1 style="margin:0 0 .5rem;font-size:1.6rem">Booked</h1>
<p class="ok">${esc(opts.title)} is confirmed for <time datetime="${esc(opts.start)}" id="t">${esc(opts.start)}</time>.</p>

${cleanUrl ? `
<div class="video-action-box">
  <div class="video-action-lead">Your video conference is ready:</div>
  <a href="${esc(cleanUrl)}" target="_blank" rel="noopener" class="video-join-btn ${videoClass}">${esc(videoBtnText)}</a>
  <div class="video-raw-link">Link: <a href="${esc(cleanUrl)}" target="_blank" rel="noopener">${esc(cleanUrl)}</a></div>
</div>
` : (opts.location ? `<p class="muted">📍 <b>Location</b>: ${esc(opts.location)}</p>` : '')}

<p class="muted" style="margin-top:1.5rem;font-size:.88rem">A confirmation email with calendar invites (.ics) has been sent to your inbox.</p>
</div>
<script>var t=document.getElementById('t');
 t.textContent=new Date(t.getAttribute('datetime')).toLocaleString(undefined, {weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
</script>
<style>
 .confirmed-card{max-width:32rem;margin:2rem auto;padding:2rem;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);text-align:center}
 .conf-badge{font-size:.78rem;font-weight:750;letter-spacing:.05em;color:var(--ok);margin-bottom:.75rem}
 .conf-time{font-size:1.15rem;font-weight:600;margin:.5rem 0 1.5rem}
 .video-action-box{margin:1.5rem 0;padding:1.25rem;background:var(--line-soft);border-radius:10px;border:1px solid var(--line)}
 .video-action-lead{font-size:.85rem;color:var(--muted);margin-bottom:.75rem;font-weight:550}
 .video-join-btn{display:inline-block;padding:.75rem 1.5rem;border-radius:8px;font-weight:650;font-size:1rem;color:#fff!important;text-decoration:none;box-shadow:0 2px 4px rgba(0,0,0,.15);cursor:pointer}
 .video-btn-zoom{background:#2D8CFF}
 .video-btn-meet{background:#1a73e8}
 .video-btn-teams{background:#5c55be}
 .video-btn-generic{background:var(--accent)}
 .video-raw-link{margin-top:.6rem;font-size:.8rem;color:var(--muted);word-break:break-all}
</style>`,
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
 * The front door (Issue #6). Renders the rich landing page with hero CTA,
 * interactive mockup card, architecture comparison, feature pillars,
 * how-it-works, and legal/commons status.
 */
export function homePage(publicSignup = false): string {
  return SHELL(
    PRODUCT,
    `<!--wide-->
<header class="home-top-nav">
  <div class="brand-group">
    <div class="brand-svg-mark">${FAVICON_SVG}</div>
    <span class="brand-title">${PRODUCT}</span>
    <span class="tag-pill">Apache-2.0</span>
  </div>
  <nav class="top-nav-links">
    <a href="#features">Features</a>
    <a href="#architecture">Architecture</a>
    <a href="#how-it-works">How it works</a>
    <a href="https://github.com/pumasi-ai/pumasi-booking" target="_blank" rel="noopener" class="gh-link">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
      <span>GitHub</span>
    </a>
    <a href="/login" class="top-nav-btn">Sign in</a>
  </nav>
</header>

<div class="hero-split-grid">
  <div class="hero-text-col">
    <div class="hero-eyebrow">
      <span class="live-pulse"></span>
      <span>Autonomous Commons &middot; Multi-Model Verified</span>
    </div>
    <h1 class="hero-main-title">Open-source scheduling, built for <span class="highlight-gradient">absolute truth</span>.</h1>
    <p class="hero-lead-para">Connect Google Calendar and Microsoft 365 with real-time busy checks, zero double-booking guaranteed inside the database, and 1-minute self-hosting. Stop paying per-seat subscription rent.</p>
    
    <div class="hero-action-buttons">
      ${publicSignup
        ? `<a href="/signup" class="cta-prime">Create your booking page &rarr;</a>
           <a href="/login" class="cta-outline">Sign in</a>`
        : `<a href="/login" class="cta-prime">Sign in to account &rarr;</a>`}
      <a href="https://github.com/pumasi-ai/pumasi-booking" target="_blank" rel="noopener" class="cta-subtle">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.784 1.399 8.169-7.333-3.856-7.333 3.856 1.399-8.169-5.934-5.784 8.2-1.192zm0 5.702l-2.223 4.505-4.971.723 3.597 3.506-.847 4.953 4.444-2.336 4.444 2.336-.847-4.953 3.597-3.506-4.971-.723z"/></svg>
        <span>Star on GitHub</span>
      </a>
    </div>

    <div class="hero-proof-row">
      <span class="proof-tag"><svg viewBox="0 0 16 16" width="13" height="13" fill="var(--ok)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg> No credit card needed</span>
      <span class="proof-tag"><svg viewBox="0 0 16 16" width="13" height="13" fill="var(--ok)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg> Zero telemetry / ad trackers</span>
      <span class="proof-tag"><svg viewBox="0 0 16 16" width="13" height="13" fill="var(--ok)"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg> 1-Min Docker / Worker Deploy</span>
    </div>
  </div>

  <div class="hero-mockup-col">
    <div class="mockup-window">
      <div class="mockup-header-bar">
        <div class="dot-trio"><span></span><span></span><span></span></div>
        <div class="mockup-url-pill">booking.pumasi.ai/sarah/arch-review</div>
      </div>
      <div class="mockup-content">
        <div class="mockup-profile">
          <div class="avatar-circle">SC</div>
          <div>
            <div class="mock-author">Sarah Chen</div>
            <div class="mock-meeting-title">30 Min Technical Architecture Call</div>
          </div>
        </div>
        <p class="mock-desc">Review scheduling architecture, timezone arithmetic, and self-hosted PostgreSQL concurrency.</p>
        
        <div class="mock-meta-badges">
          <span class="meta-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> 30 min</span>
          <span class="meta-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> America/Chicago</span>
          <span class="meta-badge"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l5-3v10l-5-3v-4z"/><rect x="4" y="6" width="11" height="12" rx="2"/></svg> Google Meet</span>
        </div>

        <div class="mock-date-strip">
          <div class="mock-date-btn"><span>MON</span><strong>31</strong></div>
          <div class="mock-date-btn"><span>TUE</span><strong>1</strong></div>
          <div class="mock-date-btn active"><span>WED</span><strong>2</strong></div>
          <div class="mock-date-btn"><span>THU</span><strong>3</strong></div>
          <div class="mock-date-btn"><span>FRI</span><strong>4</strong></div>
        </div>

        <div class="mock-slots-container">
          <div class="mock-slot-pill">09:00 AM</div>
          <div class="mock-slot-pill">10:30 AM</div>
          <div class="mock-slot-pill selected">02:00 PM ✓</div>
          <div class="mock-slot-pill">03:30 PM</div>
        </div>

        <div class="mock-verification-notice">
          <span class="verify-icon">⚡</span>
          <span>Google Calendar & Microsoft 365 Verified &middot; Zero Conflicts</span>
        </div>

        <button type="button" class="mock-submit-btn">Confirm Wed, Sep 2 at 2:00 PM &rarr;</button>
      </div>
    </div>
  </div>
</div>

<div class="metrics-strip">
  <div class="metric-card">
    <div class="metric-value">0 ms</div>
    <div class="metric-title">Ambient State Drift</div>
    <div class="metric-desc">Pure mathematical engine in @pumasi/booking-core</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">100%</div>
    <div class="metric-title">Database Exclusion Lock</div>
    <div class="metric-desc">PostgreSQL btree_gist + SQLite atomic triggers</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">250+</div>
    <div class="metric-title">Verified Test Cases</div>
    <div class="metric-desc">Multi-model tested across DST gaps & timezones</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">$0 / Seat</div>
    <div class="metric-title">Per-User License Cost</div>
    <div class="metric-desc">100% Apache-2.0 open source forever</div>
  </div>
</div>

<section id="architecture" class="arch-section">
  <div class="section-tag-center">ENGINEERING DEEP DIVE</div>
  <h2 class="section-heading-center">Why Pumasi Booking is built differently</h2>
  <p class="section-sub-center">Most commercial scheduling tools use application-level checks that fail under concurrent bookings. Pumasi locks availability atomically inside the database engine.</p>
  
  <div class="compare-row-grid">
    <div class="compare-card bad-card">
      <div class="card-status-badge bad-badge">Traditional SaaS / Naive App Logic</div>
      <h3>Check-Then-Act Race Condition</h3>
      <p>The web server checks if the time is free, pauses, and then sends an INSERT. Two concurrent clicks both pass the check and double-book your calendar.</p>
      <div class="flow-box bad-flow-box">
        <div class="flow-node">User A & User B click 2:00 PM simultaneously</div>
        <div class="flow-arrow">&darr;</div>
        <div class="flow-node">App checks DB: "Slot is available" (True for both)</div>
        <div class="flow-arrow">&darr;</div>
        <div class="flow-node err-node">💥 Double Booking Created (Data Corruption)</div>
      </div>
    </div>

    <div class="compare-card good-card">
      <div class="card-status-badge good-badge">Pumasi Commons Architecture</div>
      <h3>SQL-Level Temporal Exclusion</h3>
      <p>Concurrency protection lives inside the database transaction. Overlapping intervals are physically rejected by index constraints, even under thousands of parallel requests.</p>
      <div class="flow-box good-flow-box">
        <div class="flow-node">User A & User B click 2:00 PM simultaneously</div>
        <div class="flow-arrow">&darr;</div>
        <div class="flow-node">DB evaluates <code>btree_gist</code> interval lock</div>
        <div class="flow-arrow">&darr;</div>
        <div class="flow-node ok-node">🛡️ Exactly 1 Confirms &middot; Loser rejected cleanly</div>
      </div>
    </div>
  </div>
</section>

<section id="features" class="features-section">
  <div class="section-tag-center">CORE CAPABILITIES</div>
  <h2 class="section-heading-center">Engineered for reliability, privacy, and speed</h2>
  
  <div class="features-3col-grid">
    <div class="rich-feat-box">
      <div class="feat-icon-bubble blue-bubble">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <h3>Live Calendar Truth</h3>
      <p>Checks Google Calendar and Microsoft 365 busy times in real time before offering slots. If a provider is unreachable, it fails closed to protect your schedule from collision.</p>
      <div class="feat-bullet-list">
        <div class="bullet-item"><span class="check-mark">✓</span> Google Calendar OAuth2 real-time sync</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Microsoft 365 Graph API conflict check</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Fails-closed network protection</div>
      </div>
    </div>

    <div class="rich-feat-box">
      <div class="feat-icon-bubble green-bubble">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      </div>
      <h3>Pure Engine Separability</h3>
      <p>Availability calculation in <code>@pumasi/booking-core</code> is a pure function: zero I/O, zero clock dependencies, byte-identical output. Extract the engine alone with <code>git subtree split</code>.</p>
      <div class="feat-bullet-list">
        <div class="bullet-item"><span class="check-mark">✓</span> Spring-forward & fall-back DST precision</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Daily caps evaluated on host's local date</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Frozen multi-model acceptance test matrix</div>
      </div>
    </div>

    <div class="rich-feat-box">
      <div class="feat-icon-bubble purple-bubble">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
      </div>
      <h3>1-Minute Self-Hosting</h3>
      <p>Self-hosting is a first-class citizen. Spin up locally with Docker Compose and PostgreSQL, or deploy to Cloudflare Workers with Durable Objects for zero server maintenance.</p>
      <div class="feat-bullet-list">
        <div class="bullet-item"><span class="check-mark">✓</span> <code>docker compose up</code> ready</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Cloudflare Workers + Durable Objects build</div>
        <div class="bullet-item"><span class="check-mark">✓</span> Zero third-party telemetry or ad tracking</div>
      </div>
    </div>
  </div>
</section>

<section id="how-it-works" class="how-section-wrapper">
  <div class="section-tag-center">SIMPLE WORKFLOW</div>
  <h2 class="section-heading-center">How it works</h2>
  <div class="how-cards-row">
    <div class="how-card-box">
      <div class="how-step-badge">01</div>
      <h4>Set your availability</h4>
      <p>Define weekly working hours, custom buffer times between meetings, and event types (15m, 30m, 60m discovery calls).</p>
    </div>
    <div class="how-card-box">
      <div class="how-step-badge">02</div>
      <h4>Share your custom link</h4>
      <p>Send your public booking link (<code>/username/event</code>) directly to clients, embed it in emails, or link it on your website.</p>
    </div>
    <div class="how-card-box">
      <div class="how-step-badge">03</div>
      <h4>Automatic sync</h4>
      <p>When a booker selects a slot, real-time availability locks the time, and email confirmations with <code>.ics</code> invites are delivered instantly.</p>
    </div>
  </div>
</section>

<div class="seed-preview-card">
  <div class="seed-content">
    <div class="seed-title-group">
      <span class="seed-badge">SEED PREVIEW &middot; ALPHA</span>
      <h3>Built in the open by autonomous multi-model agents</h3>
    </div>
    <p>Pumasi is an open commons. Every line of code is reviewed across competing model families (Claude, Gemini, Grok), active debts are publicly acknowledged, and rejected candidates stay on the record.</p>
  </div>
  <div class="seed-links-col">
    <a href="https://github.com/pumasi-ai/pumasi" class="seed-btn" target="_blank" rel="noopener">Governance Charter ↗</a>
    <a href="https://github.com/pumasi-ai/pumasi/blob/main/governance/DEBT.md" class="seed-btn" target="_blank" rel="noopener">Debt Register (DEBT.md) ↗</a>
    <a href="https://github.com/pumasi-ai/pumasi/blob/main/lessons/README.md" class="seed-btn" target="_blank" rel="noopener">Lessons Learned ↗</a>
  </div>
</div>

${FOOTER}
<style>
 .home-top-nav{display:flex;justify-content:space-between;align-items:center;padding:1rem 0 2rem;border-bottom:1px solid var(--line);margin-bottom:2.5rem;flex-wrap:wrap;gap:1rem}
 .brand-group{display:flex;align-items:center;gap:.65rem}
 .brand-svg-mark svg{width:26px;height:26px;border-radius:6px;display:block}
 .brand-title{font-size:1.15rem;font-weight:700;letter-spacing:-.02em}
 .tag-pill{font-size:.72rem;font-weight:600;padding:.15rem .5rem;border-radius:999px;background:var(--line-soft);color:var(--muted);border:1px solid var(--line)}
 .top-nav-links{display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap}
 .top-nav-links a{color:var(--muted);text-decoration:none;font-size:.9rem;font-weight:550}
 .top-nav-links a:hover{color:var(--fg);text-decoration:none}
 .top-nav-links .gh-link{display:inline-flex;align-items:center;gap:.35rem}
 .top-nav-btn{padding:.35rem .85rem;border-radius:6px;background:var(--accent-soft);color:var(--accent)!important;font-weight:600;border:1px solid var(--line)}
 .top-nav-btn:hover{background:var(--accent);color:#fff!important}

 .hero-split-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:2.5rem;align-items:center;margin-bottom:3.5rem}
 @media(max-width:56rem){.hero-split-grid{grid-template-columns:1fr;gap:2rem}}
 
 .hero-eyebrow{display:inline-flex;align-items:center;gap:.5rem;padding:.25rem .75rem;background:var(--accent-soft);color:var(--accent);border-radius:999px;font-size:.8rem;font-weight:600;margin-bottom:1rem;border:1px solid var(--line)}
 .live-pulse{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgba(26,86,219,.25)}
 .hero-main-title{font-size:2.35rem;line-height:1.2;letter-spacing:-.03em;margin:0 0 1rem;font-weight:750}
 .highlight-gradient{background:linear-gradient(135deg,var(--accent),#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
 .hero-lead-para{font-size:1.08rem;line-height:1.55;color:var(--muted);margin:0 0 1.75rem}
 
 .hero-action-buttons{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1.5rem}
 .cta-prime{display:inline-block;padding:.7rem 1.4rem;border-radius:8px;background:var(--accent);color:#fff!important;font-weight:650;font-size:.96rem;text-decoration:none;cursor:pointer;border:1px solid var(--accent);box-shadow:0 2px 4px rgba(26,86,219,.2)}
 .cta-prime:hover{filter:brightness(1.08);text-decoration:none}
 .cta-outline{display:inline-block;padding:.7rem 1.3rem;border-radius:8px;background:var(--surface);color:var(--fg)!important;font-weight:600;font-size:.95rem;text-decoration:none;border:1px solid var(--line)}
 .cta-outline:hover{background:var(--line-soft);text-decoration:none}
 .cta-subtle{display:inline-flex;align-items:center;gap:.4rem;padding:.7rem 1rem;color:var(--muted)!important;font-weight:550;font-size:.9rem;text-decoration:none}
 .cta-subtle:hover{color:var(--fg)!important}

 .hero-proof-row{display:flex;gap:1rem;flex-wrap:wrap;font-size:.82rem;color:var(--muted)}
 .proof-tag{display:inline-flex;align-items:center;gap:.35rem}

 /* Mockup Card Window */
 .mockup-window{background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);overflow:hidden}
 .mockup-header-bar{background:var(--line-soft);padding:.6rem .9rem;display:flex;align-items:center;gap:.8rem;border-bottom:1px solid var(--line)}
 .dot-trio{display:flex;gap:5px}
 .dot-trio span{width:9px;height:9px;border-radius:50%;background:var(--line)}
 .mockup-url-pill{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.74rem;color:var(--muted);background:var(--surface);padding:.15rem .6rem;border-radius:4px;border:1px solid var(--line)}
 .mockup-content{padding:1.4rem}
 
 .mockup-profile{display:flex;align-items:center;gap:.75rem;margin-bottom:.6rem}
 .avatar-circle{width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem}
 .mock-author{font-size:.84rem;color:var(--muted);font-weight:550}
 .mock-meeting-title{font-size:1.02rem;font-weight:680;letter-spacing:-.01em}
 .mock-desc{font-size:.85rem;color:var(--muted);margin:.3rem 0 .75rem;line-height:1.4}
 
 .mock-meta-badges{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}
 .meta-badge{display:inline-flex;align-items:center;gap:.3rem;font-size:.76rem;background:var(--line-soft);color:var(--fg);padding:.2rem .55rem;border-radius:6px;font-weight:550}
 
 .mock-date-strip{display:grid;grid-template-columns:repeat(5,1fr);gap:.35rem;margin-bottom:.85rem}
 .mock-date-btn{text-align:center;padding:.4rem .2rem;border:1px solid var(--line);border-radius:8px;font-size:.76rem}
 .mock-date-btn span{display:block;font-size:.65rem;color:var(--muted)}
 .mock-date-btn strong{font-size:.85rem}
 .mock-date-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
 .mock-date-btn.active span{color:rgba(255,255,255,.85)}

 .mock-slots-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem;margin-bottom:.9rem}
 .mock-slot-pill{text-align:center;padding:.5rem;border:1px solid var(--line);border-radius:7px;font-size:.82rem;font-weight:600;color:var(--fg)}
 .mock-slot-pill.selected{background:var(--accent-soft);color:var(--accent);border-color:var(--accent)}
 
 .mock-verification-notice{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--ok);margin-bottom:.9rem;background:var(--line-soft);padding:.35rem .6rem;border-radius:6px}
 .mock-submit-btn{width:100%;padding:.65rem;border-radius:8px;background:var(--accent);color:#fff;font-weight:650;font-size:.88rem;border:0;cursor:pointer}

 /* Metrics Strip */
 .metrics-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1rem;margin:3.5rem 0;padding:1.5rem;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}
 .metric-card{padding:.5rem}
 .metric-value{font-size:1.6rem;font-weight:750;letter-spacing:-.02em;color:var(--accent)}
 .metric-title{font-size:.9rem;font-weight:650;margin:.2rem 0 .15rem}
 .metric-desc{font-size:.78rem;color:var(--muted);line-height:1.4}

 /* Architecture Section */
 .arch-section{margin:4.5rem 0}
 .section-tag-center{text-align:center;font-size:.75rem;font-weight:700;letter-spacing:.08em;color:var(--accent);margin-bottom:.35rem}
 .section-heading-center{text-align:center;font-size:1.75rem;font-weight:720;letter-spacing:-.02em;margin:0 0 .5rem}
 .section-sub-center{text-align:center;max-width:36rem;margin:0 auto 2.25rem;color:var(--muted);font-size:.98rem;line-height:1.5}
 
 .compare-row-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
 @media(max-width:48rem){.compare-row-grid{grid-template-columns:1fr}}
 .compare-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1.5rem;box-shadow:var(--shadow)}
 .bad-card{border-top:4px solid var(--danger)}
 .good-card{border-top:4px solid var(--ok)}
 .card-status-badge{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:.6rem}
 .bad-badge{color:var(--danger)}
 .good-badge{color:var(--ok)}
 .compare-card h3{font-size:1.05rem;margin:0 0 .4rem;font-weight:650}
 .compare-card p{font-size:.88rem;color:var(--muted);margin:0 0 1.2rem;line-height:1.45}
 
 .flow-box{padding:.85rem;background:var(--line-soft);border-radius:8px;font-size:.82rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
 .flow-node{padding:.3rem 0}
 .flow-arrow{color:var(--muted);font-size:.8rem}
 .err-node{color:var(--danger);font-weight:650}
 .ok-node{color:var(--ok);font-weight:650}

 /* Features Section */
 .features-section{margin:4.5rem 0}
 .features-3col-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:1.25rem}
 .rich-feat-box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1.5rem;box-shadow:var(--shadow)}
 .feat-icon-bubble{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:1rem}
 .blue-bubble{background:var(--accent-soft);color:var(--accent)}
 .green-bubble{background:rgba(6,118,71,.1);color:var(--ok)}
 .purple-bubble{background:rgba(139,92,246,.12);color:#8b5cf6}
 .rich-feat-box h3{font-size:1.08rem;margin:0 0 .45rem;font-weight:650}
 .rich-feat-box p{font-size:.88rem;color:var(--muted);margin:0 0 1.1rem;line-height:1.45}
 .feat-bullet-list{display:flex;flex-direction:column;gap:.4rem;font-size:.82rem}
 .bullet-item{display:flex;align-items:center;gap:.45rem;color:var(--fg)}
 .check-mark{color:var(--ok);font-weight:700}

 /* How It Works */
 .how-section-wrapper{margin:4.5rem 0}
 .how-cards-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1.25rem}
 .how-card-box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:1.4rem;position:relative}
 .how-step-badge{font-size:1.6rem;font-weight:800;color:var(--accent);opacity:.75;margin-bottom:.5rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
 .how-card-box h4{font-size:.98rem;margin:0 0 .35rem;font-weight:650}
 .how-card-box p{font-size:.85rem;color:var(--muted);margin:0;line-height:1.45}

 /* Seed Preview Box */
 .seed-preview-card{display:flex;justify-content:space-between;align-items:center;gap:2rem;background:var(--line-soft);border:1px solid var(--line);border-radius:14px;padding:1.6rem 1.8rem;margin:4rem 0 2rem;flex-wrap:wrap}
 .seed-content{max-width:34rem}
 .seed-title-group{display:flex;align-items:center;gap:.65rem;margin-bottom:.4rem;flex-wrap:wrap}
 .seed-badge{font-size:.72rem;font-weight:700;padding:.15rem .5rem;border-radius:999px;background:var(--accent);color:#fff}
 .seed-title-group h3{font-size:1.05rem;margin:0;font-weight:680}
 .seed-content p{font-size:.86rem;color:var(--muted);margin:0;line-height:1.5}
 .seed-links-col{display:flex;flex-direction:column;gap:.5rem;min-width:13rem}
 .seed-btn{display:inline-block;padding:.45rem .85rem;background:var(--surface);color:var(--fg)!important;border:1px solid var(--line);border-radius:7px;font-size:.84rem;font-weight:550;text-decoration:none;text-align:center}
 .seed-btn:hover{background:var(--line);text-decoration:none}
</style>`,
  );
}

export function errorPage(code: number, message: string): string {
  return SHELL(String(code), `<h1>${code}</h1><p class="err">${esc(message)}</p>`);
}

// ── owner surfaces ─────────────────────────────────────────────────────────

export interface SsoOptions {
  google?: boolean;
  microsoft?: boolean;
}

const GOOGLE_ICON_SVG = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24Z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/></svg>`;

const MICROSOFT_ICON_SVG = `<svg class="sso-icon" width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>`;

/** P4 & Issue #5 — SSO buttons for Google and Microsoft with brand icons. */
function ssoButtons(inviteCode = '', sso: boolean | SsoOptions = true): string {
  const google = typeof sso === 'boolean' ? sso : (sso.google ?? false);
  const microsoft = typeof sso === 'boolean' ? false : (sso.microsoft ?? false);
  if (!google && !microsoft) return '';

  const buttons: string[] = [];
  if (google) {
    buttons.push(`<form method="post" action="/auth/google/start" class="ssoform">
  <input type="hidden" name="invite" value="${esc(inviteCode)}">
  <input type="hidden" name="timezone" class="tzauto">
  <button class="sso-btn sso-google" type="submit">
    ${GOOGLE_ICON_SVG}
    <span>Continue with Google</span>
  </button>
</form>`);
  }
  if (microsoft) {
    buttons.push(`<form method="post" action="/auth/microsoft/start" class="ssoform">
  <input type="hidden" name="invite" value="${esc(inviteCode)}">
  <input type="hidden" name="timezone" class="tzauto">
  <button class="sso-btn sso-ms" type="submit">
    ${MICROSOFT_ICON_SVG}
    <span>Continue with Microsoft</span>
  </button>
</form>`);
  }

  return `<div class="sso-stack">${buttons.join('')}</div>
<div class="auth-divider"><span>or continue with email</span></div>
<script>document.querySelectorAll('.tzauto').forEach(function(i){
  try{i.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}});</script>`;
}

const AUTH_STYLES = `<style>
  .auth-wrap{max-width:27rem;margin:1.5rem auto 3.5rem;padding:0 1rem}
  .auth-top{text-align:center;margin-bottom:1.5rem}
  .auth-top .brand-logo{display:inline-flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--fg);font-size:1.15rem;font-weight:700;letter-spacing:-.02em}
  .auth-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:2rem 1.85rem;box-shadow:0 10px 28px -6px rgba(0,0,0,.06),0 2px 8px -2px rgba(0,0,0,.04)}
  .auth-header{margin-bottom:1.4rem;text-align:center}
  .auth-header h1{font-size:1.45rem;font-weight:700;letter-spacing:-.02em;margin:0 0 .35rem}
  .auth-header p{margin:0;font-size:.88rem;color:var(--muted);line-height:1.45}
  .sso-stack{display:flex;flex-direction:column;gap:.6rem;margin-bottom:1.25rem}
  .ssoform{margin:0}
  .sso-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:.75rem;padding:.68rem 1rem;border-radius:10px;font:inherit;font-size:.92rem;font-weight:600;cursor:pointer;transition:all .15s ease;background:var(--surface);border:1px solid var(--line);color:var(--fg)}
  .sso-btn:hover{background:var(--line-soft);border-color:var(--muted);transform:translateY(-1px)}
  .sso-icon{flex:none}
  .auth-divider{display:flex;align-items:center;margin:1.35rem 0;text-align:center;color:var(--muted);font-size:.74rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  .auth-divider::before,.auth-divider::after{content:'';flex:1;border-bottom:1px solid var(--line)}
  .auth-divider span{padding:0 .85rem}
  .auth-form label{margin:.75rem 0 .3rem;font-size:.85rem;font-weight:600}
  .auth-form input{padding:.62rem .8rem;border-radius:9px}
  .auth-form .submit{width:100%;margin-top:1.2rem;padding:.68rem 1.1rem;border-radius:9px;font-size:.95rem;display:flex;align-items:center;justify-content:center;gap:.4rem}
  .auth-trust{margin-top:1.35rem;padding-top:1rem;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:center;gap:.45rem;font-size:.78rem;color:var(--muted);text-align:center}
  .auth-trust svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.8}
  .auth-footer{text-align:center;margin-top:1.5rem;font-size:.88rem;color:var(--muted)}
  .auth-footer a{color:var(--accent);text-decoration:none;font-weight:600}
  .auth-footer a:hover{text-decoration:underline}
  .sent-box{text-align:center;padding:1.5rem .5rem}
  .sent-icon{width:54px;height:54px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;margin-bottom:1rem}
  .sent-icon svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
</style>`;

export function signupPage(
  inviteCode: string,
  error?: string,
  opts: { sso?: boolean | SsoOptions; publicSignup?: boolean } = {},
): string {
  return SHELL(
    'Create your account',
    `<div class="auth-wrap">
  <div class="auth-top">
    <a href="/" class="brand-logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><path d="M8 10h16M8 16h16M8 22h9" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="23" cy="22" r="2.5" fill="#ffffff"/></svg>
      <span>Pumasi Booking</span>
    </a>
  </div>
  <div class="auth-card">
    <div class="auth-header">
      <h1>Create your account</h1>
      <p>Instant calendar sync with guaranteed zero double-booking.</p>
    </div>
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    ${opts.sso ? ssoButtons(inviteCode, opts.sso) : ''}
    <form method="post" action="/signup" class="auth-form">
      <input type="hidden" name="invite" value="${esc(inviteCode)}">
      <label for="e">Email address</label>
      <input id="e" name="email" type="email" required autocomplete="email" placeholder="name@company.com">
      <label for="n">Your name</label>
      <input id="n" name="display_name" required autocomplete="name" placeholder="Sarah Chen">
      <label for="tz">Your timezone</label>
      <input id="tz" name="timezone" required value="UTC">
      <button class="submit" type="submit">Create account &rarr;</button>
    </form>
    <div class="auth-trust">
      <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <span>${opts.publicSignup ? '100% telemetry-free · Open commons' : 'Invite-only · No third-party trackers'}</span>
    </div>
  </div>
  <div class="auth-footer">
    Already have an account? <a href="/login">Sign in</a>
  </div>
</div>
${AUTH_STYLES}
<script>var t=document.getElementById('tz');
 t.value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';</script>`,
  );
}

export function loginPage(sent?: boolean, error?: string, sso?: boolean | SsoOptions): string {
  return SHELL(
    'Sign in',
    `<div class="auth-wrap">
  <div class="auth-top">
    <a href="/" class="brand-logo">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><path d="M8 10h16M8 16h16M8 22h9" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="23" cy="22" r="2.5" fill="#ffffff"/></svg>
      <span>Pumasi Booking</span>
    </a>
  </div>
  <div class="auth-card">
    ${
      sent
        ? `<div class="sent-box">
             <div class="sent-icon">
               <svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
             </div>
             <h1>Check your email</h1>
             <p class="muted" style="margin:.6rem 0 1.5rem">If that address is registered, a sign-in link is on its way. It works once and expires in 20 minutes.</p>
             <a href="/login" class="submit" style="text-decoration:none;display:inline-block;text-align:center">Back to sign in</a>
           </div>`
        : `<div class="auth-header">
             <h1>Sign in</h1>
             <p>Select your SSO provider or sign in with your email.</p>
           </div>
           ${error ? `<p class="err">${esc(error)}</p>` : ''}
           ${sso ? ssoButtons('', sso) : ''}
           <form method="post" action="/login" class="auth-form">
             <label for="e">Email address</label>
             <input id="e" name="email" type="email" required autocomplete="email" placeholder="name@company.com">
             <button class="submit" type="submit">Send magic sign-in link &rarr;</button>
           </form>
           <div class="auth-trust">
             <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
             <span>Passwordless security · Zero telemetry</span>
           </div>`
    }
  </div>
  ${
    sent
      ? ''
      : `<div class="auth-footer">
           Don't have an account yet? <a href="/signup">Create an account</a>
         </div>`
  }
</div>
${AUTH_STYLES}`,
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
    const isWeekend = d === 'SA' || d === 'SU';
    const startVal = r ? r.start : (isWeekend ? '' : '09:00');
    const endVal = r ? r.end : (isWeekend ? '' : '17:00');
    return `<tr><th>${d}</th>
      <td><input name="${d}_start" value="${esc(startVal)}" placeholder="09:00" size="5"></td>
      <td><input name="${d}_end" value="${esc(endVal)}" placeholder="17:00" size="5"></td>
      <td><button type="button" class="linkish" style="font-size:.78rem;color:var(--muted)" onclick="this.closest('tr').querySelectorAll('input').forEach(i=>i.value='')">Clear</button></td></tr>`;
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
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;margin-bottom:.75rem">
    <h2 style="margin:0">Weekly hours</h2>
    <div style="display:flex;gap:.35rem;flex-wrap:wrap">
      <button type="button" class="preset-pill" onclick="setPresetHours('standard')">🏢 9:00 AM – 5:00 PM (Mon–Fri)</button>
      <button type="button" class="preset-pill" onclick="setPresetHours('extended')">⚡ 8:30 AM – 6:00 PM (Mon–Fri)</button>
      <button type="button" class="preset-pill" onclick="setPresetHours('all')">🌐 24/7</button>
      <button type="button" class="preset-pill" onclick="setPresetHours('clear')">🧹 Clear All</button>
    </div>
  </div>
  <form method="post" action="/app/availability/${esc(set.set_id)}/hours" id="avail-form">
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
    <div style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin:.5rem 0">
      <label>Date <input type="date" name="date" id="ov_date" required></label>
      <label>From <input name="start" id="ov_start" value="09:00" placeholder="09:00" size="5"></label>
      <label>To <input name="end" id="ov_end" value="17:00" placeholder="17:00" size="5"></label>
      <label style="display:inline-flex;align-items:center;gap:.35rem;cursor:pointer">
        <input type="checkbox" id="ov_off" style="width:auto" onchange="toggleFullDayOff(this.checked)"> Full Day Off</label>
    </div>
    <button class="submit" type="submit">Add override</button>
  </form>
</div>
<div class="card">
  <h2>Holidays</h2>
  <p class="muted">Marks your country's public holidays (this year and next) as
    unavailable, as date overrides you can remove one by one.</p>
  <form method="post" action="/app/availability/${esc(set.set_id)}/holidays">
    <label>Country code <input name="country" list="country_list" value="US" placeholder="US" size="4" maxlength="2" required></label>
    <datalist id="country_list">
      <option value="US">United States</option>
      <option value="KR">South Korea</option>
      <option value="GB">United Kingdom</option>
      <option value="CA">Canada</option>
      <option value="DE">Germany</option>
      <option value="FR">France</option>
      <option value="JP">Japan</option>
      <option value="AU">Australia</option>
      <option value="IN">India</option>
      <option value="SG">Singapore</option>
    </datalist>
    <button class="submit" type="submit">Block holidays</button>
  </form>
</div>
<script>
function setPresetHours(p) {
  const days = ['MO','TU','WE','TH','FR','SA','SU'];
  days.forEach(function(d) {
    const s = document.querySelector('input[name="' + d + '_start"]');
    const e = document.querySelector('input[name="' + d + '_end"]');
    if (!s || !e) return;
    if (p === 'standard') {
      if (d === 'SA' || d === 'SU') { s.value = ''; e.value = ''; }
      else { s.value = '09:00'; e.value = '17:00'; }
    } else if (p === 'extended') {
      if (d === 'SA' || d === 'SU') { s.value = ''; e.value = ''; }
      else { s.value = '08:30'; e.value = '18:00'; }
    } else if (p === 'all') {
      s.value = '00:00'; e.value = '23:59';
    } else if (p === 'clear') {
      s.value = ''; e.value = '';
    }
  });
}
function toggleFullDayOff(isOff) {
  const s = document.getElementById('ov_start');
  const e = document.getElementById('ov_end');
  if (s && e) {
    if (isOff) { s.value = ''; e.value = ''; }
    else { s.value = '09:00'; e.value = '17:00'; }
  }
}
const ovDate = document.getElementById('ov_date');
if (ovDate && !ovDate.value) {
  const tmrw = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  ovDate.value = tmrw;
}
</script>
<style>
 .card{border:1px solid var(--line);border-radius:.5rem;padding:1rem;margin:1rem 0}
 .card h2{font-size:1.1rem;margin:0 0 .25rem}
 table.avail{border-collapse:collapse} table.avail th{text-align:left;padding-right:.5rem;font-weight:600}
 table.avail td{padding:.15rem .35rem}
 .linkish{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0}
 label{display:inline-block;margin-right:.75rem}
 input[type=date]{width:auto}
 .preset-pill{padding:.25rem .6rem;border-radius:6px;font-size:.78rem;font-weight:550;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
 .preset-pill:hover{background:var(--line-soft)}
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
  <div style="display:flex;gap:.35rem;margin-bottom:1rem;flex-wrap:wrap">
    <button type="button" class="preset-pill" onclick="setWfPreset('24h')">🔔 24h Reminder</button>
    <button type="button" class="preset-pill" onclick="setWfPreset('1h')">⏱️ 1h Reminder</button>
    <button type="button" class="preset-pill" onclick="setWfPreset('created')">📢 Instant Confirmation</button>
    <button type="button" class="preset-pill" onclick="setWfPreset('followup')">🙏 Post-Meeting Follow-up</button>
  </div>
  <form method="post" action="/app/workflows">
    <label for="wt">Name</label><input id="wt" name="title" required value="24-Hour Meeting Reminder">
    <label for="wg">When</label>
    <select id="wg" name="trigger">
      <option value="before_event" selected>Before the meeting</option>
      <option value="after_event">After the meeting</option>
      <option value="booking_created">When a booking is created</option>
      <option value="booking_cancelled">When a booking is cancelled</option>
      <option value="booking_rescheduled">When a booking is rescheduled</option>
    </select>
    <label for="wo">Offset (minutes, for before/after)</label>
    <input id="wo" name="offset_minutes" type="number" min="0" value="1440">
    <label for="wr">Send to</label>
    <select id="wr" name="recipient">
      <option value="booker" selected>The booker</option>
      <option value="owner">Me</option>
    </select>
    <label for="ws">Subject</label>
    <input id="ws" name="subject" value="Reminder: {{title}} tomorrow at {{start}}">
    <label for="wb">Body</label>
    <input id="wb" name="body" value="Hi {{name}}, friendly reminder for our upcoming meeting: {{title}} at {{start}}. Location: {{location}}">
    <button class="submit" type="submit">Create workflow</button>
  </form>
</div>
<script>
function setWfPreset(k) {
  const t = document.getElementById('wt');
  const g = document.getElementById('wg');
  const o = document.getElementById('wo');
  const r = document.getElementById('wr');
  const s = document.getElementById('ws');
  const b = document.getElementById('wb');
  if (k === '24h') {
    t.value = '24-Hour Meeting Reminder';
    g.value = 'before_event';
    o.value = '1440';
    r.value = 'booker';
    s.value = 'Reminder: {{title}} tomorrow at {{start}}';
    b.value = 'Hi {{name}}, friendly reminder for our upcoming meeting: {{title}} at {{start}}. Location: {{location}}';
  } else if (k === '1h') {
    t.value = '1-Hour Meeting Reminder';
    g.value = 'before_event';
    o.value = '60';
    r.value = 'booker';
    s.value = 'Starting in 1 hour: {{title}}';
    b.value = 'Hi {{name}}, our meeting {{title}} begins in 1 hour at {{start}}. Join here: {{location}}';
  } else if (k === 'created') {
    t.value = 'Instant Booking Notification';
    g.value = 'booking_created';
    o.value = '0';
    r.value = 'booker';
    s.value = 'Confirmed: {{title}} with {{name}}';
    b.value = 'Hi {{name}}, your booking for {{title}} on {{start}} is confirmed! Location: {{location}}';
  } else if (k === 'followup') {
    t.value = 'Post-Meeting Follow-up & Feedback';
    g.value = 'after_event';
    o.value = '15';
    r.value = 'booker';
    s.value = 'Thank you for meeting today!';
    b.value = 'Hi {{name}}, thank you for taking the time to meet today for {{title}}. Please let me know if you have any follow-up questions!';
  }
}
</script>
${CARD_CSS}
<style>select{width:100%;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;background:transparent;color:var(--fg);font:inherit}
.preset-pill{padding:.25rem .6rem;border-radius:6px;font-size:.78rem;font-weight:550;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
.preset-pill:hover{background:var(--line-soft)}
</style>`,
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
    ['custom', 'Custom note / Link'],
    ['phone', 'Phone call'],
    ['in_person', 'In person'],
    ['meet', 'Google Meet (auto-generated)'],
    ['teams', 'Microsoft Teams (auto-generated)'],
    ['zoom', 'Zoom (meeting / link)'],
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
  <label for="t">Title</label><input id="t" name="title" value="${esc(s.title || '30 Minute Meeting')}" placeholder="30 Minute Meeting" required>
  <label for="de">Description</label><input id="de" name="description" value="${esc(s.description ?? '')}" placeholder="Quick discussion, project review, or strategy sync.">
  <label for="du">Duration (minutes)</label>
  <div style="display:flex;gap:.35rem;margin:.35rem 0 .55rem;flex-wrap:wrap">
    <button type="button" class="preset-pill" onclick="setDurationPreset(15)">15 min</button>
    <button type="button" class="preset-pill" onclick="setDurationPreset(30)">30 min</button>
    <button type="button" class="preset-pill" onclick="setDurationPreset(45)">45 min</button>
    <button type="button" class="preset-pill" onclick="setDurationPreset(60)">60 min</button>
    <button type="button" class="preset-pill" onclick="setDurationPreset(90)">90 min</button>
  </div>
  <input id="du" name="duration_minutes" type="number" min="1" value="${s.duration_minutes || 30}">
  <label for="co">Accent color</label>
  <div style="display:flex;gap:.5rem;align-items:center;margin:.25rem 0">
    <input id="co" name="color" value="${esc(s.color ?? '#1a56db')}" placeholder="#1a56db" size="8">
    <input type="color" value="${esc(s.color ?? '#1a56db')}" style="width:36px;height:32px;padding:0;border:1px solid var(--line);border-radius:4px;cursor:pointer" onchange="document.getElementById('co').value=this.value">
  </div>
</div>
<div class="card"><h2>Where</h2>
  <label for="lk">Location</label>
  <select id="lk" name="location_kind">${kindOptions}</select>
  <label for="lv">Details (address, phone note, or link)</label>
  <input id="lv" name="location_value" value="${esc(s.location_value ?? '')}" placeholder="Optional link or room notes">
  <p class="notice">Google Meet & Microsoft Teams links are automatically minted per booking when calendar integration is connected.</p>
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
  <label for="gr">Start-time spacing (minutes)</label><input id="gr" name="granularity_minutes" type="number" min="1" value="${s.granularity_minutes || 15}">
  <label for="bb">Buffer before (minutes)</label><input id="bb" name="buffer_before_minutes" type="number" min="0" value="${s.buffer_before_minutes ?? 0}">
  <label for="ba">Buffer after (minutes)</label><input id="ba" name="buffer_after_minutes" type="number" min="0" value="${s.buffer_after_minutes ?? 5}">
  <label for="mn">Minimum notice (minutes)</label><input id="mn" name="minimum_notice_minutes" type="number" min="0" value="${s.minimum_notice_minutes ?? 240}">
  <p class="notice" style="margin-top:-.25rem">240 min = 4 hours minimum advance notice before booking.</p>
  <label for="mh">How far ahead people can book (days)</label><input id="mh" name="maximum_horizon_days" type="number" min="1" value="${s.maximum_horizon_days || 60}">
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
<script>
function setDurationPreset(mins) {
  const d = document.getElementById('du');
  const g = document.getElementById('gr');
  if (d) d.value = mins;
  if (g) g.value = mins <= 30 ? 15 : 30;
}
</script>
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
  <div style="margin-top:1.5rem;display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
    <form method="post" action="/app/calendar/google/connect" style="display:inline;margin:0">
      <button class="submit" type="submit" style="margin:0">Connect Google Calendar</button>
    </form>
    <form method="post" action="/app/calendar/microsoft/connect" style="display:inline;margin:0">
      <button class="submit" type="submit" style="margin:0">Connect Microsoft 365 / Outlook</button>
    </form>
  </div>
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

export function integrationsPage(opts: {
  googleConnected: boolean;
  googleEmail?: string;
  googleConnectionId?: string;
  msConnected: boolean;
  msEmail?: string;
  msConnectionId?: string;
  zoomConnected: boolean;
  /** Z4c · the connected account, so "Connected ✓" is checkable rather than asserted. */
  zoomAccount?: string;
  zoomStatus?: 'active' | 'error';
  zoomLink?: string;
  zoomAccountId?: string;
  baseUrl: string;
  notice?: string;
}): string {
  return SHELL(
    'Apps & Video Integrations',
    `<!--nav:integrations-->
<h1>Apps & Video Integrations</h1>
<p class="muted">Connect your video conferencing and calendar accounts so Pumasi can auto-mint meeting links and prevent double bookings.</p>
${opts.notice ? `<p class="ok" style="border-left-color:var(--accent);background:var(--accent-soft);color:var(--fg)">${esc(opts.notice)}</p>` : ''}

<div class="card" id="zoom-card">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
    <div style="display:flex;gap:.85rem;align-items:center">
      <div style="width:44px;height:44px;border-radius:10px;background:#2D8CFF;display:flex;align-items:center;justify-content:center;color:#fff">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 10l5-3v10l-5-3v-4z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
      </div>
      <div>
        <h2 style="margin:0 0 .2rem;font-size:1.1rem">Zoom Video</h2>
        <p class="muted" style="margin:0;font-size:.85rem">A new Zoom meeting room for each booked session, created when the booking is made. If Zoom cannot be reached we fall back — first to the static link below, then to your personal meeting room. The link goes out with the confirmation; your booking page never shows it before someone books.</p>
      </div>
    </div>
    <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
      <span class="pill ${opts.zoomConnected && opts.zoomStatus !== 'error' ? 'pill-ok' : ''}">${
        opts.zoomStatus === 'error' ? 'Reconnect needed'
        : opts.zoomConnected ? `Connected ✓${opts.zoomAccount ? ` — ${esc(opts.zoomAccount)}` : ''}`
        : 'Not Connected'}</span>
      <a href="/app/integrations/zoom/connect" class="submit" style="display:inline-block;padding:.35rem .75rem;font-size:.85rem;text-decoration:none">${opts.zoomConnected ? 'Reconnect Zoom' : 'Connect with Zoom ↗'}</a>
      ${opts.zoomConnected ? `<form method="post" action="/app/integrations/zoom/disconnect" style="margin:0;display:inline"><button class="submit btn-disconnect" type="submit">Disconnect</button></form>` : ''}
    </div>
  </div>

  <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--line)">
    <form method="post" action="/app/integrations/zoom">
      <details style="margin:.5rem 0" ${opts.notice || opts.zoomAccountId ? 'open' : ''}>
        <summary style="font-weight:600;font-size:.88rem;cursor:pointer">⚙ Zoom OAuth App & API Credentials</summary>
        <div style="margin-top:.75rem;display:grid;grid-template-columns:1fr;gap:.6rem;background:var(--line-soft);padding:1rem;border-radius:8px">
          <p class="muted" style="margin:0;font-size:.84rem">To enable direct 1-click Zoom user login, provide your Zoom Marketplace OAuth credentials. Redirect URI: <code>${esc(opts.baseUrl)}/oauth/zoom/callback</code></p>
          <label>Zoom Client ID <input name="zoom_client_id" placeholder="e.g. 74X_xxxxxx"></label>
          <label>Zoom Client Secret <input name="zoom_client_secret" type="password" placeholder="e.g. abc123xxxxxx"></label>
          <label>Zoom Account ID (for Server-to-Server, optional) <input name="zoom_account_id" value="${esc(opts.zoomAccountId ?? '')}" placeholder="e.g. abcdEFGH1234"></label>
          <label>Static fallback link (optional) <input id="zm_link" name="zoom_link" value="${esc(opts.zoomLink ?? '')}" placeholder="https://us02web.zoom.us/j/1234567890"></label>
          <p class="muted" style="margin:0;font-size:.8rem">Used only when a per-booking room cannot be created. It is sent with the confirmation and is never shown on your public booking page.</p>
          <button class="submit" type="submit" style="margin-top:.5rem">Save Zoom Credentials & Connect</button>
        </div>
      </details>
    </form>
  </div>
</div>

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
    <div style="display:flex;gap:.85rem;align-items:center">
      <div style="width:44px;height:44px;border-radius:10px;background:#e8f0fe;display:flex;align-items:center;justify-content:center;color:#1a73e8">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l5-3v10l-5-3v-4z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
      </div>
      <div>
        <h2 style="margin:0 0 .2rem;font-size:1.1rem">Google Meet</h2>
        <p class="muted" style="margin:0;font-size:.85rem">Automatically mints unique Google Meet links for every booking via Google Calendar integration.</p>
      </div>
    </div>
    <div>
      <span class="pill ${opts.googleConnected ? 'pill-ok' : ''}">${opts.googleConnected ? `Connected (${esc(opts.googleEmail || '')})` : 'Not Connected'}</span>
    </div>
  </div>
  <div style="margin-top:1rem;display:flex;gap:.75rem;align-items:center">
    <form method="post" action="/app/calendar/google/connect" style="margin:0;display:inline">
      <button class="submit" type="submit">${opts.googleConnected ? 'Reconnect Google Account' : 'Connect Google Calendar & Meet'}</button>
    </form>
    ${opts.googleConnected && opts.googleConnectionId ? `<form method="post" action="/app/calendar/${esc(opts.googleConnectionId)}/delete" style="margin:0;display:inline"><input type="hidden" name="return_to" value="integrations"><button class="submit btn-disconnect" type="submit">Disconnect</button></form>` : ''}
  </div>
</div>

<div class="card">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem">
    <div style="display:flex;gap:.85rem;align-items:center">
      <div style="width:44px;height:44px;border-radius:10px;background:#f3f2fd;display:flex;align-items:center;justify-content:center;color:#5c55be">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 10l4-2.5v9l-4-2.5v-4z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
      </div>
      <div>
        <h2 style="margin:0 0 .2rem;font-size:1.1rem">Microsoft Teams</h2>
        <p class="muted" style="margin:0;font-size:.85rem">Automatically mints Microsoft Teams online meeting links via Microsoft 365 Graph API.</p>
      </div>
    </div>
    <div>
      <span class="pill ${opts.msConnected ? 'pill-ok' : ''}">${opts.msConnected ? `Connected (${esc(opts.msEmail || '')})` : 'Not Connected'}</span>
    </div>
  </div>
  <div style="margin-top:1rem;display:flex;gap:.75rem;align-items:center">
    <form method="post" action="/app/calendar/microsoft/connect" style="margin:0;display:inline">
      <button class="submit" type="submit">${opts.msConnected ? 'Reconnect Microsoft Account' : 'Connect Microsoft 365 & Teams'}</button>
    </form>
    ${opts.msConnected && opts.msConnectionId ? `<form method="post" action="/app/calendar/${esc(opts.msConnectionId)}/delete" style="margin:0;display:inline"><input type="hidden" name="return_to" value="integrations"><button class="submit btn-disconnect" type="submit">Disconnect</button></form>` : ''}
  </div>
</div>

${CARD_CSS}
<style>
 .pill-ok{background:rgba(6,118,71,.12);color:var(--ok);border:1px solid rgba(6,118,71,.2)}
 #zoom-card .btn-disconnect{padding:.35rem .75rem;font-size:.85rem}
 .btn-disconnect{background:transparent;color:var(--danger,#b3261e);border:1px solid var(--danger,#b3261e)}
</style>`,
  );
}
