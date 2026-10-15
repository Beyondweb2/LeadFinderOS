/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS LEAD READY? — what each lead needs before the audit, a message and the report offer can run
   (2026-10-15, Paul: "say up front what each lead needs, not afterwards").

   ⛔ NOT A COPY OF ANY RULE. Every check below CALLS the predicate the real gate calls:
     · audit town   — auditTownCheck (_shared/typed-town.ts): the function bulk-jobs runs before it spends,
                      built on auditTownGated (the typed-town fix, 7a8c06d2) and townVerdict;
     · audit name   — create-ai-audit refuses an empty business name ("business_name required");
     · audit trade  — the bulk audit's eligibility (search_keyword || category: create-ai-audit's business type);
     · WhatsApp     — coldWhatsAppVerdict (the queue dialog's and the drip's one rule), with the markets whose
                      WhatsApp switch is on (marketsOn, outreach_country_settings);
     · SMS          — isTextableMobile with the SMS markets switched on;
     · opt-out      — an opted-out number gets no marketing template (marketingConsent: optOutBlocksTemplate);
     · the name in a template — displayNameFor (greet / identify / clean): empty means no usable name;
     · report offer — reportOfferRefusal, once the lead has a finished check (before that it WAITS for one).
   scripts/lead-readiness.test.ts fails if this and the gates disagree.
   ⛔ Computed on the fly from the row; nothing is stored. Opt-out lives in contact_suppressions, which not every
      screen can read — pass `optedOut` when known; unknown is never "fine to message": the sender re-checks.
   ⛔ "Will be looked up" is not missing: a Coverage / Find Leads add looks up the phone and town itself, so those
      items are PENDING until the lookup has run; re-run this after it to see what is still missing.
   Pure, relative imports with extensions (the parity test reads it under node).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { auditTownCheck, type AuditTownProblem } from '../../supabase/functions/_shared/typed-town.ts';
import { coldWhatsAppVerdict, type ColdVerdict } from './coldWhatsAppEligibility.ts';
import { isTextableMobile } from './smsStatus.ts';
import { COUNTRY_OFF, marketsOn, type CountrySettings } from './outreachMarkets.ts';
import { displayNameFor, nameStyleFor } from './displayName.ts';
import { optOutBlocksTemplate } from './marketingConsent.ts';
import { reportOfferRefusal, REPORT_OFFER_REFUSAL_WORDS, REPORT_OFFER_TEMPLATE, type ReportOfferFacts } from './reportOfferTemplate.ts';

/** The opener every screen assumes when it has not read the state (the live choice, CLAUDE.md §6). */
export const DEFAULT_OPENER = 'initial_contact';
/** ⛔ A MIRROR of _shared/whatsapp-send.ts TEMPLATES_NEEDING_REAL_NAME (that file is the sender and is not bundled into
 *  the app). scripts/lead-readiness.test.ts reads the sender's set and fails when they differ. */
export const TEMPLATES_NEEDING_REAL_NAME: ReadonlySet<string> = new Set(['book_call', 're_engage_49', 'initial_contact_short']);

export type ReadinessFeature = 'audit' | 'whatsapp' | 'sms' | 'report_offer';
export const READINESS_FEATURE_LABEL: Record<ReadinessFeature, string> = {
  audit: 'AI audit', whatsapp: 'WhatsApp', sms: 'Text (SMS)', report_offer: 'Report offer',
};

/** What a person edits to fix it; null = not fixable on the lead (a switch, an opt-out, a step that comes later). */
export type ReadinessFix = 'name' | 'trade' | 'town' | 'phone' | null;

export type ReadinessKey =
  | 'no_name' | 'no_trade' | 'town_unverified' | 'no_usable_town'
  | 'no_phone' | 'bad_number' | 'landline' | 'not_a_mobile' | 'country_off'
  | 'opted_out' | 'suppressed' | 'needs_audit' | 'report_offer_refused';

export interface ReadinessItem {
  feature: ReadinessFeature;
  key: ReadinessKey;
  /** Plain English, one short line. */
  words: string;
  fix: ReadinessFix;
  /** Will be looked up / comes later — shown, never counted as "needs something". */
  pending: boolean;
}

/** The lead columns read (outreach_leads names). */
export interface ReadinessLead {
  business_name?: string | null;
  search_keyword?: string | null;
  category?: string | null;
  search_location?: string | null;
  address?: string | null;
  derived_town?: string | null;
  town_fetch_note?: string | null;
  place_id?: string | null;
  lead_source?: string | null;
  import_batch?: string | null;
  country?: string | null;
  phone?: string | null;
}

export interface ReadinessContext {
  /** outreach_country_settings; absent = the default (UK on, Malaysia / Singapore off). */
  countrySettings?: CountrySettings | null;
  /** Any contact_suppressions row for the lead (bulk-jobs skips the audit for ANY of them). Unknown = undefined. */
  suppressed?: boolean | null;
  /** The number asked to stop (contact_suppressions reason opted_out). Unknown = undefined. */
  optedOut?: boolean | null;
  /** The add will look up the phone and town (Place Details) — those are pending, not missing. */
  willLookUp?: boolean;
  /** The finished check's facts, when the lead has one. Absent = no check yet (the report offer waits for it). */
  reportFacts?: ReportOfferFacts | null;
  /** The cold opener in use (whatsapp_outreach_state.initial_opener_template); absent = DEFAULT_OPENER. */
  opener?: string | null;
}

export const READINESS_WORDS: Record<ReadinessKey, string> = {
  no_name: 'No business name',
  no_trade: 'No trade (what the business does)',
  town_unverified: 'Town could not be confirmed — type the real town',
  no_usable_town: 'No usable town (blank or not a place, e.g. "Online")',
  no_phone: 'No phone number',
  bad_number: 'Phone number cannot be read',
  landline: 'Landline — WhatsApp and texts need a mobile',
  not_a_mobile: 'Not a mobile in a country we message (UK, Malaysia, Singapore)',
  country_off: 'Mobile in a country switched off for this channel',
  opted_out: 'Asked to stop — no marketing messages',
  suppressed: 'On the do-not-contact list — not audited',
  needs_audit: 'Needs a finished AI audit first',
  report_offer_refused: 'Report offer cannot go yet',
};

const PENDING_WORDS: Partial<Record<ReadinessKey, string>> = {
  no_phone: 'Phone number will be looked up',
  town_unverified: 'Town will be looked up',
  no_usable_town: 'Town will be looked up',
};

/** The verdict's reason, read without relying on union narrowing (the app compiles non-strict). */
const reasonOf = (v: ColdVerdict): string | null => (v as { reason?: string }).reason ?? null;
const filled = (v: unknown) => typeof v === 'string' && v.trim() !== '';

function item(feature: ReadinessFeature, key: ReadinessKey, fix: ReadinessFix, pending = false, words?: string): ReadinessItem {
  return { feature, key, fix, pending, words: words ?? (pending ? PENDING_WORDS[key] ?? READINESS_WORDS[key] : READINESS_WORDS[key]) };
}

/** Audit only: the reasons the audit would be refused for this lead (bulk-jobs / create-ai-audit), in their order. */
export function auditReadiness(lead: ReadinessLead, ctx: ReadinessContext = {}): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  if (ctx.suppressed === true) out.push(item('audit', 'suppressed', null));   // bulk-jobs: checkSuppressed first
  if (!filled(lead.business_name)) out.push(item('audit', 'no_name', 'name'));
  if (!filled(lead.search_keyword) && !filled(lead.category)) out.push(item('audit', 'no_trade', 'trade'));
  const t = auditTownCheck(lead);
  if (!t.ok) {
    // A lead whose town Google will look up during the add (it has a place id) is pending, not missing.
    const lookup = !!ctx.willLookUp && filled(lead.place_id);
    const problem = (t as { problem: AuditTownProblem }).problem;
    /* A Google-found lead (place id) that Google could not place: a typed town does NOT lift the gate (only a lead
       with no place is let through on its typed town — auditTownGated), so it is not fixable on the lead. */
    const googleLead = filled(lead.place_id);
    if (problem === 'town_unverified' && googleLead && !lookup) {
      out.push(item('audit', problem, null, false, 'Google could not confirm the town — this lead cannot be audited'));
    } else {
      out.push(item('audit', problem, 'town', lookup));
    }
  }
  return out;
}

/** WhatsApp (cold opener): the queue's own verdict, the opt-out and a usable name for the template. */
export function whatsAppReadiness(lead: ReadinessLead, ctx: ReadinessContext = {}): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  const v = coldWhatsAppVerdict(lead.phone, lead.country, marketsOn(ctx.countrySettings ?? null, 'whatsapp'));
  if (v.eligible === false) {
    const key: ReadinessKey = reasonOf(v) === 'no_phone' ? 'no_phone' : reasonOf(v) === 'bad_number' ? 'bad_number'
      : reasonOf(v) === 'landline' ? 'landline' : reasonOf(v) === COUNTRY_OFF ? 'country_off' : 'not_a_mobile';
    const lookup = key === 'no_phone' && !!ctx.willLookUp && filled(lead.place_id);
    out.push(item('whatsapp', key, key === 'country_off' ? null : 'phone', lookup));
  }
  if (ctx.optedOut === true && optOutBlocksTemplate('initial_contact', true)) out.push(item('whatsapp', 'opted_out', null));
  /* The opener refuses an empty name only when it is one of the senders' TEMPLATES_NEEDING_REAL_NAME (every other one
     degrades to 'your business'). The opener in use is whatsapp_outreach_state.initial_opener_template. */
  const opener = ctx.opener ?? DEFAULT_OPENER;
  if (TEMPLATES_NEEDING_REAL_NAME.has(opener) && !displayNameFor(lead.business_name, { style: nameStyleFor(opener) }).display) {
    out.push(item('whatsapp', 'no_name', 'name'));
  }
  return out;
}

/** SMS: a mobile we may text, with that country's SMS switch on, and no opt-out. */
export function smsReadiness(lead: ReadinessLead, ctx: ReadinessContext = {}): ReadinessItem[] {
  const out: ReadinessItem[] = [];
  const markets = marketsOn(ctx.countrySettings ?? null, 'sms');
  if (!isTextableMobile(lead.phone, lead.country, markets)) {
    /* The WHY comes from the queue's own number reading, with the SMS markets (isTextableMobile decides). */
    const v = coldWhatsAppVerdict(lead.phone, lead.country, markets);
    const key: ReadinessKey = v.eligible ? 'not_a_mobile' : reasonOf(v) === 'no_phone' ? 'no_phone' : reasonOf(v) === 'bad_number' ? 'bad_number'
      : reasonOf(v) === 'landline' ? 'landline' : reasonOf(v) === COUNTRY_OFF ? 'country_off' : 'not_a_mobile';
    const lookup = key === 'no_phone' && !!ctx.willLookUp && filled(lead.place_id);
    out.push(item('sms', key, key === 'country_off' ? null : 'phone', lookup));
  }
  if (ctx.optedOut === true) out.push(item('sms', 'opted_out', null));
  return out;
}

/** The report offer: an audit-ready, WhatsApp-ready lead with a finished check whose facts pass reportOfferRefusal. */
export function reportOfferReadiness(lead: ReadinessLead, ctx: ReadinessContext = {}): ReadinessItem[] {
  if (ctx.optedOut === true && optOutBlocksTemplate(REPORT_OFFER_TEMPLATE, true)) return [item('report_offer', 'opted_out', null)];
  if (!ctx.reportFacts) return [item('report_offer', 'needs_audit', null, true)];
  const r = reportOfferRefusal(ctx.reportFacts);
  return r ? [item('report_offer', 'report_offer_refused', null, false, `Report offer: ${REPORT_OFFER_REFUSAL_WORDS[r]}`)] : [];
}

export interface LeadReadiness {
  byFeature: Record<ReadinessFeature, ReadinessItem[]>;
  /** A feature is ready when it has nothing missing (pending items do not count). */
  ready: Record<ReadinessFeature, boolean>;
  /** What still needs a person, for the "needs something" count: the audit's items, plus the channel items only when
   *  NEITHER WhatsApp nor SMS can reach the lead (one usable channel is enough to contact them), plus an opt-out. */
  needs: ReadinessItem[];
  /** The fixable ones among `needs` (a "Needs info" tag: name, trade, town, phone). */
  needsInfo: ReadinessItem[];
  /** Everything waiting on a lookup or a later step. */
  pending: ReadinessItem[];
  ok: boolean;
}

export function leadReadiness(lead: ReadinessLead, ctx: ReadinessContext = {}): LeadReadiness {
  const byFeature: Record<ReadinessFeature, ReadinessItem[]> = {
    audit: auditReadiness(lead, ctx),
    whatsapp: whatsAppReadiness(lead, ctx),
    sms: smsReadiness(lead, ctx),
    report_offer: reportOfferReadiness(lead, ctx),
  };
  const missing = (f: ReadinessFeature) => byFeature[f].filter((i) => !i.pending);
  const ready = {
    audit: missing('audit').length === 0, whatsapp: missing('whatsapp').length === 0,
    sms: missing('sms').length === 0, report_offer: missing('report_offer').length === 0,
  };
  const channelBlocked = !ready.whatsapp && !ready.sms
    && !byFeature.whatsapp.some((i) => i.pending) && !byFeature.sms.some((i) => i.pending);
  const needs: ReadinessItem[] = [...missing('audit')];
  if (channelBlocked) {
    const seen = new Set(needs.map((i) => i.key));
    for (const i of [...missing('whatsapp'), ...missing('sms')]) if (!seen.has(i.key)) { seen.add(i.key); needs.push(i); }
  } else if (ctx.optedOut === true) {
    needs.push(item('whatsapp', 'opted_out', null));
  }
  const pending = [...byFeature.audit, ...byFeature.whatsapp, ...byFeature.sms, ...byFeature.report_offer].filter((i) => i.pending);
  return { byFeature, ready, needs, needsInfo: needs.filter((i) => i.fix !== null), pending, ok: needs.length === 0 };
}

/** The tooltip lines: every feature with something missing or pending, in plain words. */
export function readinessLines(r: LeadReadiness): string[] {
  const lines: string[] = [];
  for (const f of ['audit', 'whatsapp', 'sms', 'report_offer'] as ReadinessFeature[]) {
    const its = r.byFeature[f];
    if (its.length) lines.push(`${READINESS_FEATURE_LABEL[f]}: ${its.map((i) => i.words).join('; ')}`);
  }
  return lines;
}

export interface ReadinessGroup { key: ReadinessKey; words: string; fix: ReadinessFix; names: string[] }
export interface ReadinessSummary { ready: number; needs: number; groups: ReadinessGroup[]; pending: ReadinessGroup[] }

/** "X ready, Y need something", grouped by what is missing, with the lead names; pending groups listed apart. */
export function summariseReadiness(rows: ReadonlyArray<{ name: string; readiness: LeadReadiness }>): ReadinessSummary {
  /* Grouped by the reason AND its wording: the same reason can be fixable on one lead and not on another (a typed
     town vs a Google-found one), and those must not share a heading. */
  const groups = new Map<string, ReadinessGroup>();
  const pending = new Map<string, ReadinessGroup>();
  let ready = 0;
  for (const r of rows) {
    if (r.readiness.ok) ready++;
    for (const i of r.readiness.needs) {
      const gk = `${i.key}|${i.words}`;
      const g = groups.get(gk) ?? { key: i.key, words: i.words, fix: i.fix, names: [] };
      if (!g.names.includes(r.name)) g.names.push(r.name);
      groups.set(gk, g);
    }
    for (const i of r.readiness.pending) {
      if (i.feature === 'report_offer') continue;   // every new lead waits for its audit; not worth a line each
      const gk = `${i.key}|${i.words}`;
      const g = pending.get(gk) ?? { key: i.key, words: i.words, fix: i.fix, names: [] };
      if (!g.names.includes(r.name)) g.names.push(r.name);
      pending.set(gk, g);
    }
  }
  return { ready, needs: rows.length - ready, groups: [...groups.values()], pending: [...pending.values()] };
}

/** One line: "12 ready, 3 need something". */
export function readinessHeadline(s: ReadinessSummary): string {
  return `${s.ready} ready, ${s.needs} need${s.needs === 1 ? 's' : ''} something`;
}

/** One feature's view of a readiness (the bulk audit dialog counts the AUDIT only). */
export function onlyFeature(r: LeadReadiness, f: ReadinessFeature): LeadReadiness {
  const needs = r.byFeature[f].filter((i) => !i.pending);
  return { ...r, needs, needsInfo: needs.filter((i) => i.fix !== null), pending: r.byFeature[f].filter((i) => i.pending), ok: needs.length === 0 };
}

/** A CSV import row as the lead it becomes (import_leads_v2's insert: town → search_location, trade → search_keyword,
 *  the batch → import_batch). `country` = the server's decision for the row when the check has run. */
export function readinessLeadFromImport(row: {
  business_name?: string; phone?: string; town?: string; trade?: string; address?: string; postcode?: string; place_id?: string; country?: string;
}, country: string | null | undefined, batch: string | null | undefined): ReadinessLead {
  const address = [row.address, row.postcode].filter((x) => String(x ?? '').trim()).join(', ') || null;
  return {
    business_name: row.business_name ?? null, phone: row.phone ?? null, search_location: row.town ?? null,
    search_keyword: row.trade ?? null, address, place_id: row.place_id ?? null,
    country: country || row.country || 'UK', import_batch: String(batch ?? '').trim() || null,
  };
}
