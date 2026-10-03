/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID-CLIENT SETUP: READY TO SUBMIT, or WAITING FOR INFORMATION  (2026-09-28, docs/self-sourced-handoff.md;
   the setup checklist since 2026-10-02, docs/paid-client-automation.md)

   ONE RULE, read by Paid Clients (list + client page, via paid-client-hub), the new-client email
   (stripe-webhook) and Submit for delivery (_shared/delivery-submit.ts). It answers one question: when
   Paul takes over, can delivery start, or what is missing and WHO owes it (sales / client / Findable)?
   It never stores anything (derived, never stored: CLAUDE.md §6), so a late onboarding answer or a
   salesperson's edit changes it at once. The one stored act is Submit for delivery.
   ⛔ REQUIRED vs NOT NEEDED is decided per client: a client with no Google Business Profile is never
   blocked by "GBP access"; a client with no website is never blocked by a crawl; the domain question
   binds a new-site build only; the sales handoff binds a salesperson's sale only (salesHandoff.ts).

   ⛔ EITHER SOURCE SATISFIES AN ITEM — the client's onboarding answers OR what Sales already collected
   on the lead (services_included / service_areas / website_control). Nothing is copied between them:
   onboarding outranks the lead when both exist (the same rank clientFacts / clientContext use), and the
   item says which source it read, so Paul can see "from Sales" and confirm it with the client.
   ⛔ POSITIVE MATCHES ONLY. An unknown value is MISSING, never "fine" (CLAUDE.md §4): website control
   'unknown' is not an answer; a GBP invite the client says they "will do" is not access.
   ⚠️ Edge-reachable (stripe-webhook, paid-client-hub): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isPaidLead } from './leadPayment.ts';
import { effectiveQuestionnaireServices, missingQuestionnaireFields } from './questionnaireComplete.ts';
import { DOMAIN_REASON_TEXT, domainAuthority, domainInputFromRow, type DomainAuthorityVerdict, type DomainRow } from './domainAuthority.ts';
import { CRAWL_FRESH_MS } from './crawlCheck.ts';
import type { HandoffApplies } from './salesHandoff.ts';
import { serviceEndView } from './serviceEnd.ts';

export interface HandoffLead {
  business_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  amount_paid?: number | null;
  status?: string | null;
  services_included?: string[] | null;
  service_areas?: string[] | null;
  website_control?: string | null;
  delivery_checklist?: Record<string, unknown> | null;
  /** The service ended (serviceEnd.ts). A terminated client is never ready — and never "waiting" either. */
  service_terminated_at?: string | null;
  service_termination_reason?: string | null;
}

export interface HandoffOnboarding extends DomainRow {
  services?: string | null;
  services_list?: string[] | null;
  areas_list?: string[] | null;
  areas_wanted?: string | null;
  business_website?: string | null;
  confirmed_phone?: string | null;
  contact_email?: string | null;
  website_route?: string | null;
  website_manager?: string | null;
  domain_status?: string | null;
  gbp_status?: string | null;
  /** The client's own answer to "do you have a Google Business Profile?" ('no' = none exists). */
  gbp_exists?: string | null;
  /** The baseline's town (questionnaireComplete reads it with services). */
  confirmed_location?: string | null;
}

export interface HandoffEvidence {
  /** A prospect audit exists for this lead (hook / quick check / free check). Shown, never required. */
  hookAudit: boolean;
  /** A crawl of the lead's site is on file (lead_crawl_checks). Required only when there is a site. */
  crawl: boolean;
  /** Age of that crawl in days (from its created_at). null = unknown age, which is never "fresh". */
  crawlAgeDays: number | null;
  /** The salesperson's handoff (src/lib/salesHandoff.ts): whether one is owed and whether it is done. */
  salesHandoff: { applies: HandoffApplies; complete: boolean; missing: number };
}

export type HandoffSource = 'onboarding' | 'sales' | 'findable' | 'payment' | null;
export type HandoffKey =
  | 'paid' | 'sales_handoff' | 'business' | 'contact' | 'services' | 'service_areas' | 'website' | 'website_access'
  | 'gbp_access' | 'crawl' | 'hook_audit' | 'domain' | 'onboarding' | 'service';
/** Who must act for a missing item: the salesperson, the client, or Findable (Paul). */
export type HandoffWho = 'sales' | 'client' | 'findable';

export interface HandoffItem {
  key: HandoffKey;
  label: string;
  ok: boolean;
  /** Required for READY TO SUBMIT. hook_audit is informational; a not-needed item is never required. */
  required: boolean;
  /** Does not apply to this client (no GBP, no website, Paul's own sale…). Shown as "not needed". */
  notNeeded?: boolean;
  source: HandoffSource;
  /** Who must act when it is missing. */
  who: HandoffWho;
  detail: string;
}

/* ⛔ THREE STATES, NOT TWO (Paul, 2026-10-02): every required item in is READY TO SUBMIT; READY FOR
   DELIVERY needs the Submit for delivery act too, so it is deliveryStage's word, never this rule's. */
export const READY_LABEL = 'READY TO SUBMIT';
export const WAITING_LABEL = 'WAITING FOR INFORMATION';

export interface HandoffReadiness {
  ready: boolean;
  /** READY TO SUBMIT / WAITING FOR INFORMATION — whether every required item is in. */
  label: typeof READY_LABEL | typeof WAITING_LABEL;
  items: HandoffItem[];
  /** The labels of the required items that are not ok, in order. Empty when ready. */
  missing: string[];
  /** Who the missing items wait on, most urgent first: sales before client before Findable. Null when ready. */
  waitingOn: HandoffWho | null;
  /** Required items done / required items in total (the "7/9 complete" line). */
  done: number;
  total: number;
  /** DOMAIN READY / DOMAIN / AGENCY ISSUE / NOT NEEDED, with the reasons (src/lib/domainAuthority.ts). */
  domain: DomainAuthorityVerdict;
}

/** Delivery checklist key Findable ticks by hand once the GBP invite has actually arrived. Same key
 *  as deliveryCockpit's GBP_ACCESS_CHECKLIST_KEY (held equal by scripts/self-sourced-handoff.test.ts). */
export const HANDOFF_GBP_CHECKLIST_KEY = 'gbp_access';

const WEBSITE_ROUTES = new Set(['optimise_existing', 'rebuild_existing', 'new_site']);
/* owner_only = they run the site themselves but cannot hand over access (Quick Close writes it): who
   controls the site IS known, so it answers the question; whether we get in is the domain / access work. */
const WEBSITE_MANAGERS = new Set(['direct_access', 'web_company', 'owner_only']);
const WEBSITE_CONTROL_KNOWN: Record<string, string> = {
  client_controls: 'the client controls it',
  agency_controls: 'an agency controls it',
  third_party_profile_only: 'only a third-party profile',
  no_website: 'no website',
};
const MANAGER_WORDS: Record<string, string> = {
  web_company: 'a web company manages it', direct_access: 'they manage it themselves', owner_only: 'they run it but cannot give access',
};

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const splitList = (v: unknown): string[] => text(v).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const preview = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} +${xs.length - 4} more` : xs.join(', '));

/** A crawl is reused while it is younger than the shared freshness window (crawlCheck.ts). */
export const CRAWL_REUSE_DAYS = CRAWL_FRESH_MS / 86_400_000;
export function crawlIsFresh(ageDays: number | null | undefined): boolean {
  return typeof ageDays === 'number' && Number.isFinite(ageDays) && ageDays >= 0 && ageDays < CRAWL_REUSE_DAYS;
}

export function handoffReadiness(
  lead: HandoffLead | null | undefined,
  onboarding: HandoffOnboarding | null | undefined,
  evidence: HandoffEvidence,
): HandoffReadiness {
  const L = lead ?? {};
  const O = onboarding ?? null;
  const items: HandoffItem[] = [];
  const add = (i: HandoffItem) => items.push(i);

  // Paid — the server's own record (the webhook or Mark Paid). Never inferred from a status alone.
  const paid = isPaidLead(L);
  add({
    key: 'paid', label: 'Payment received', ok: paid, required: true, source: paid ? 'payment' : null, who: 'findable',
    detail: paid ? 'Payment recorded' : L.status === 'refunded' ? 'Refunded' : L.status === 'payment_received' ? 'Marked paid, but no amount is recorded' : 'No payment recorded',
  });

  /* The salesperson's handoff (salesHandoff.ts). Owed only for a salesperson's sale made since handoffs
     existed; Paul's own sale and an older client are "not needed" — never fabricated, never a block. */
  const sh = evidence.salesHandoff;
  const shRequired = sh.applies === 'required';
  add({
    key: 'sales_handoff', label: 'Sales handoff', ok: !shRequired || sh.complete, required: shRequired, notNeeded: !shRequired,
    source: shRequired && sh.complete ? 'sales' : null, who: 'sales',
    detail: !shRequired
      ? (sh.applies === 'not_needed_own_sale' ? "Not needed — Paul's own sale" : sh.applies === 'not_recorded_before' ? 'Not recorded — paid before handoffs existed' : 'Not needed — no salesperson on this sale')
      : sh.complete ? 'Complete' : sh.missing > 0 ? `Not complete — ${sh.missing} answer${sh.missing === 1 ? '' : 's'} missing` : 'Not saved by the salesperson yet',
  });

  const name = text(L.business_name);
  add({ key: 'business', label: 'Business name', ok: !!name, required: true, source: name ? 'sales' : null, who: 'sales', detail: name || 'Missing' });

  const phone = text(O?.confirmed_phone) || text(L.phone);
  const email = text(O?.contact_email) || text(L.email);
  add({
    key: 'contact', label: 'Contact details', ok: !!(phone || email), required: true,
    source: text(O?.confirmed_phone) || text(O?.contact_email) ? 'onboarding' : phone || email ? 'sales' : null, who: 'client',
    detail: [phone, email].filter(Boolean).join(' · ') || 'No way to contact the client',
  });

  // Services: onboarding first, else what Sales entered. Lists are never merged.
  const obServices = effectiveQuestionnaireServices(O ?? undefined);
  const salesServices = list(L.services_included);
  const services = obServices.length ? obServices : salesServices;
  add({
    key: 'services', label: 'Services', ok: services.length > 0, required: true,
    source: obServices.length ? 'onboarding' : salesServices.length ? 'sales' : null, who: 'client',
    detail: services.length ? preview(services) : 'Not given by the client or by Sales',
  });

  const obAreas = list(O?.areas_list).length ? list(O?.areas_list) : splitList(O?.areas_wanted);
  const salesAreas = list(L.service_areas);
  const areas = obAreas.length ? obAreas : salesAreas;
  add({
    key: 'service_areas', label: 'Service areas', ok: areas.length > 0, required: true,
    source: obAreas.length ? 'onboarding' : salesAreas.length ? 'sales' : null, who: 'client',
    detail: areas.length ? preview(areas) : 'Not given by the client or by Sales',
  });

  // Website: a site on file, or a positive "no website / build a new one".
  const site = text(O?.business_website) || text(L.website);
  const control = text(L.website_control);
  const noSite = !site && (O?.website_route === 'new_site' || control === 'no_website');
  add({
    key: 'website', label: 'Website', ok: !!site || noSite, required: true,
    source: text(O?.business_website) ? 'onboarding' : site ? 'sales' : O?.website_route === 'new_site' ? 'onboarding' : noSite ? 'sales' : null, who: 'client',
    detail: site ? site.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : noSite ? 'No website — Findable builds one' : 'Not known whether they have a website',
  });

  // Who controls the site (onboarding's route / manager, else the salesperson's record).
  const route = text(O?.website_route);
  const manager = text(O?.website_manager);
  const accessFromOnboarding = WEBSITE_ROUTES.has(route) || WEBSITE_MANAGERS.has(manager);
  const accessFromSales = control in WEBSITE_CONTROL_KNOWN;
  add({
    key: 'website_access', label: 'Website access / control', ok: noSite || accessFromOnboarding || accessFromSales, required: !noSite, notNeeded: noSite,
    source: accessFromOnboarding ? 'onboarding' : accessFromSales ? 'sales' : noSite ? 'onboarding' : null, who: 'client',
    detail: noSite ? 'Not needed — new site'
      : accessFromOnboarding ? [route && route.replace(/_/g, ' '), MANAGER_WORDS[manager] ?? ''].filter(Boolean).join(' · ')
      : accessFromSales ? `Sales: ${WEBSITE_CONTROL_KNOWN[control]}`
      : 'Not known who controls the website',
  });

  /* GBP: Findable's own tick wins; "client says done" is enough to start; anything else is missing.
     ⛔ A CLIENT WITH NO PROFILE IS NEVER BLOCKED BY IT (Paul, 2026-10-02): their own answer
     gbp_exists = 'no' makes the item not needed. Only that positive answer — unknown still asks. */
  const confirmed = L.delivery_checklist?.[HANDOFF_GBP_CHECKLIST_KEY] === true;
  const says = text(O?.gbp_status);
  const noGbp = text(O?.gbp_exists) === 'no' && !confirmed;
  add({
    key: 'gbp_access', label: 'Google Business Profile access', ok: noGbp || confirmed || says === 'done', required: !noGbp, notNeeded: noGbp,
    source: confirmed ? 'findable' : says || noGbp ? 'onboarding' : null, who: says === 'done' && !confirmed ? 'findable' : 'client',
    detail: noGbp ? 'Not needed — the client has no Google Business Profile'
      : confirmed ? 'Confirmed by Findable'
      : says === 'done' ? 'Client says the invite is sent — not yet confirmed by Findable'
      : says === 'will_do' ? 'Client said they will do it later'
      : says === 'no_access' ? 'Client cannot get into their profile'
      : 'Not asked or not answered yet',
  });

  /* The crawl is REUSED while fresh (CRAWL_REUSE_DAYS) — payment never re-crawls. Stale or missing means
     "Crawl website" is Findable's preparation step. No site = not needed. */
  const fresh = evidence.crawl && crawlIsFresh(evidence.crawlAgeDays);
  add({
    key: 'crawl', label: 'Website crawled', ok: fresh || noSite || !site, required: !!site, notNeeded: !site,
    source: evidence.crawl ? 'findable' : null, who: 'findable',
    detail: !site ? (noSite ? 'Not needed — no site to crawl' : 'No website on file')
      : fresh ? `On file · ${Math.round(evidence.crawlAgeDays as number)} day${Math.round(evidence.crawlAgeDays as number) === 1 ? '' : 's'} old`
      : evidence.crawl ? `Out of date${typeof evidence.crawlAgeDays === 'number' ? ` · ${Math.round(evidence.crawlAgeDays)} days old` : ''} — re-crawl before Discovery`
      : 'Not crawled yet',
  });
  add({
    key: 'hook_audit', label: 'Hook Audit', ok: evidence.hookAudit, required: false,
    source: evidence.hookAudit ? 'findable' : null, who: 'findable', detail: evidence.hookAudit ? 'On file' : 'None run',
  });

  /* ⛔ THE DOMAIN RULE (Paul, 2026-09-28): a NEW-SITE client is never READY while the domain or their
     authority to connect it is unresolved. Only the client's own onboarding answers can satisfy it —
     what Sales heard (lead.domain_control) is shown, never counted. Optimising their own site does not
     need it (NOT NEEDED). */
  /* ⚠️ NO ONBOARDING ROW = NOT ANSWERED, never "not needed": without the client's answers we cannot
     know whether this is a new-site build, and absence is never an answer (CLAUDE.md §4). */
  const domain = domainAuthority(domainInputFromRow(O));
  const domainRequired = !O || domain.applies;
  add({
    key: 'domain', label: 'Domain / authority', ok: !!O && domain.ready, required: domainRequired, notNeeded: !domainRequired,
    source: domain.applies && O ? 'onboarding' : null, who: 'client',
    detail: !O ? "The client hasn't answered the domain questions yet"
      : !domain.applies ? 'Not needed — we work on their own site'
      : domain.ready ? (domain.mayReuseExistingSite ? 'DOMAIN READY · may reuse their current site' : 'DOMAIN READY · fresh build (no rights to reuse the current site)')
      : `DOMAIN / AGENCY ISSUE: ${domain.reasons.map((r) => DOMAIN_REASON_TEXT[r]).join(', ')}`,
  });

  /* The client's own details form (the two fields the baseline waits for — questionnaireComplete). */
  const obMissing = missingQuestionnaireFields(O ?? undefined);
  add({
    key: 'onboarding', label: 'Client onboarding', ok: !!O && obMissing.length === 0, required: true,
    source: O && obMissing.length === 0 ? 'onboarding' : null, who: 'client',
    detail: !O ? 'Not started' : obMissing.length === 0 ? 'Complete' : 'Started — their services and main town are still to come',
  });
  if (L.service_terminated_at) {
    add({ key: 'service', label: 'Service active', ok: false, required: true, source: 'findable', who: 'findable', detail: serviceEndView(L)?.summary ?? 'The service has ended' });
  }

  const req = items.filter((i) => i.required);
  const missingItems = req.filter((i) => !i.ok);
  const missing = missingItems.map((i) => i.label);
  const order: HandoffWho[] = ['sales', 'client', 'findable'];
  const waitingOn = missingItems.length ? order.find((w) => missingItems.some((i) => i.who === w)) ?? 'findable' : null;
  const ready = missing.length === 0;
  return { ready, label: ready ? READY_LABEL : WAITING_LABEL, items, missing, waitingOn, done: req.length - missingItems.length, total: req.length, domain };
}

/** One line for an email or a list cell: "READY TO SUBMIT" or "WAITING FOR INFORMATION: Services, GBP access". */
export function handoffLine(r: HandoffReadiness): string {
  return r.ready ? r.label : `${r.label}: ${r.missing.join(', ')}`;
}

/** "Waiting for the client" / "Waiting for sales" / "Waiting for Findable". */
export const WAITING_ON_LABEL: Record<HandoffWho, string> = {
  sales: 'WAITING FOR SALES', client: 'WAITING FOR CLIENT', findable: 'WAITING FOR FINDABLE',
};
