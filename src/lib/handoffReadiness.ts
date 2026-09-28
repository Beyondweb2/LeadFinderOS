/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID-CLIENT HANDOFF: READY TO START, or MISSING INFORMATION  (2026-09-28, docs/self-sourced-handoff.md)

   ONE RULE, read by Paid Clients (list + client page, via paid-client-hub) and the payment email
   (stripe-webhook). It answers one question: when Paul takes over, can he start, or what must he chase?
   It is a HANDOFF quality check, not project management — it never stores anything (derived, never
   stored: CLAUDE.md §6), so a late onboarding answer or a salesperson's edit changes it at once.

   ⛔ EITHER SOURCE SATISFIES AN ITEM — the client's onboarding answers OR what Sales already collected
   on the lead (services_included / service_areas / website_control). Nothing is copied between them:
   onboarding outranks the lead when both exist (the same rank clientFacts / clientContext use), and the
   item says which source it read, so Paul can see "from Sales" and confirm it with the client.
   ⛔ POSITIVE MATCHES ONLY. An unknown value is MISSING, never "fine" (CLAUDE.md §4): website control
   'unknown' is not an answer; a GBP invite the client says they "will do" is not access.
   ⚠️ Edge-reachable (stripe-webhook, paid-client-hub): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isPaidLead } from './leadPayment.ts';
import { effectiveQuestionnaireServices } from './questionnaireComplete.ts';
import { DOMAIN_REASON_TEXT, domainAuthority, domainInputFromRow, type DomainAuthorityVerdict, type DomainRow } from './domainAuthority.ts';

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
  /** Findable ended the service (domain / authority dispute). A terminated client is never ready. */
  service_terminated_at?: string | null;
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
}

export interface HandoffEvidence {
  /** A prospect audit exists for this lead (hook / quick check / free check). Shown, never required. */
  hookAudit: boolean;
  /** A crawl of the lead's site is on file (lead_crawl_checks). Required only when there is a site. */
  crawl: boolean;
}

export type HandoffSource = 'onboarding' | 'sales' | 'findable' | 'payment' | null;
export type HandoffKey =
  | 'paid' | 'business' | 'contact' | 'services' | 'service_areas' | 'website' | 'website_access'
  | 'gbp_access' | 'crawl' | 'hook_audit' | 'domain' | 'service';

export interface HandoffItem {
  key: HandoffKey;
  label: string;
  ok: boolean;
  /** Required for READY TO START. hook_audit is informational. */
  required: boolean;
  source: HandoffSource;
  detail: string;
}

export interface HandoffReadiness {
  ready: boolean;
  /** READY TO START / MISSING INFORMATION — the two words Paul reads. */
  label: 'READY TO START' | 'MISSING INFORMATION';
  items: HandoffItem[];
  /** The labels of the required items that are not ok, in order. Empty when ready. */
  missing: string[];
  /** DOMAIN READY / DOMAIN / AGENCY ISSUE / NOT NEEDED, with the reasons (src/lib/domainAuthority.ts). */
  domain: DomainAuthorityVerdict;
}

/** Delivery checklist key Findable ticks by hand once the GBP invite has actually arrived. Same key
 *  as deliveryCockpit's GBP_ACCESS_CHECKLIST_KEY (held equal by scripts/self-sourced-handoff.test.ts). */
export const HANDOFF_GBP_CHECKLIST_KEY = 'gbp_access';

const WEBSITE_ROUTES = new Set(['optimise_existing', 'rebuild_existing', 'new_site']);
const WEBSITE_MANAGERS = new Set(['direct_access', 'web_company']);
const WEBSITE_CONTROL_KNOWN: Record<string, string> = {
  client_controls: 'the client controls it',
  agency_controls: 'an agency controls it',
  third_party_profile_only: 'only a third-party profile',
  no_website: 'no website',
};

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const splitList = (v: unknown): string[] => text(v).split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const preview = (xs: string[]) => (xs.length > 4 ? `${xs.slice(0, 4).join(', ')} +${xs.length - 4} more` : xs.join(', '));

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
    key: 'paid', label: 'Payment confirmed', ok: paid, required: true, source: paid ? 'payment' : null,
    detail: paid ? 'Payment recorded' : L.status === 'refunded' ? 'Refunded' : L.status === 'payment_received' ? 'Marked paid, but no amount is recorded' : 'No payment recorded',
  });

  const name = text(L.business_name);
  add({ key: 'business', label: 'Business name', ok: !!name, required: true, source: name ? 'sales' : null, detail: name || 'Missing' });

  const phone = text(O?.confirmed_phone) || text(L.phone);
  const email = text(O?.contact_email) || text(L.email);
  add({
    key: 'contact', label: 'Phone or email', ok: !!(phone || email), required: true,
    source: text(O?.confirmed_phone) || text(O?.contact_email) ? 'onboarding' : phone || email ? 'sales' : null,
    detail: [phone, email].filter(Boolean).join(' · ') || 'No way to contact the client',
  });

  // Services: onboarding first, else what Sales entered. Lists are never merged.
  const obServices = effectiveQuestionnaireServices(O ?? undefined);
  const salesServices = list(L.services_included);
  const services = obServices.length ? obServices : salesServices;
  add({
    key: 'services', label: 'Main services', ok: services.length > 0, required: true,
    source: obServices.length ? 'onboarding' : salesServices.length ? 'sales' : null,
    detail: services.length ? preview(services) : 'Not given by the client or by Sales',
  });

  const obAreas = list(O?.areas_list).length ? list(O?.areas_list) : splitList(O?.areas_wanted);
  const salesAreas = list(L.service_areas);
  const areas = obAreas.length ? obAreas : salesAreas;
  add({
    key: 'service_areas', label: 'Service areas', ok: areas.length > 0, required: true,
    source: obAreas.length ? 'onboarding' : salesAreas.length ? 'sales' : null,
    detail: areas.length ? preview(areas) : 'Not given by the client or by Sales',
  });

  // Website: a site on file, or a positive "no website / build a new one".
  const site = text(O?.business_website) || text(L.website);
  const control = text(L.website_control);
  const noSite = !site && (O?.website_route === 'new_site' || control === 'no_website');
  add({
    key: 'website', label: 'Website', ok: !!site || noSite, required: true,
    source: text(O?.business_website) ? 'onboarding' : site ? 'sales' : O?.website_route === 'new_site' ? 'onboarding' : noSite ? 'sales' : null,
    detail: site ? site.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '') : noSite ? 'No website — Findable builds one' : 'Not known whether they have a website',
  });

  // Who controls the site (onboarding's route / manager, else the salesperson's record).
  const route = text(O?.website_route);
  const manager = text(O?.website_manager);
  const accessFromOnboarding = WEBSITE_ROUTES.has(route) || WEBSITE_MANAGERS.has(manager);
  const accessFromSales = control in WEBSITE_CONTROL_KNOWN;
  add({
    key: 'website_access', label: 'Website access / control', ok: noSite || accessFromOnboarding || accessFromSales, required: true,
    source: accessFromOnboarding ? 'onboarding' : accessFromSales ? 'sales' : noSite ? 'onboarding' : null,
    detail: noSite ? 'Nothing to access — new site'
      : accessFromOnboarding ? [route && route.replace(/_/g, ' '), manager === 'web_company' ? 'a web company manages it' : manager === 'direct_access' ? 'they manage it themselves' : ''].filter(Boolean).join(' · ')
      : accessFromSales ? `Sales: ${WEBSITE_CONTROL_KNOWN[control]}`
      : 'Not known who controls the website',
  });

  // GBP: Findable's own tick wins; "client says done" is enough to start; anything else is missing.
  const confirmed = L.delivery_checklist?.[HANDOFF_GBP_CHECKLIST_KEY] === true;
  const says = text(O?.gbp_status);
  add({
    key: 'gbp_access', label: 'Google Business Profile access', ok: confirmed || says === 'done', required: true,
    source: confirmed ? 'findable' : says ? 'onboarding' : null,
    detail: confirmed ? 'Confirmed by Findable'
      : says === 'done' ? 'Client says the invite is sent — not yet confirmed by Findable'
      : says === 'will_do' ? 'Client said they will do it later'
      : says === 'no_access' ? 'Client cannot get into their profile'
      : 'Not asked or not answered yet',
  });

  add({
    key: 'crawl', label: 'Website crawl', ok: evidence.crawl || noSite, required: !!site,
    source: evidence.crawl ? 'findable' : null,
    detail: evidence.crawl ? 'On file' : noSite ? 'No site to crawl' : site ? 'Not crawled yet' : 'No website on file',
  });
  add({
    key: 'hook_audit', label: 'Hook Audit', ok: evidence.hookAudit, required: false,
    source: evidence.hookAudit ? 'findable' : null, detail: evidence.hookAudit ? 'On file' : 'None run',
  });

  /* ⛔ THE DOMAIN RULE (Paul, 2026-09-28): a NEW-SITE client is never READY TO START while the domain
     or their authority to connect it is unresolved. Only the client's own onboarding answers can
     satisfy it — what Sales heard (lead.domain_control) is shown, never counted. Optimising their own
     site does not need it (NOT NEEDED). */
  /* ⚠️ NO ONBOARDING ROW = NOT ANSWERED, never "not needed": without the client's answers we cannot
     know whether this is a new-site build, and absence is never an answer (CLAUDE.md §4). */
  const domain = domainAuthority(domainInputFromRow(O));
  add({
    key: 'domain', label: 'Domain / authority', ok: !!O && domain.ready, required: !O || domain.applies,
    source: domain.applies && O ? 'onboarding' : null,
    detail: !O ? "The client hasn't answered the domain questions yet"
      : !domain.applies ? 'Not needed — we work on their own site'
      : domain.ready ? (domain.mayReuseExistingSite ? 'DOMAIN READY · may reuse their current site' : 'DOMAIN READY · fresh build (no rights to reuse the current site)')
      : `DOMAIN / AGENCY ISSUE: ${domain.reasons.map((r) => DOMAIN_REASON_TEXT[r]).join(', ')}`,
  });
  if (L.service_terminated_at) {
    add({ key: 'service', label: 'Service active', ok: false, required: true, source: 'findable', detail: 'Findable ended the service (domain / authority dispute)' });
  }

  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.label);
  return { ready: missing.length === 0, label: missing.length === 0 ? 'READY TO START' : 'MISSING INFORMATION', items, missing, domain };
}

/** One line for an email or a list cell: "READY TO START" or "MISSING INFORMATION: services, GBP access". */
export function handoffLine(r: HandoffReadiness): string {
  return r.ready ? r.label : `${r.label}: ${r.missing.join(', ')}`;
}
