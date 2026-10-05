/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MISSING CLIENT INFORMATION — WHAT IS MISSING, WHO CAN ANSWER IT, AND HOW PAUL ASKS
   (2026-10-05, docs/pre-sales-certification/client-missing-info-actions.md)

   The Paid Client setup checklist (handoffReadiness) already says WHAT is missing and WHO owes it. This
   leaf turns that into two practical actions, and nothing else decides them:
     ASK SALESPERSON — an internal request to the person who SOLD the client (sold_by_user_id, stamped
       once at payment — never the current owner), for the items a seller can actually answer.
     CONTACT CLIENT  — the client's own WhatsApp conversation in the Inbox (or a new one under the
       existing rules), else email / phone; with an INTERNAL list of what to ask and a request Paul can
       copy, edit and send himself.

   ⛔ DERIVED, NEVER STORED: the missing list is read from the checklist every time, so the moment the
     salesperson or the client fills a field the item disappears — nobody marks anything "resolved".
   ⛔ NOTHING HERE SENDS. The request text is a suggestion Paul copies; the Inbox helper is internal.
   ⛔ POSITIVE MATCHES ONLY (CLAUDE.md §4): an unknown handoff state, a seller whose status cannot be read
     or a WhatsApp capability we have not confirmed is never treated as "fine to ask / fine to message".
   Pure. ⚠️ Edge-reachable (paid-client-hub, quick-close): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { HandoffKey, HandoffWho } from './handoffReadiness.ts';
import type { HandoffApplies } from './salesHandoff.ts';
import { GBP_MANAGER_EMAIL } from './findableOffer.ts';
import { isWhatsAppWorthTrying, type WhatsAppCapability } from './whatsAppCapability.ts';

/* ══ WHAT IS MISSING ════════════════════════════════════════════════════════════════════════════════ */

/** Checklist items that are INFORMATION someone has to give. Payment, the crawl, the Hook Audit and the
 *  service itself are Findable's own work or state, never "missing information". */
export const MISSING_INFO_KEYS: readonly HandoffKey[] = [
  'sales_handoff', 'business', 'contact', 'services', 'service_areas', 'website', 'website_access', 'gbp_access', 'domain', 'onboarding',
];

/** What a SELLER can still answer after payment: their handoff, and the facts Sales records on the lead
 *  (services_included / service_areas / website / website_control) — the same lead fields the checklist
 *  already accepts "from Sales". Domain authority, Google access and the client's own form are the
 *  CLIENT'S answers only (the domain rule: only the client's onboarding can satisfy it). */
export const SELLER_ANSWERABLE_KEYS: ReadonlySet<HandoffKey> = new Set<HandoffKey>(['sales_handoff', 'services', 'service_areas', 'website', 'website_access']);

/** What the CLIENT can answer: everything except the salesperson's own handoff and the business name. */
const CLIENT_ANSWERABLE_KEYS: ReadonlySet<HandoffKey> = new Set<HandoffKey>(['contact', 'services', 'service_areas', 'website', 'website_access', 'gbp_access', 'domain', 'onboarding']);

export interface MissingInfoItem {
  key: HandoffKey;
  label: string;
  who: HandoffWho;
  detail: string;
  /** The salesperson who sold it could answer this. */
  seller: boolean;
  /** The client could answer this. */
  client: boolean;
}

interface ChecklistItemLike { key: HandoffKey; label: string; ok: boolean; required: boolean; who: HandoffWho; detail: string }

/** The unresolved information items, in checklist order. GBP access the client says is done but
 *  Findable has not confirmed is Paul's own check (who = findable), not missing information. */
export function missingInformation(readiness: { items: readonly ChecklistItemLike[] } | null | undefined): MissingInfoItem[] {
  return (readiness?.items ?? [])
    .filter((i) => i.required === true && i.ok !== true && MISSING_INFO_KEYS.includes(i.key))
    .filter((i) => !(i.key === 'gbp_access' && i.who === 'findable'))
    .map((i) => ({ key: i.key, label: i.label, who: i.who, detail: i.detail, seller: SELLER_ANSWERABLE_KEYS.has(i.key), client: CLIENT_ANSWERABLE_KEYS.has(i.key) }));
}

/* ══ ASK SALESPERSON — only when someone else really sold it ═══════════════════════════════════════ */

export type SellerAskState =
  | 'ask'                  // another, active salesperson sold it and can answer at least one item
  | 'own_sale'             // Paul's own sale — there is no one to ask ("Not needed — your own sale")
  | 'no_seller'            // no seller recorded
  | 'not_recorded_before'  // paid before handoffs existed: the seller on file is a backfill, never asked
  | 'seller_inactive'      // the seller has left the team (or their status could not be read)
  | 'closed'               // the engagement ended or was refunded: there is no setup to complete
  | 'nothing_to_ask';      // nothing missing that a seller could answer

export interface SellerAskInput {
  /** salesHandoffApplies() for this client (salesHandoff.ts) — the same rule the checklist uses. */
  applies: HandoffApplies | null | undefined;
  /** outreach_leads.sold_by_user_id ONLY — never the current owner. */
  soldByUserId: string | null | undefined;
  /** The seller is an ACTIVE team member holding the sales role. Unknown is not active. */
  sellerActive: boolean | null | undefined;
  /** Ended (service_terminated_at) or refunded. */
  closed: boolean;
  items: readonly MissingInfoItem[];
}

export function sellerAskState(i: SellerAskInput): SellerAskState {
  if (i.closed) return 'closed';
  if (i.applies === 'not_needed_own_sale') return 'own_sale';
  if (i.applies === 'not_recorded_before') return 'not_recorded_before';
  if (i.applies !== 'required' || !i.soldByUserId) return 'no_seller';
  if (i.sellerActive !== true) return 'seller_inactive';
  if (!i.items.some((x) => x.seller)) return 'nothing_to_ask';
  return 'ask';
}

export const SELLER_ASK_NOTE: Record<Exclude<SellerAskState, 'ask'>, string> = {
  own_sale: 'Not needed — your own sale',
  no_seller: 'No salesperson recorded on this sale',
  not_recorded_before: 'Paid before handoffs existed — no salesperson to ask',
  seller_inactive: 'The salesperson is no longer on the team',
  closed: 'This engagement has ended',
  nothing_to_ask: 'Nothing left that the salesperson can answer',
};

/** The seller-answerable items, for the request. */
export const sellerItems = (items: readonly MissingInfoItem[]) => items.filter((x) => x.seller);
/** The client-answerable items, for Contact client. */
export const clientItems = (items: readonly MissingInfoItem[]) => items.filter((x) => x.client);

/* ══ THE REQUEST — one outstanding per client, a reminder no sooner than CLIENT_INFO_REMIND_AFTER_HOURS ══ */

/** How long after the request (or the last reminder) Paul may remind the salesperson again. */
export const CLIENT_INFO_REMIND_AFTER_HOURS = 24;
const REMIND_MS = CLIENT_INFO_REMIND_AFTER_HOURS * 3_600_000;

export interface ClientInfoRequestRow {
  id: string;
  lead_id?: string;
  seller_user_id: string;
  requested_by?: string;
  requested_at: string;
  items: string[] | null;
  reminded_at: string | null;
  remind_count?: number | null;
  answered_at: string | null;
  answered_by?: string | null;
  closed_at: string | null;
  closed_reason?: string | null;
}

/** When a reminder becomes available (ISO), from the request or its last reminder. */
export function remindAvailableAt(r: Pick<ClientInfoRequestRow, 'requested_at' | 'reminded_at'>): string {
  const from = Date.parse(r.reminded_at ?? r.requested_at);
  return new Date((Number.isFinite(from) ? from : 0) + REMIND_MS).toISOString();
}

export type ClientInfoRequestPlan =
  | { do: 'create' }
  | { do: 'already_pending'; remindAt: string }
  | { do: 'remind' }
  | { do: 'too_soon'; remindAt: string };

/** ⛔ IDEMPOTENT: pressing Ask twice never creates a second request. An OPEN request answers
 *  already_pending; only an explicit Remind, and only after the gap, notifies again. The database's
 *  one-open-request index is the real guard — this is what the screen and the server plan from. */
export function planClientInfoRequest(open: ClientInfoRequestRow | null | undefined, remind: boolean, nowMs = Date.now()): ClientInfoRequestPlan {
  if (!open || open.closed_at) return { do: 'create' };
  const at = remindAvailableAt(open);
  if (!remind) return { do: 'already_pending', remindAt: at };
  return nowMs >= Date.parse(at) ? { do: 'remind' } : { do: 'too_soon', remindAt: at };
}

export type ClientInfoRequestView =
  | { state: 'none' }
  | { state: 'pending'; id: string; requestedAt: string; remindedAt: string | null; remindAt: string; canRemind: boolean; items: string[] }
  | { state: 'answered'; id: string; requestedAt: string; answeredAt: string };

/** The newest request, as Paul sees it. A cancelled one reads as none. */
export function clientInfoRequestView(newest: ClientInfoRequestRow | null | undefined, nowMs = Date.now()): ClientInfoRequestView {
  if (!newest) return { state: 'none' };
  if (!newest.closed_at) {
    const remindAt = remindAvailableAt(newest);
    return { state: 'pending', id: newest.id, requestedAt: newest.requested_at, remindedAt: newest.reminded_at, remindAt, canRemind: nowMs >= Date.parse(remindAt), items: newest.items ?? [] };
  }
  if (newest.closed_reason === 'answered' && newest.answered_at) return { state: 'answered', id: newest.id, requestedAt: newest.requested_at, answeredAt: newest.answered_at };
  return { state: 'none' };
}

/** Only known keys survive into a stored request (never a free-text list from the browser). */
export function cleanInfoKeys(raw: unknown): HandoffKey[] {
  const xs = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const out: HandoffKey[] = [];
  for (const x of xs) {
    const k = typeof x === 'string' ? x.trim() : '';
    if ((MISSING_INFO_KEYS as readonly string[]).includes(k) && !out.includes(k as HandoffKey)) out.push(k as HandoffKey);
  }
  return out;
}

/* ══ THE SELLER'S ANSWER: client details on the LEAD (the fields the checklist reads "from Sales") ══
   ⛔ An allowlist: services / service areas / website / who controls the website — nothing else on the
   lead. ⛔ It only ADDS: an empty list never clears what is there, and a website is accepted only where
   none is on file (correcting a recorded site is Paul's). The client's own onboarding still outranks
   all of it (handoffReadiness reads onboarding first). */

/** Who controls the website — the salesCrm WEBSITE_CONTROL_OPTIONS without "unknown" (unknown is not an
 *  answer: handoffReadiness treats it as missing). Held equal by scripts/client-missing-info.test.ts. */
export const SELLER_WEBSITE_CONTROL_VALUES = ['client_controls', 'agency_controls', 'third_party_profile_only', 'no_website'] as const;
export type SellerWebsiteControl = typeof SELLER_WEBSITE_CONTROL_VALUES[number];
export const SELLER_LIST_MAX_ITEMS = 30;
export const SELLER_LIST_MAX_CHARS = 80;
export const SELLER_WEBSITE_MAX_CHARS = 300;

export interface SellerClientInfoPatch {
  services_included?: string[];
  service_areas?: string[];
  website?: string;
  website_control?: SellerWebsiteControl;
}

function cleanList(raw: unknown): string[] {
  const xs = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (typeof x !== 'string') continue;
    const t = x.replace(/\s+/g, ' ').trim().slice(0, SELLER_LIST_MAX_CHARS);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length >= SELLER_LIST_MAX_ITEMS) break;
  }
  return out;
}

/** A website the seller typed: one host-like token, https:// added when no scheme. Anything else is refused. */
export function cleanSellerWebsite(raw: unknown): string | null {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t || t.length > SELLER_WEBSITE_MAX_CHARS || /\s/.test(t)) return null;
  const url = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(url);
    /* A bare trailing slash is the same site (the crawl stores "…/", a form "…") — one spelling. */
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) ? url.replace(/^(https?:\/\/[^/?#]+)\/$/i, '$1') : null;
  } catch { return null; }
}

export function cleanSellerClientInfo(raw: unknown, current: { website?: string | null } | null | undefined):
  { patch: SellerClientInfoPatch; changed: (keyof SellerClientInfoPatch)[]; refused: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const patch: SellerClientInfoPatch = {};
  const refused: string[] = [];
  const services = cleanList(r.services);
  if (services.length) patch.services_included = services;
  const areas = cleanList(r.service_areas);
  if (areas.length) patch.service_areas = areas;
  if (typeof r.website === 'string' && r.website.trim()) {
    if ((current?.website ?? '').trim()) refused.push('A website is already on file — ask Paul to change it.');
    else { const w = cleanSellerWebsite(r.website); if (w) patch.website = w; else refused.push('That website address does not look right.'); }
  }
  if (typeof r.website_control === 'string' && r.website_control) {
    if ((SELLER_WEBSITE_CONTROL_VALUES as readonly string[]).includes(r.website_control)) patch.website_control = r.website_control as SellerWebsiteControl;
    else refused.push('Choose who controls the website from the list.');
  }
  return { patch, changed: Object.keys(patch) as (keyof SellerClientInfoPatch)[], refused };
}

/* ══ FIND WHAT WE ALREADY HAVE (Paul, 2026-10-05) ════════════════════════════════════════════════════
   Before asking anyone, look at what is already on file but not counted: other forms the client filled
   (an earlier or unpaid onboarding row, the free check), the website crawl, the salesperson's handoff and
   their Quick Close answers. Each source is shown SEPARATELY (lists are never merged — clientFacts.ts) and
   labelled; nothing is applied until Paul presses Use on one. A website-crawl find is a GUESS until
   confirmed ("found on their website"), exactly as setupPrefill.ts labels it for the client.
   ⛔ Domain authority, Google access and the client's own form can only come from the client — nothing
   found elsewhere is offered for them. The server re-gathers and applies the candidate BY ID, so the
   browser never decides the value. */

export type KnownApplyField = 'services' | 'service_areas' | 'website' | 'website_control';
export interface KnownCandidate {
  id: string;
  source: 'onboarding' | 'free_check' | 'crawl' | 'handoff' | 'quick_close';
  label: string;
  /** Shown under the label: a guess to confirm, or when it was recorded. */
  note: string | null;
  items?: string[];
  value?: string;
  /** The lead field Use writes; null = shown for reference only (Paul copies it). */
  apply: KnownApplyField | null;
}
export interface KnownForItem { key: HandoffKey; candidates: KnownCandidate[]; clientOnly: boolean }

export interface KnownInput {
  missing: readonly HandoffKey[];
  lead: { website?: string | null; website_control?: string | null } | null;
  /** Every onboarding row for the lead; the one the checklist already reads is skipped (it is counted). */
  onboardingRows: ReadonlyArray<Record<string, unknown>>;
  countedOnboardingId: string | null;
  crawl: { url?: string | null; created_at?: string | null; siteInfo?: { services?: unknown; towns?: unknown; email?: unknown; phone?: unknown } | null } | null;
  handoffSiteSituation?: string | null;
  quickCloseManager?: string | null;
}

const CLIENT_ONLY_KEYS: ReadonlySet<HandoffKey> = new Set<HandoffKey>(['gbp_access', 'domain', 'onboarding']);
const listOf = (v: unknown): string[] => cleanList(Array.isArray(v)
  ? v.map((x) => (x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' ? (x as { name: string }).name : x))
  : typeof v === 'string' ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const dayOf = (iso: unknown) => {
  const t = Date.parse(str(iso));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : null;
};
const SITE_SITUATION_CONTROL: Record<string, SellerWebsiteControl> = { client: 'client_controls', agency: 'agency_controls', no_website: 'no_website' };
const QC_MANAGER_CONTROL: Record<string, SellerWebsiteControl> = {
  owner: 'client_controls', employee: 'client_controls', agency: 'agency_controls', third_party: 'agency_controls', no_website: 'no_website',
};
export const WEBSITE_CONTROL_WORDS: Record<SellerWebsiteControl, string> = {
  client_controls: 'The client controls it', agency_controls: 'An agency controls it', third_party_profile_only: 'Only a third-party profile', no_website: 'No website',
};

export function gatherKnown(i: KnownInput): KnownForItem[] {
  const out: KnownForItem[] = [];
  const otherRows = i.onboardingRows.filter((r) => str(r.id) !== (i.countedOnboardingId ?? ''));
  const rowLabel = (r: Record<string, unknown>) => {
    const free = str(r.source) === 'free_check';
    const when = dayOf(r.updated_at ?? r.created_at);
    return { source: (free ? 'free_check' : 'onboarding') as KnownCandidate['source'], label: free ? 'Their free-check form' : 'An earlier form they filled in', note: when ? `Recorded ${when}` : null };
  };
  const crawlNote = `Found on their website${dayOf(i.crawl?.created_at) ? ` (crawled ${dayOf(i.crawl?.created_at)})` : ''} — a guess until the client confirms it`;
  for (const key of i.missing) {
    const c: KnownCandidate[] = [];
    /* The same value from two sources is shown once (the first, higher-ranked source keeps it). */
    const sameAs = (x: Omit<KnownCandidate, 'id'>) => c.some((y) => (x.value && y.value === x.value) || (x.items && y.items && x.items.join('\n').toLowerCase() === y.items.join('\n').toLowerCase()));
    const add = (x: Omit<KnownCandidate, 'id'>) => { if (((x.items && x.items.length) || x.value) && !sameAs(x)) c.push({ id: `${key}:${c.length}:${x.source}`, ...x }); };
    if (key === 'services') {
      for (const r of otherRows) add({ ...rowLabel(r), items: listOf(r.services_list).length ? listOf(r.services_list) : listOf(r.services), apply: 'services' });
      add({ source: 'crawl', label: 'Their website', note: crawlNote, items: listOf(i.crawl?.siteInfo?.services), apply: 'services' });
    } else if (key === 'service_areas') {
      for (const r of otherRows) add({ ...rowLabel(r), items: listOf(r.areas_list).length ? listOf(r.areas_list) : listOf(r.areas_wanted), apply: 'service_areas' });
      add({ source: 'crawl', label: 'Their website', note: crawlNote, items: listOf(i.crawl?.siteInfo?.towns), apply: 'service_areas' });
    } else if (key === 'website') {
      const has = !!str(i.lead?.website);
      for (const r of otherRows) add({ ...rowLabel(r), value: cleanSellerWebsite(r.business_website) ?? undefined, apply: has ? null : 'website' });
      add({ source: 'crawl', label: 'The site we crawled', note: dayOf(i.crawl?.created_at) ? `Crawled ${dayOf(i.crawl?.created_at)}` : null, value: cleanSellerWebsite(i.crawl?.url) ?? undefined, apply: has ? null : 'website' });
    } else if (key === 'website_access') {
      const fromHandoff = SITE_SITUATION_CONTROL[str(i.handoffSiteSituation)];
      if (fromHandoff) add({ source: 'handoff', label: "The salesperson's handoff", note: null, value: fromHandoff, apply: 'website_control' });
      const fromQc = QC_MANAGER_CONTROL[str(i.quickCloseManager)];
      if (fromQc) add({ source: 'quick_close', label: 'Their answer on the sales call (Quick Close)', note: null, value: fromQc, apply: 'website_control' });
    } else if (key === 'contact') {
      for (const r of otherRows) add({ ...rowLabel(r), value: [str(r.confirmed_phone), str(r.contact_email)].filter(Boolean).join(' · ') || undefined, apply: null });
      add({ source: 'crawl', label: 'Their website', note: crawlNote, value: [str(i.crawl?.siteInfo?.phone), str(i.crawl?.siteInfo?.email)].filter(Boolean).join(' · ') || undefined, apply: null });
    }
    out.push({ key, candidates: c, clientOnly: CLIENT_ONLY_KEYS.has(key) });
  }
  return out;
}

/** The lead patch for ONE gathered candidate, through the same allowlist the seller's save uses. */
export function patchForCandidate(cand: KnownCandidate, lead: { website?: string | null } | null) {
  if (!cand.apply) return null;
  const raw = cand.apply === 'services' ? { services: cand.items } : cand.apply === 'service_areas' ? { service_areas: cand.items }
    : cand.apply === 'website' ? { website: cand.value } : { website_control: cand.value };
  const r = cleanSellerClientInfo(raw, lead);
  return r.changed.length ? r.patch : null;
}

/* ══ WORDS ═══════════════════════════════════════════════════════════════════════════════════════ */

/** Item label by key, for a stored request (labels are the checklist's own). */
export const MISSING_INFO_LABEL: Record<string, string> = {
  sales_handoff: 'Sales handoff', business: 'Business name', contact: 'Contact details', services: 'Services',
  service_areas: 'Service areas', website: 'Current website', website_access: 'Website access / control',
  gbp_access: 'Google Business Profile access', domain: 'Domain / authority', onboarding: 'Client onboarding',
};

/** The salesperson's notification: who, what, and the ask. Short — a notification body is capped. */
export function sellerRequestTitle(businessName: string | null | undefined): string {
  return `CLIENT INFO NEEDED · ${(businessName ?? '').trim() || 'A client'}`;
}
export function sellerRequestBody(businessName: string | null | undefined, keys: readonly string[]): string {
  const name = (businessName ?? '').trim() || 'Your client';
  const labels = keys.map((k) => MISSING_INFO_LABEL[k] ?? k);
  return `${name} is missing: ${labels.join(' · ')}. Please add anything you collected during the sale.`;
}

/** INTERNAL — what Paul needs from the client, in plain words (the Inbox helper and the card). */
export const CLIENT_NEED_WORDS: Record<string, string> = {
  contact: 'the best phone number or email to reach them',
  services: 'their main services',
  service_areas: 'the towns and areas they cover',
  website: 'their current website (or that they have none)',
  website_access: 'who controls the website, and whether we can get access',
  gbp_access: 'access to their Google Business Profile',
  domain: 'who owns / controls the domain, and whether they can authorise changes',
  onboarding: 'the setup form is not finished yet',
};

/** The client-facing ask, one line each — what Paul's message says. */
const CLIENT_ASK_WORDS: Record<string, string> = {
  contact: 'the best phone number or email to reach you',
  services: 'the main services you offer',
  service_areas: 'the towns and areas you cover',
  website: 'your current website address (or let me know if you do not have one)',
  website_access: 'who looks after your website, and whether we can get access to it',
  gbp_access: `access to your Google Business Profile (add ${GBP_MANAGER_EMAIL} as a manager)`,
  domain: 'who owns your domain name, and whether you can authorise changes to it',
  onboarding: 'the short setup form (link below)',
};

/** COPY REQUEST — a short message Paul copies, edits and sends himself. Never sent by the app. */
export function clientInfoRequestMessage(i: { contactName?: string | null; keys: readonly string[]; setupLink?: string | null }): string {
  const first = (i.contactName ?? '').trim().split(/\s+/)[0] ?? '';
  const asks = i.keys.filter((k) => CLIENT_ASK_WORDS[k]).map((k) => `• ${CLIENT_ASK_WORDS[k]}`);
  const lines = [
    `Hi${first ? ` ${first}` : ''}, thanks again for signing up with Findable.`,
    asks.length ? 'To get your setup moving, could you send me:' : 'Just checking in on your setup.',
    ...asks,
  ];
  if (i.setupLink && i.keys.length) lines.push('', `You can also fill these in here: ${i.setupLink}`);
  lines.push('', 'Thanks, Paul');
  return lines.join('\n');
}

/* ══ CONTACT CLIENT — the most useful honest route ══════════════════════════════════════════════════ */

export type ClientContactRoute =
  | { kind: 'whatsapp_thread' }   // their conversation exists — open it in the Inbox
  | { kind: 'whatsapp_start' }    // no conversation yet, the number is worth trying — the Inbox's own start rules apply
  | { kind: 'email'; email: string }
  | { kind: 'phone'; phone: string };

export interface ClientContactInput {
  phone: string | null | undefined;
  email: string | null | undefined;
  capability: WhatsAppCapability;
  /** Any WhatsApp message to or from them (by lead or by number). */
  conversation: boolean;
}

/** The first route is the button; the rest are shown beside it. Empty = no way to contact them (never a
 *  dead button). ⛔ A number Meta rejected or a landline is never offered as WhatsApp; an unchecked
 *  number starts no new thread (whatsAppCapability.ts — only a delivery proves WhatsApp). */
export function clientContactRoutes(i: ClientContactInput): ClientContactRoute[] {
  const phone = (i.phone ?? '').trim();
  const email = (i.email ?? '').trim();
  const out: ClientContactRoute[] = [];
  if (phone && i.conversation) out.push({ kind: 'whatsapp_thread' });
  else if (phone && isWhatsAppWorthTrying(i.capability)) out.push({ kind: 'whatsapp_start' });
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) out.push({ kind: 'email', email });
  if (phone) out.push({ kind: 'phone', phone });
  return out;
}

/** The Inbox carries the INTERNAL "need from this client" list as keys only (?need=services,domain). */
export const NEED_PARAM = 'need';
export function needParamValue(keys: readonly string[]): string { return cleanInfoKeys(keys).join(','); }
export function parseNeedParam(v: string | null | undefined): HandoffKey[] { return cleanInfoKeys(v ?? ''); }
