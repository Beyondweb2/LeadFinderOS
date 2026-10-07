/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGREEMENT PAGE — findable.live/agree/<token> (served by the client-agreement edge function,
   proxied by findable-site functions/agree/[token].ts). One page per client.

   🔴 v3 (2026-10-05): THIS PAGE IS THE SIGN-UP. The client reaches it from their one sign-up link, BEFORE
   paying: the chosen plan, the key commercial points, the FULL agreement, their details, then
   "I agree and sign" (clause 1.2). Only after that does "Continue to secure payment" open, and the
   Stripe session it opens is refused by findable-checkout unless that signature exists.
   🔴 REDESIGNED 2026-10-07 (docs/pre-sales-certification/client-signup-agreement-flow.md): the same
   findable.live look as the setup page (dark ground, yellow accent), three visible steps (read → sign →
   pay, with pay LOCKED until signed), the plan summary from src/lib/signupSummary.ts (Today / Then /
   Minimum term / After the term), today's signing date, Findable's details already filled, and the
   client's details pre-filled from what we hold (editable). Nothing legal changed: the same agreement
   words, the same three ticks, the same sentences, the same button.
   ⛔ THE WORDS ARE clientAgreement.ts's. This file lays them out as HTML; it adds only the page's own
      instructions, the form labels and the consent sentences (agreeConsentSentence, Paul's wording).
   ⛔ NOTHING IS PRE-TICKED. The agree box and the authority box start empty on a fresh page; a failed
      submit keeps only what the client themselves ticked.
   ⛔ IT WORKS WITH NO JAVASCRIPT. Plain forms POST back to the same address (the findable.live proxy
      forwards only the token and the body), and "Continue to secure payment" answers with a page that
      forwards to Stripe (a meta refresh plus a plain link) — the proxy never sees a redirect. The one
      script only greys the sign button until both required ticks are given; without it, `required`
      does the same job.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from an edge function.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  agreementSectionTitles, agreementVersion, agreeConsentSentence, clientDetailRows, CLIENT_AGREEMENT_TITLE, CLIENT_AGREEMENT_VERSION, NOT_PROVIDED, ukDateTime,
  type AgreementFill, type AgreementRoute,
} from './clientAgreement.ts';
import { afterTermSummaryWords } from './planTerms.ts';
import { FINDABLE_CONTINUING_GBP, FINDABLE_MONTHLY_GBP, FINDABLE_SETUP_PRICE_GBP, MONTHLY_START_V3_WORDS, SERVICE_ROUTE_NAME, totalPaymentsFor } from './findableOffer.ts';
import { planSummaryRows, signingDayWords } from './signupSummary.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
/** Escaped text with any email address kept out of Cloudflare's obfuscation (see the note below). */
const escMail = (s: unknown) => esc(s).replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g, '<!--email_off-->$1<!--/email_off-->');

/** What the form holds (typed values, kept on a failed submit). */
export interface AgreementFormValues {
  legalName?: string; companyNumber?: string; contactName?: string; role?: string;
  address?: string; email?: string; phone?: string; websiteDomain?: string;
  agree?: boolean; authority?: boolean; marketingOptOut?: boolean;
}

export type AgreementPageModel =
  /** `signupId` set = the v3 sign-up (signed BEFORE payment); absent = a legacy post-payment v1 signature.
   *  `nowIso` = the moment the page is served — the signing date it shows (the stored acceptance time is
   *  the DATABASE's, taken when they sign; this is only the preview of that day). */
  | { mode: 'sign'; businessName: string; route: AgreementRoute; values: AgreementFormValues; errors: string[]; version?: string; signupId?: string | null; nowIso?: string }
  | { mode: 'accepted'; businessName: string; acceptedAtIso: string; acceptedBy: string; pdfHref: string; justSigned?: boolean; emailedTo?: string | null;
      /** v3: the sign-up still to pay for (shows "Continue to secure payment"), and an error from the last try. */
      payFor?: { signupId: string; route: AgreementRoute } | null; payError?: string | null; paid?: boolean;
      /** The version they signed (shown beside the date). */
      version?: string }
  | { mode: 'redirect'; url: string }
  | { mode: 'not_ready'; businessName: string; message?: string }
  | { mode: 'blank' };

/* ⚠️ findable.live runs Cloudflare email obfuscation: an address in the HTML becomes "[email protected]" plus a
   decoder script. Every address this page prints sits inside <!--email_off--> markers so it reads as typed.
   ⛔ THE PALETTE IS findable.live's SETUP PAGE (global.css body.theme-onboard): #0A0A0C ground, #F7F7F5 ink,
   #F5B301 accent — so the step after "Get started" reads as the same product, not a separate legal form. */
const CSS = `
  :root{ --page:#0A0A0C; --panel:rgba(255,255,255,.05); --panel2:rgba(255,255,255,.08); --line:rgba(255,255,255,.13);
    --ink:#F7F7F5; --muted:#A6AAB4; --faint:#797D86; --gold:#F5B301; --bad:#FF6B6B; --good:#4ADE80; }
  *{ box-sizing:border-box; }
  html{ -webkit-text-size-adjust:100%; }
  body{ margin:0; background:var(--page); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; overflow-x:hidden; }
  a{ color:var(--gold); }
  .band{ border-bottom:1px solid var(--line); padding:18px 16px; }
  .band .in{ max-width:760px; margin:0 auto; display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
  .band .mark{ font-weight:900; font-size:20px; letter-spacing:-.02em; }
  .band .mark span{ color:var(--gold); }
  .band .tag{ font:700 11px/1 ui-monospace,monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
  main{ max-width:760px; margin:0 auto; padding:24px 16px 72px; }
  .card{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:22px; margin:0 0 16px; }
  .eyebrow{ font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); margin:0 0 8px; }
  .eyebrow.gold{ color:var(--gold); }
  h1{ font-size:clamp(24px,5.6vw,32px); font-weight:900; line-height:1.12; letter-spacing:-.015em; margin:0 0 10px; }
  h2{ font-size:13px; letter-spacing:.08em; text-transform:uppercase; margin:22px 0 8px; color:var(--muted); }
  h3{ font-size:15px; margin:18px 0 6px; }
  p{ margin:0 0 10px; }
  .muted{ color:var(--muted); }
  .small{ font-size:14px; }
  .steps{ display:flex; gap:8px; margin:14px 0 4px; padding:0; list-style:none; flex-wrap:wrap; }
  .steps li{ flex:1 1 0; min-width:92px; border:1px solid var(--line); border-radius:10px; padding:8px 10px; font-size:13px; font-weight:700; color:var(--muted); }
  .steps li b{ display:block; font:800 11px/1.4 ui-monospace,monospace; color:var(--faint); }
  .steps li.now{ border-color:var(--gold); color:var(--ink); background:rgba(245,179,1,.08); }
  .steps li.done{ color:var(--good); border-color:rgba(74,222,128,.4); }
  .sum{ margin:6px 0 0; padding:0; }
  .sum div{ display:grid; grid-template-columns:132px 1fr; gap:12px; padding:10px 0; border-top:1px solid var(--line); }
  .sum div:first-child{ border-top:0; }
  .sum dt{ font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); padding-top:2px; }
  .sum dd{ margin:0; }
  .sum .big{ font-size:20px; font-weight:900; color:var(--gold); }
  table{ width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:14px; }
  th,td{ border:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
  th{ background:var(--panel2); width:38%; font-weight:700; }
  .svc{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:10px; padding:9px 11px; margin:6px 0; }
  .svc.on{ background:rgba(245,179,1,.08); border-color:var(--gold); }
  .box{ flex:0 0 auto; width:18px; height:18px; border:2px solid var(--ink); border-radius:3px; text-align:center; line-height:14px; font-weight:900; margin-top:2px; color:var(--gold); }
  .clause{ display:flex; gap:10px; margin:0 0 8px; }
  .clause .n{ flex:0 0 40px; font-weight:800; }
  .item{ display:flex; gap:10px; margin:0 0 6px 50px; }
  .item .n{ flex:0 0 26px; }
  ul{ margin:0 0 8px 50px; padding:0; }
  .keys{ background:rgba(245,179,1,.07); border:1px solid rgba(245,179,1,.35); border-radius:12px; padding:12px 14px; margin:12px 0; }
  .keys ul{ margin:6px 0 0 18px; }
  .offer{ border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin:0 0 12px; background:var(--panel2); }
  .reader{ max-height:460px; overflow:auto; border:1px solid var(--line); border-radius:12px; padding:16px; background:rgba(0,0,0,.25); font-size:14.5px; }
  .reader:focus{ outline:2px solid var(--gold); outline-offset:2px; }
  .reader h1{ font-size:20px; }
  label{ display:block; font-weight:700; margin:14px 0 6px; font-size:14px; }
  label .opt{ font-weight:400; color:var(--muted); }
  .grid{ display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
  .grid .full{ grid-column:1 / -1; }
  input[type=text],input[type=email],input[type=tel],textarea{ width:100%; padding:12px 13px; border:1px solid var(--line); border-radius:10px; font:inherit; background:rgba(255,255,255,.06); color:var(--ink); }
  input:focus,textarea:focus{ outline:2px solid var(--gold); outline-offset:1px; }
  textarea{ min-height:68px; }
  .consent{ display:flex; gap:12px; align-items:flex-start; margin:12px 0; padding:14px; background:rgba(245,179,1,.07); border:1px solid rgba(245,179,1,.35); border-radius:12px; }
  .consent.plain{ background:transparent; border-color:var(--line); }
  .consent input{ width:24px; height:24px; margin:0; flex:0 0 auto; accent-color:var(--gold); }
  .consent label{ margin:0; font-weight:600; font-size:15px; cursor:pointer; }
  button,.btn{ display:block; text-align:center; background:var(--gold); color:#0A0A0C; border:0; border-radius:12px; padding:15px 20px; font:inherit; font-weight:800; font-size:17px; cursor:pointer; width:100%; text-decoration:none; }
  button[disabled],.btn.off{ opacity:.4; cursor:not-allowed; }
  .btn.ghost{ background:transparent; color:var(--ink); border:1px solid var(--line); font-weight:700; font-size:15px; }
  .locked{ border:1px dashed var(--line); border-radius:12px; padding:14px; margin-top:14px; }
  .errors{ border:1px solid rgba(255,107,107,.5); background:rgba(255,107,107,.08); color:var(--bad); border-radius:12px; padding:12px 14px; margin:0 0 12px; }
  .ok{ border:1px solid rgba(74,222,128,.45); background:rgba(74,222,128,.08); color:var(--good); border-radius:12px; padding:12px 14px; margin:0 0 12px; font-weight:700; }
  .row{ display:flex; gap:10px; flex-wrap:wrap; }
  .row > *{ flex:1 1 200px; }
  @media (max-width:560px){ .card{ padding:16px; } th{ width:auto; } .item{ margin-left:22px; } ul{ margin-left:22px; } .clause .n{ flex-basis:34px; }
    .grid{ grid-template-columns:1fr; } .sum div{ grid-template-columns:1fr; gap:2px; } .reader{ max-height:380px; padding:12px; } }
`;

function shell(title: string, body: string, head = '', script = ''): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/><meta name="color-scheme" content="dark"/>${head}
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><header class="band"><div class="in"><div class="mark">Findable<span>.</span></div><div class="tag">Agreement</div></div></header><main>${body}</main>${script}</body></html>`;
}

/** The three steps: read and check → sign → pay. `at` is the one in progress. */
function stepsHtml(at: 'sign' | 'pay' | 'paid'): string {
  const s = (n: number, label: string, state: string) => `<li class="${state}"><b>STEP ${n}</b>${label}</li>`;
  return `<ol class="steps" aria-label="Your sign-up">${
    s(1, 'Check your plan', at === 'sign' ? 'now' : 'done')}${
    s(2, 'Sign the agreement', at === 'sign' ? 'now' : 'done')}${
    s(3, 'Secure payment', at === 'pay' ? 'now' : at === 'paid' ? 'done' : '')}</ol>`;
}

/** The agreement body, read-only. `fill` null = the blank version (no client). */
function agreementHtml(fill: AgreementFill | null, version: string = CLIENT_AGREEMENT_VERSION): string {
  const v = agreementVersion(version);
  const titles = agreementSectionTitles(v);
  const rows = fill
    ? clientDetailRows(fill, v)
    : Object.values(v.clientDetailLabels).map((l) => [l, ''] as [string, string]);
  const svc = (r: AgreementRoute) => {
    const on = !!fill && fill.route === r;
    return `<div class="svc${on ? ' on' : ''}"><div class="box">${on ? '&#10003;' : ''}</div><div><b>${esc(v.services[r].name)}</b><br/>${esc(v.services[r].description)}</div></div>`;
  };
  const body = v.body.map((b) => {
    if (b.kind === 'heading') return `<h3>${esc(b.text)}</h3>`;
    if (b.kind === 'clause') return `<div class="clause"><div class="n">${esc(b.num)}</div><div>${b.lead ? `<b>${esc(b.lead)}</b> ` : ''}${escMail(b.text)}</div></div>`;
    if (b.kind === 'item') return `<div class="item"><div class="n">${esc(b.label)}</div><div>${escMail(b.text)}</div></div>`;
    if (b.kind === 'bullet') return `<ul><li>${esc(b.text)}</li></ul>`;
    return `<p>${esc(b.text)}</p>`;
  }).join('\n');
  const sched = `<table><tr><th></th><th>${esc(v.schedule.columns[0])}</th><th>${esc(v.schedule.columns[1])}</th></tr>${
    v.schedule.rows.map(([a, b, c]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</table>`;
  const keys = v.keyPoints ? `<div class="keys"><b>${esc(v.keyPoints.title)}</b><ul>${v.keyPoints.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';
  return `<div class="agreement">
    <h1>${esc(CLIENT_AGREEMENT_TITLE)}</h1>
    <p>${esc(v.intro)}</p>
    <h2>${esc(titles.findable)}</h2>
    <table>${v.findableDetails.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${escMail(val)}</td></tr>`).join('')}</table>
    <h2>${esc(titles.client)}</h2>
    <table>${rows.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${escMail(val === NOT_PROVIDED && fill ? 'Filled in from the form below' : val)}</td></tr>`).join('')}</table>
    <h2>${esc(titles.service)}</h2>
    ${svc('build')}${svc('optimise')}
    ${v.serviceNote !== undefined ? `<p class="muted">${esc(v.serviceNote)}</p>` : ''}
    ${keys}
    ${body}
    <h3>${esc(v.schedule.title)}</h3>
    ${sched}
    <p class="muted">Agreement version ${esc(v.version)}.</p>
  </div>`;
}

/** The chosen plan as a summary — Today / Then / Minimum term / After the term (src/lib/signupSummary.ts),
 *  shown above the agreement on the sign-up. A version without a checked summary falls back to the plain
 *  offer line built from the same constants. */
function offerHtml(route: AgreementRoute, version: string = CLIENT_AGREEMENT_VERSION, signingIso?: string): string {
  const rows = planSummaryRows(route, version);
  const n = totalPaymentsFor(route);
  const dated = signingIso
    ? `<div><dt>Agreement date</dt><dd>${esc(signingDayWords(signingIso))}, the day you sign. Version ${esc(version)} of our ${esc(CLIENT_AGREEMENT_TITLE)}.</dd></div>`
    : '';
  if (!rows) {
    return `<div class="offer"><p class="eyebrow gold">Your offer: ${esc(SERVICE_ROUTE_NAME[route])}</p>
      <p>£${FINDABLE_SETUP_PRICE_GBP} today, then £${FINDABLE_MONTHLY_GBP} a month starting ${esc(MONTHLY_START_V3_WORDS)}.
      ${n} payments in total (the minimum term). ${esc(version === 'v3' ? `Then £${FINDABLE_CONTINUING_GBP} a month until you cancel with 30 days' notice.` : afterTermSummaryWords(route))}</p></div>`;
  }
  return `<div class="offer"><p class="eyebrow gold">Your offer: ${esc(SERVICE_ROUTE_NAME[route])}</p>
    <dl class="sum">${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd${r.key === 'today' ? ' class="big"' : ''}>${esc(r.value)}</dd></div>`).join('')}${dated}</dl></div>`;
}

/** The authority sentence (clause 1.4), its own box beside the signature. */
export function authoritySentence(businessName: string): string {
  return `I confirm I am entering this agreement for ${businessName}, not as a private consumer, and that I have authority to bind the business.`;
}
/** Clause 12.4 — the opt-out offered "when you accept this agreement". Unticked = no opt-out. */
export const MARKETING_OPT_OUT_SENTENCE = 'Please do not send me information about other Findable services.';

function field(name: keyof AgreementFormValues, label: string, value: string | undefined, type = 'text', optional = false, autocomplete = '', full = false): string {
  const tag = name === 'address'
    ? `<textarea id="${name}" name="${name}" ${optional ? '' : 'required'} autocomplete="street-address">${esc(value)}</textarea>`
    : `<input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${optional ? '' : 'required'} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} maxlength="300"/>`;
  return `<div${full ? ' class="full"' : ''}><label for="${name}">${esc(label)}${optional ? ' <span class="opt">(optional)</span>' : ''}</label>${tag}</div>`;
}

const CONTACT = '<p class="muted small">Any questions, email <!--email_off-->paul@findable.live<!--/email_off-->.</p>';

/* The sign button stays greyed until BOTH required ticks are given (progressive: `required` already
   refuses an unticked submit without JavaScript). It never ticks anything and never submits. */
const SIGN_SCRIPT = `<script>(function(){var f=document.getElementById('sign');if(!f)return;var b=f.querySelector('button[type=submit]');
var need=[].slice.call(f.querySelectorAll('input[type=checkbox][required]'));function u(){var ok=need.every(function(x){return x.checked});b.disabled=!ok;}
need.forEach(function(x){x.addEventListener('change',u)});u();})();</script>`;

export function agreementPageHtml(m: AgreementPageModel): string {
  if (m.mode === 'blank') {
    return shell(`Findable ${CLIENT_AGREEMENT_TITLE}`, `<div class="card">${agreementHtml(null)}
      <p class="muted">This is the general version of the agreement. Each client receives their own copy, with their business and service filled in, to accept online before they pay.</p></div>`);
  }
  if (m.mode === 'redirect') {
    /* The proxy passes HTML through; a meta refresh moves the browser on, and the link is there for
       anyone whose browser does not follow it. */
    return shell('Continuing to secure payment', `<div class="card"><p class="eyebrow gold">Step 3 · Secure payment</p><h1>Continuing to secure payment…</h1>
      <p>If nothing happens, <a href="${esc(m.url)}">continue to the secure payment page</a>.</p></div>`,
      `<meta http-equiv="refresh" content="0;url=${esc(m.url)}"/>`);
  }
  if (m.mode === 'not_ready') {
    return shell('Your agreement is not ready yet', `<div class="card"><h1>Your agreement is not ready yet</h1>
      <p>${esc(m.message ?? `We are still setting up the agreement for ${m.businessName}. We will send you the link as soon as it is ready.`)}</p>
      ${CONTACT}</div>`);
  }
  if (m.mode === 'accepted') {
    const pay = m.payFor && !m.paid ? `<form method="post" action="" class="card">
        <input type="hidden" name="action" value="pay"/><input type="hidden" name="s" value="${esc(m.payFor.signupId)}"/>
        <p class="eyebrow gold">Step 3 · Secure payment</p>
        <h2 style="margin-top:0;color:var(--ink);font-size:20px;text-transform:none;letter-spacing:0">Next: your initial payment</h2>
        ${m.payError ? `<div class="errors">${esc(m.payError)}</div>` : ''}
        ${offerHtml(m.payFor.route, m.version)}
        <button type="submit">Continue to secure payment</button>
        <p class="muted small" style="margin-top:10px">Payment is taken by Stripe and your card is saved for the monthly payments in your agreement. No monthly payment is taken until the day after your refund window closes.</p>
      </form>` : '';
    return shell('Agreement signed', `${m.payFor && !m.paid ? stepsHtml('pay') : m.paid ? stepsHtml('paid') : ''}<div class="card">
      ${m.justSigned ? '<div class="ok">Thank you. Your agreement is signed.</div>' : ''}
      ${m.paid ? '<div class="ok">Your payment has been received. Thank you.</div>' : ''}
      <p class="eyebrow">${esc(CLIENT_AGREEMENT_TITLE)}${m.version ? ` · version ${esc(m.version)}` : ''}</p>
      <h1>Agreement accepted</h1>
      <p>Accepted on ${esc(ukDateTime(m.acceptedAtIso))} by ${esc(m.acceptedBy)}, for ${esc(m.businessName)}.</p>
      ${m.justSigned ? (m.emailedTo ? `<p>We have emailed a copy of exactly what you agreed to, to <!--email_off-->${esc(m.emailedTo)}<!--/email_off-->.</p>` : '<p>Please download your copy below and keep it safe.</p>') : ''}
      <p><a class="btn ghost" href="${esc(m.pdfHref)}">Download your signed copy (PDF)</a></p>
      ${CONTACT}</div>${pay}`);
  }
  const v = m.values;
  const version = m.version ?? CLIENT_AGREEMENT_VERSION;
  const fill: AgreementFill = { businessName: m.businessName, route: m.route };
  const v3 = !!m.signupId;
  return shell(`${CLIENT_AGREEMENT_TITLE} for ${m.businessName}`, `
    ${v3 ? stepsHtml('sign') : ''}
    <div class="card">
      <p class="eyebrow gold">${v3 ? 'Before we take payment' : esc(CLIENT_AGREEMENT_TITLE)}</p>
      <h1>${v3 ? `Your agreement for ${esc(m.businessName)}` : `Please read and sign your agreement`}</h1>
      <p class="muted">${v3
        ? 'Before we take payment, please read and accept the Client Service Agreement. We have filled in what we already know: check your plan, read the agreement, confirm your details and sign. You pay only after you have signed.'
        : 'Please read your agreement, check your details at the bottom, and sign.'}</p>
      ${v3 ? offerHtml(m.route, version, m.nowIso ?? new Date().toISOString()) : ''}
    </div>
    <div class="card">
      <p class="eyebrow">Read the agreement</p>
      <p class="muted small">The full ${esc(CLIENT_AGREEMENT_TITLE)} (version ${esc(version)}), with your business and plan filled in. Scroll to read it all.</p>
      <div class="reader" tabindex="0" role="region" aria-label="${esc(CLIENT_AGREEMENT_TITLE)}">${agreementHtml(fill, version)}</div>
    </div>
    <form id="sign" class="card" method="post" action="">
      <p class="eyebrow">Your details and signature</p>
      <p class="muted small">We have filled in what we already hold. Please check it and correct anything that is wrong.</p>
      ${m.errors.length ? `<div class="errors"><b>Please check:</b><br/>${m.errors.map(esc).join('<br/>')}</div>` : ''}
      ${v3 ? `<input type="hidden" name="s" value="${esc(m.signupId)}"/>` : ''}
      <div class="grid">
      ${field('contactName', 'Your full name', v.contactName, 'text', false, 'name')}
      ${field('role', 'Your role', v.role, 'text', false, 'organization-title')}
      ${field('legalName', 'Legal name of the business', v.legalName, 'text', false, 'organization')}
      ${field('companyNumber', 'Company number, if a company', v.companyNumber, 'text', true)}
      ${field('email', 'Email for notices', v.email, 'email', false, 'email')}
      ${field('phone', 'Phone', v.phone, 'tel', false, 'tel')}
      ${field('address', 'Business address', v.address, 'text', false, '', true)}
      ${field('websiteDomain', 'Website domain', v.websiteDomain, 'text', true, 'url', true)}
      </div>
      ${v3 ? `<div class="consent"><input id="authority" type="checkbox" name="authority" value="yes" ${v.authority ? 'checked' : ''} required/>
        <label for="authority">${esc(authoritySentence(m.businessName))}</label></div>` : ''}
      <div class="consent"><input id="agree" type="checkbox" name="agree" value="yes" ${v.agree ? 'checked' : ''} required/>
        <label for="agree">${esc(agreeConsentSentence(m.businessName, version))}</label></div>
      ${v3 ? `<div class="consent plain"><input id="marketingOptOut" type="checkbox" name="marketingOptOut" value="yes" ${v.marketingOptOut ? 'checked' : ''}/>
        <label for="marketingOptOut" style="font-weight:400">${esc(MARKETING_OPT_OUT_SENTENCE)} <span class="opt">(optional, clause ${version === 'v4' ? '12.5' : '12.4'})</span></label></div>` : ''}
      <button type="submit">${version === 'v4' ? 'Accept the agreement' : 'I agree and sign'}</button>
      ${v3 ? `<div class="locked" aria-label="Step 3, secure payment, opens after you sign">
        <p class="eyebrow" style="margin:0 0 8px">Step 3 · Secure payment</p>
        <span class="btn off" role="button" aria-disabled="true">Continue to payment</span>
        <p class="muted small" style="margin:8px 0 0">Opens as soon as you have signed. Nothing is charged until then.</p></div>` : ''}
    </form>${CONTACT}`, '', SIGN_SCRIPT);
}

/** The one refusal page for a token that does not exist (never says why). */
export function agreementUnavailableHtml(): string {
  return shell('Agreement unavailable', `<div class="card"><h1>Agreement unavailable</h1>
    <p>This link isn&rsquo;t valid. If you were expecting an agreement from Findable, email <!--email_off-->paul@findable.live<!--/email_off-->.</p></div>`);
}
