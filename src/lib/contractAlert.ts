/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CONTRACT CALL ALERT (Paul, 2026-10-16) — the rules and the words, pure. docs/contract-call-alert.md

   A lead that answers "not sure" (agency contract) or "tied in", on ANY route, gets Paul ONE email and a line on his
   "Needs your attention" list. The I/O is _shared/contract-alert.ts; the once-per-answer ledger is the
   contract_call_alerts table (contract_alert_claim). This file decides:
     · which answer a set of facts is (the ONE rule, agencyContractRule.ts — never a copy);
     · the email (subject, lines, a tap-to-call link), from the LEAD record's phone and email — never typed by the
       prospect;
     · whether the dashboard line is still open.
   ⛔ To Paul only (OPERATOR_ALERT_TO). Nothing here ever addresses the prospect.
   Pure; reached from edge functions: relative imports with explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { agencyContractOutcome } from './agencyContractRule.ts';
import { contractEndWords, readContractEnd } from './onboardingSimpleAnswers.ts';
import { OPERATOR_APP_URL } from '../config/operatorApp.ts';
import { THIRD_PARTY_MANAGERS } from './quickClose.ts';

/** What the ledger records: an alert answer, or 'free' (closes an earlier alert, sends nothing). */
export type ContractAlertAnswer = 'not_sure' | 'in_contract' | 'free';
export type ContractAlertSource = 'findable_onboarding' | 'sales_confirm' | 'agreement' | 'quick_close' | 'manual_onboarding';

/** The answer a set of facts gives, through THE rule. Unanswered (or no agency question asked) → null: record nothing. */
export function contractAlertAnswer(thirdParty: boolean | null, contract: unknown): ContractAlertAnswer | null {
  const o = agencyContractOutcome(thirdParty, contract);
  return o === 'stop' ? 'in_contract' : o === 'hold' ? 'not_sure' : o === 'go' ? 'free' : null;
}

/** Off an onboarding row (the client's own page, a manual save): website_manager 'web_company' = an agency runs it. */
export function contractAlertAnswerFromRow(row: { website_manager?: unknown; agency_contract?: unknown } | null | undefined): ContractAlertAnswer | null {
  const m = row?.website_manager;
  const thirdParty = m === 'web_company' ? true : typeof m === 'string' && m ? false : null;
  return contractAlertAnswer(thirdParty, row?.agency_contract);
}

/** Off Quick Close / Call screen answers (manager + agency_contract): an agency, freelancer or other third party runs it;
 *  they look after it themselves (or have no website) is no agency; anything else (not asked, legacy "not sure") is unanswered. */
export function contractAlertAnswerFromQuickClose(a: { manager?: string | null; agency_contract?: unknown } | null | undefined): ContractAlertAnswer | null {
  const m = a?.manager ?? null;
  const thirdParty = m && THIRD_PARTY_MANAGERS.includes(m) ? true : m === 'owner' || m === 'employee' || m === 'no_website' ? false : null;
  return contractAlertAnswer(thirdParty, a?.agency_contract);
}

/** Only these two send. */
export const isAlertAnswer = (a: ContractAlertAnswer | null): a is 'not_sure' | 'in_contract' => a === 'not_sure' || a === 'in_contract';

export const CONTRACT_SOURCE_WORDS: Record<ContractAlertSource, string> = {
  findable_onboarding: 'their sign-up on findable.live',
  sales_confirm: 'their sign-up page (correcting what the salesperson recorded)',
  agreement: 'the agreement page',
  quick_close: 'Quick Close / the call',
  manual_onboarding: 'your manual onboarding',
};

/** "07700 900123" → "tel:07700900123"; "+44 7700 900123" → "tel:+447700900123". Nothing dialable → null. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

export interface ContractAlertFacts {
  leadId: string;
  answer: 'not_sure' | 'in_contract';
  business: string | null;
  contactName: string | null;
  /** From the LEAD record. */
  phone: string | null;
  email: string | null;
  contractEnds?: string | null;
  provider?: string | null;
  source: ContractAlertSource;
}

export interface ContractAlertEmail { subject: string; lines: string[]; html: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The email (Paul's wording, 2026-10-16). */
export function contractAlertEmail(f: ContractAlertFacts): ContractAlertEmail {
  const biz = (f.business ?? '').trim() || 'A lead';
  const subject = f.answer === 'not_sure' ? `CALL: ${biz} not sure about agency contract` : `NO-GO: ${biz} tied into agency contract`;
  const ends = contractEndWords(readContractEnd(f.contractEnds) ?? null);
  const leadUrl = `${OPERATOR_APP_URL}/inbox?lead=${f.leadId}`;
  const tel = telHref(f.phone);
  const ticked = [
    'Agency or provider: yes' + (f.provider?.trim() ? ` (${f.provider.trim()})` : ''),
    f.answer === 'in_contract' ? 'Contract: tied in' : 'Contract: not sure',
    ...(f.answer === 'in_contract' ? [`Contract ends: ${ends ?? 'not given'}`] : ends ? [`Contract ends: ${ends}`] : []),
  ];
  const lines = [
    f.answer === 'not_sure'
      ? 'They are not sure whether they are tied into a contract with their agency. Call them before any payment.'
      : 'They are tied into a contract with their agency, so we do not take them on now. Follow up when it ends.',
    '',
    `Business: ${biz}`,
    `Contact: ${f.contactName?.trim() || 'not known'}`,
    `Phone: ${f.phone?.trim() || 'not known'}`,
    `Email: ${f.email?.trim() || 'not known'}`,
    '',
    'What they ticked:',
    ...ticked.map((t) => `  ${t}`),
    `Where: ${CONTRACT_SOURCE_WORDS[f.source]}`,
    '',
    `Open the lead: ${leadUrl}`,
  ];
  const row = (label: string, value: string) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${esc(label)}</td><td style="padding:2px 0">${value}</td></tr>`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">`
    + `<p style="margin:0 0 12px"><b>${esc(lines[0])}</b></p>`
    + `<table style="border-collapse:collapse">`
    + row('Business', esc(biz))
    + row('Contact', esc(f.contactName?.trim() || 'not known'))
    + row('Phone', tel ? `<a href="${esc(tel)}">${esc(f.phone!.trim())}</a> (tap to call)` : esc(f.phone?.trim() || 'not known'))
    + row('Email', f.email?.trim() ? `<a href="mailto:${esc(f.email.trim())}">${esc(f.email.trim())}</a>` : 'not known')
    + `</table>`
    + '<p style="margin:12px 0 4px"><b>What they ticked</b></p><ul style="margin:0 0 12px;padding-left:18px">' + ticked.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>'
    + `<p style="margin:0 0 12px;color:#555">Where: ${esc(CONTRACT_SOURCE_WORDS[f.source])}</p>`
    + `<p style="margin:0"><a href="${esc(leadUrl)}">Open the lead in LeadFinderOS</a></p>`
    + `</div>`;
  return { subject: subject.slice(0, 180), lines, html };
}

/* ── THE "NEEDS YOU" LINE (admin dashboard, adminMetrics.ts) ───────────────────────────────────────────────── */
export interface ContractAlertRow { id: string; lead_id: string; answer: string; contract_ends: string | null; provider: string | null; source: string; created_at: string }

/** The newest ledger row per lead — the lead's current answer. */
export function newestContractAlerts(rows: readonly ContractAlertRow[]): Map<string, ContractAlertRow> {
  const out = new Map<string, ContractAlertRow>();
  for (const r of rows) {
    const prev = out.get(r.lead_id);
    if (!prev || Date.parse(r.created_at) > Date.parse(prev.created_at) || (r.created_at === prev.created_at && r.id > prev.id)) out.set(r.lead_id, r);
  }
  return out;
}

/** Still on Paul's list? The newest answer is an alert answer, and nobody has acted on the lead since (a Next Action, a
 *  logged call…), and it has not become a client. */
export function contractAlertOpen(i: { newest: ContractAlertRow; actedAfter: boolean; isClient: boolean }): boolean {
  return (i.newest.answer === 'not_sure' || i.newest.answer === 'in_contract') && !i.actedAfter && !i.isClient;
}
