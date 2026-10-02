/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGREEMENT PAGE — findable.live/agree/<token> (served by the client-agreement edge function,
   proxied by findable-site functions/agree/[token].ts). One page per client.

   ⛔ THE WORDS ARE clientAgreement.ts's. This file lays them out as HTML; it adds only the page's own
   instructions, the form labels and the consent sentence (agreeConsentSentence, Paul's wording).
   ⛔ IT WORKS WITH NO JAVASCRIPT. A plain form POSTs back to the same address; the server validates
   and either signs or re-renders this page with the errors and the typed values kept.
   ⚠️ EXPLICIT .ts ON EVERY RELATIVE IMPORT — reached from an edge function.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  agreementVersion, agreeConsentSentence, clientDetailRows, CLIENT_AGREEMENT_TITLE, NOT_PROVIDED, ukDateTime,
  type AgreementFill, type AgreementRoute,
} from './clientAgreement.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** What the form holds (typed values, kept on a failed submit). */
export interface AgreementFormValues {
  legalName?: string; companyNumber?: string; contactName?: string; role?: string;
  address?: string; email?: string; phone?: string; websiteDomain?: string; agree?: boolean;
}

export type AgreementPageModel =
  | { mode: 'sign'; businessName: string; route: AgreementRoute; values: AgreementFormValues; errors: string[] }
  | { mode: 'accepted'; businessName: string; acceptedAtIso: string; acceptedBy: string; pdfHref: string; justSigned?: boolean; emailedTo?: string | null }
  | { mode: 'not_ready'; businessName: string }
  | { mode: 'blank' };

const CSS = `
  :root{ --ink:#0f172a; --muted:#475569; --line:#d7dce5; --tint:#f4f6f9; --navy:#0b1730; --gold:#f5b301; --bad:#b42318; --good:#0f766e; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:#eef1f5; color:var(--ink); font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .band{ background:var(--navy); color:#fff; padding:18px 20px; }
  .band .mark{ font-weight:900; font-size:20px; letter-spacing:-.01em; }
  .band .mark span{ color:var(--gold); }
  main{ max-width:780px; margin:0 auto; padding:20px 16px 60px; }
  .card{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:22px 22px; margin:0 0 16px; }
  h1{ font-size:24px; margin:0 0 6px; line-height:1.2; }
  h2{ font-size:15px; letter-spacing:.04em; text-transform:uppercase; margin:22px 0 8px; }
  h3{ font-size:15px; margin:18px 0 6px; }
  p{ margin:0 0 10px; }
  .muted{ color:var(--muted); }
  table{ width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:14px; }
  th,td{ border:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:top; }
  th{ background:var(--tint); width:38%; font-weight:700; }
  .svc{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:8px; padding:9px 11px; margin:6px 0; }
  .svc.on{ background:var(--tint); border-color:var(--ink); }
  .box{ flex:0 0 auto; width:18px; height:18px; border:2px solid var(--ink); border-radius:3px; text-align:center; line-height:14px; font-weight:900; margin-top:2px; }
  .clause{ display:flex; gap:10px; margin:0 0 8px; }
  .clause .n{ flex:0 0 36px; font-weight:800; }
  ul{ margin:0 0 8px 46px; padding:0; }
  .agreement{ max-height:none; }
  label{ display:block; font-weight:700; margin:12px 0 4px; font-size:14px; }
  label .opt{ font-weight:400; color:var(--muted); }
  input[type=text],input[type=email],input[type=tel],textarea{ width:100%; padding:10px 11px; border:1px solid #b9c1ce; border-radius:8px; font:inherit; }
  textarea{ min-height:64px; }
  .consent{ display:flex; gap:10px; align-items:flex-start; margin:18px 0 12px; padding:12px; background:#fff8e6; border:1px solid #f0d58a; border-radius:8px; }
  .consent input{ width:20px; height:20px; margin-top:2px; flex:0 0 auto; }
  .consent span{ font-weight:600; }
  button{ background:var(--gold); color:#111; border:0; border-radius:10px; padding:13px 20px; font:inherit; font-weight:800; font-size:16px; cursor:pointer; width:100%; }
  .errors{ border:1px solid #f1b5ad; background:#fdf0ee; color:var(--bad); border-radius:8px; padding:10px 12px; margin:0 0 12px; }
  .ok{ border:1px solid #9ad8cd; background:#eefaf7; color:var(--good); border-radius:8px; padding:12px 14px; margin:0 0 12px; font-weight:700; }
  a.btn{ display:inline-block; background:var(--navy); color:#fff; text-decoration:none; padding:11px 16px; border-radius:10px; font-weight:700; }
  @media (max-width:560px){ th{ width:auto; } .card{ padding:16px; } h1{ font-size:21px; } }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/>
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><header class="band"><div class="mark">Findable<span>.</span></div></header><main>${body}</main></body></html>`;
}

/** The agreement body, read-only. `fill` null = the blank version (no client). */
function agreementHtml(fill: AgreementFill | null): string {
  const v = agreementVersion();
  const rows = fill
    ? clientDetailRows(fill, v)
    : Object.values(v.clientDetailLabels).map((l) => [l, ''] as [string, string]);
  const svc = (r: AgreementRoute) => {
    const on = !!fill && fill.route === r;
    return `<div class="svc${on ? ' on' : ''}"><div class="box">${on ? '&#10003;' : ''}</div><div><b>${esc(v.services[r].name)}</b><br/>${esc(v.services[r].description)}</div></div>`;
  };
  const body = v.body.map((b) => {
    if (b.kind === 'heading') return `<h3>${esc(b.text)}</h3>`;
    if (b.kind === 'clause') return `<div class="clause"><div class="n">${esc(b.num)}</div><div>${b.lead ? `<b>${esc(b.lead)}</b> ` : ''}${esc(b.text)}</div></div>`;
    if (b.kind === 'bullet') return `<ul><li>${esc(b.text)}</li></ul>`;
    return `<p>${esc(b.text)}</p>`;
  }).join('\n');
  const sched = `<table><tr><th></th><th>${esc(v.schedule.columns[0])}</th><th>${esc(v.schedule.columns[1])}</th></tr>${
    v.schedule.rows.map(([a, b, c]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td><td>${esc(c)}</td></tr>`).join('')}</table>`;
  return `<div class="agreement">
    <h1>${esc(CLIENT_AGREEMENT_TITLE)}</h1>
    <p>${esc(v.intro)}</p>
    <h2>Findable details</h2>
    <table>${v.findableDetails.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join('')}</table>
    <h2>Client details</h2>
    <table>${rows.map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val === NOT_PROVIDED && fill ? 'Filled in from the form below' : val)}</td></tr>`).join('')}</table>
    <h2>Your service</h2>
    ${svc('build')}${svc('optimise')}
    <p class="muted">${esc(v.serviceNote)}</p>
    ${body}
    <h3>${esc(v.schedule.title)}</h3>
    ${sched}
    <p class="muted">Agreement version ${esc(v.version)}.</p>
  </div>`;
}

function field(name: keyof AgreementFormValues, label: string, value: string | undefined, type = 'text', optional = false, autocomplete = ''): string {
  const tag = name === 'address'
    ? `<textarea id="${name}" name="${name}" ${optional ? '' : 'required'} autocomplete="street-address">${esc(value)}</textarea>`
    : `<input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${optional ? '' : 'required'} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} maxlength="300"/>`;
  return `<label for="${name}">${esc(label)}${optional ? ' <span class="opt">(optional)</span>' : ''}</label>${tag}`;
}

export function agreementPageHtml(m: AgreementPageModel): string {
  if (m.mode === 'blank') {
    return shell(`Findable ${CLIENT_AGREEMENT_TITLE}`, `<div class="card">${agreementHtml(null)}
      <p class="muted">This is the general version of the agreement. Each client receives their own copy, with their business and service filled in, to accept online.</p></div>`);
  }
  if (m.mode === 'not_ready') {
    return shell('Your agreement is not ready yet', `<div class="card"><h1>Your agreement is not ready yet</h1>
      <p>We are still setting up the agreement for ${esc(m.businessName)}. We will send you the link as soon as it is ready.</p>
      <p class="muted">Any questions, email paul@findable.live.</p></div>`);
  }
  if (m.mode === 'accepted') {
    return shell('Agreement accepted', `<div class="card">
      ${m.justSigned ? '<div class="ok">Thank you. Your agreement is signed.</div>' : ''}
      <h1>Agreement accepted</h1>
      <p>Accepted on ${esc(ukDateTime(m.acceptedAtIso))} by ${esc(m.acceptedBy)}, for ${esc(m.businessName)}.</p>
      ${m.justSigned ? (m.emailedTo ? `<p>We have emailed a copy of exactly what you agreed to, to ${esc(m.emailedTo)}.</p>` : '<p>Please download your copy below and keep it safe.</p>') : ''}
      <p><a class="btn" href="${esc(m.pdfHref)}">Download your signed copy (PDF)</a></p>
      <p class="muted">Any questions, email paul@findable.live.</p></div>`);
  }
  const v = m.values;
  const fill: AgreementFill = { businessName: m.businessName, route: m.route };
  return shell(`${CLIENT_AGREEMENT_TITLE} for ${m.businessName}`, `
    <div class="card"><p class="muted">Please read your agreement, fill in your details at the bottom, and sign.</p>${agreementHtml(fill)}</div>
    <form class="card" method="post" action="">
      <h2 style="margin-top:0">Your details and signature</h2>
      ${m.errors.length ? `<div class="errors"><b>Please check:</b><br/>${m.errors.map(esc).join('<br/>')}</div>` : ''}
      ${field('legalName', 'Legal name of the business', v.legalName, 'text', false, 'organization')}
      ${field('companyNumber', 'Company number, if a company', v.companyNumber, 'text', true)}
      ${field('contactName', 'Your full name', v.contactName, 'text', false, 'name')}
      ${field('role', 'Your role', v.role, 'text', false, 'organization-title')}
      ${field('address', 'Business address', v.address)}
      ${field('email', 'Email for notices', v.email, 'email', false, 'email')}
      ${field('phone', 'Phone', v.phone, 'tel', false, 'tel')}
      ${field('websiteDomain', 'Website domain', v.websiteDomain, 'text', true, 'url')}
      <div class="consent"><input id="agree" type="checkbox" name="agree" value="yes" ${v.agree ? 'checked' : ''} required/>
        <label for="agree" style="margin:0;font-weight:600">${esc(agreeConsentSentence(m.businessName))}</label></div>
      <button type="submit">I agree and sign</button>
    </form>`);
}

/** The one refusal page for a token that does not exist (never says why). */
export function agreementUnavailableHtml(): string {
  return shell('Agreement unavailable', `<div class="card"><h1>Agreement unavailable</h1>
    <p>This link isn&rsquo;t valid. If you were expecting an agreement from Findable, email paul@findable.live.</p></div>`);
}
