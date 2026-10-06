/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CLIENT'S ONBOARDING PAGE, AS HTML (findable.live/details/<token>, served by fn client-onboarding through
   findable-site's proxy). 2026-10-07, docs/pre-sales-certification/sales-close-handoff-australia.md.

   A plain HTML form that works with no JavaScript (a few lines only show / hide the follow-up questions), on a
   phone first. The questions are the link's own snapshot (clientOnboardingForm.ts). ⛔ NO PAYMENT: no price, no
   card, no Stripe, no "pay" button anywhere on this page — it ends with "Thanks, that's everything".
   Pure. Edge-reachable: relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { FINDABLE_CONTACT_EMAIL } from './findableOffer.ts';
import { onboardingQuestionDef, type OnbKey, type OnbQuestion } from './clientOnboardingForm.ts';

const esc = (v: unknown): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const CSS = `
  :root{ --ink:#0f172a; --muted:#475569; --line:#d7dce5; --tint:#f4f6f9; --navy:#0b1730; --gold:#f5b301; --blue:#1d4ed8; --bad:#b42318; --good:#0f766e; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:#eef1f5; color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .band{ background:var(--navy); color:#fff; padding:18px 20px; }
  .band .mark{ font-weight:900; font-size:20px; letter-spacing:-.01em; }
  .band .mark span{ color:var(--gold); }
  main{ max-width:640px; margin:0 auto; padding:20px 16px 60px; }
  .card{ background:#fff; border:1px solid var(--line); border-radius:14px; padding:20px; margin:0 0 16px; }
  h1{ font-size:22px; margin:0 0 6px; line-height:1.25; }
  p{ margin:0 0 10px; }
  .muted{ color:var(--muted); font-size:14px; }
  .q{ margin:0 0 18px; }
  .q > label, .q > .lab{ display:block; font-weight:700; margin:0 0 4px; }
  .help{ color:var(--muted); font-size:14px; margin:0 0 6px; }
  .confirm{ background:#fff8e6; border:1px solid #f0d58a; border-radius:8px; padding:6px 10px; font-size:13px; margin:0 0 6px; }
  input[type=text],input[type=email],input[type=tel],textarea{ width:100%; font:inherit; padding:11px 12px; border:1px solid var(--line); border-radius:10px; background:#fff; color:var(--ink); }
  textarea{ min-height:90px; resize:vertical; }
  input:focus,textarea:focus{ outline:2px solid #93c5fd; border-color:var(--blue); }
  .opts{ display:grid; gap:8px; }
  .opt{ display:flex; gap:10px; align-items:flex-start; border:1px solid var(--line); border-radius:10px; padding:11px 12px; cursor:pointer; }
  .opt input{ margin-top:4px; flex:0 0 auto; }
  .err{ color:var(--bad); font-size:14px; margin:4px 0 0; font-weight:600; }
  .q.bad input,.q.bad textarea,.q.bad .opt{ border-color:var(--bad); }
  .sub{ border-left:3px solid var(--line); padding-left:12px; margin-left:4px; }
  button{ width:100%; font:inherit; font-weight:800; font-size:17px; padding:14px 16px; border:0; border-radius:12px; background:var(--blue); color:#fff; cursor:pointer; }
  .ok{ color:var(--good); font-weight:800; }
  .req{ color:var(--bad); }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet"/>
<title>${esc(title)}</title><style>${CSS}</style></head>
<body><header class="band"><div class="mark">Findable<span>.</span></div></header><main>${body}</main></body></html>`;
}

export function onboardingUnavailableHtml(): string {
  return shell('Link unavailable', `<div class="card"><h1>This link isn't available</h1><p>It may have been replaced by a newer one. If you were expecting a form from Findable, email <a href="mailto:${esc(FINDABLE_CONTACT_EMAIL)}">${esc(FINDABLE_CONTACT_EMAIL)}</a>.</p></div>`);
}

export function onboardingDoneHtml(businessName: string, already = false): string {
  return shell('Thank you', `<div class="card"><h1 class="ok">Thanks — that's everything.</h1><p>${already ? 'We already have your answers' : `We've saved your answers for ${esc(businessName)}`}. Paul will be in touch if anything else is needed.</p><p class="muted">You can close this page. There's nothing to pay here.</p></div>`);
}

export function onboardingNothingHtml(businessName: string): string {
  return shell('Nothing needed', `<div class="card"><h1>Nothing needed right now</h1><p>We already have everything we need for ${esc(businessName)}. Thank you!</p></div>`);
}

function field(q: OnbQuestion, value: string, error: string | undefined): string {
  const d = onboardingQuestionDef(q.key);
  if (!d) return '';
  const id = `f_${q.key}`;
  const req = d.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const help = d.help ? `<p class="help">${esc(d.help)}</p>` : '';
  const confirm = q.confirm ? `<p class="confirm">We have this already — please check it and change anything that's wrong.</p>` : '';
  const err = error ? `<p class="err" role="alert">${esc(error)}</p>` : '';
  const show = d.showIf ? ` data-show-key="${esc(d.showIf.key)}" data-show-in="${esc(d.showIf.in.join(','))}"` : '';
  const cls = `q${error ? ' bad' : ''}${d.showIf ? ' sub' : ''}`;
  if (d.kind === 'choice') {
    const opts = d.options!.map((o) => `<label class="opt"><input type="radio" name="${esc(q.key)}" value="${esc(o.value)}"${value === o.value ? ' checked' : ''}/><span>${esc(o.label)}</span></label>`).join('');
    return `<fieldset class="${cls}" style="border:0;padding:0;margin:0 0 18px"${show}><legend class="lab" style="font-weight:700;margin:0 0 4px;padding:0">${esc(d.label)}${req}</legend>${help}${confirm}<div class="opts">${opts}</div>${err}</fieldset>`;
  }
  const input = d.kind === 'textarea' || d.kind === 'list'
    ? `<textarea id="${id}" name="${esc(q.key)}" maxlength="${d.max}">${esc(value)}</textarea>`
    : `<input id="${id}" name="${esc(q.key)}" type="${d.kind === 'email' ? 'email' : d.kind === 'tel' ? 'tel' : 'text'}" maxlength="${d.max}" value="${esc(value)}"${d.kind === 'email' ? ' autocomplete="email"' : d.kind === 'tel' ? ' autocomplete="tel"' : ''}/>`;
  return `<div class="${cls}"${show}><label for="${id}">${esc(d.label)}${req}</label>${help}${confirm}${input}${err}</div>`;
}

/** The form. `values` = what to show in each field (a resubmission keeps what they typed); errors per field. */
export function onboardingFormHtml(i: { businessName: string; questions: readonly OnbQuestion[]; values?: Partial<Record<OnbKey, string>>; errors?: Partial<Record<OnbKey, string>> }): string {
  const vals = i.values ?? {};
  const fields = i.questions.map((q) => field(q, vals[q.key] ?? q.prefill ?? '', i.errors?.[q.key])).join('\n');
  const anyErr = i.errors && Object.keys(i.errors).length > 0;
  /* Progressive enhancement only: follow-up questions show when their answer applies (the server ignores a hidden one). */
  const js = `<script>(function(){function upd(){document.querySelectorAll('[data-show-key]').forEach(function(el){var k=el.getAttribute('data-show-key');var allowed=(el.getAttribute('data-show-in')||'').split(',');var c=document.querySelector('input[name="'+k+'"]:checked');var exists=document.querySelector('[name="'+k+'"]');el.style.display=(!exists||(c&&allowed.indexOf(c.value)>=0))?'':'none';});}document.addEventListener('change',upd);upd();})();</script>`;
  return shell('Your details', `<div class="card"><h1>A few details for ${esc(i.businessName)}</h1><p>Thanks for signing up with Findable. We only need what we don't already have — this takes a couple of minutes.</p><p class="muted">There's nothing to pay on this form.</p></div>
<form method="post" class="card" novalidate>${anyErr ? '<p class="err" role="alert">Please check the answers marked below.</p>' : ''}
${fields}
<button type="submit">Send my details</button></form>${js}`);
}
