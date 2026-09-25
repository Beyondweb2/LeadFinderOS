/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT BUILD FACTS — what the website may say about this client, and what it may not.

   Candidates are PRELOADED from what Findable already stores (onboarding, the paid lead row, the
   baseline's context, a Discovery scan, the stored crawl's site info). Nothing is fetched and
   nothing is crawled to produce them. Paul then approves, edits or rejects each one; his decisions
   are stored in website_build.facts and win over the candidate.

   ⛔ ONLY `verified` IS PUBLISHABLE. Everything else — detected, missing, rejected, not applicable —
   is on the forbidden side of the generated prompts. Positive match, never "not rejected".
   ⛔ DEFAULTS ARE CONSERVATIVE. A candidate starts `verified` only when the CLIENT stated it at
   onboarding and no other source disagrees. The paid lead row (mostly Google Places), the baseline
   context, Discovery and the crawl all start as `detected` — needs approval.
   ⛔ A DISAGREEMENT IS SHOWN, NOT SETTLED. A conflict makes the row `detected` with both values named.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { FACT_SOURCE_LABELS, resolveClientFacts, type ClientFacts, type FactSource, type ResolvedFact, type ResolvedListFact } from './clientFacts.ts';
import type { BuildFact, FactBasis, FactStatus, StoredFactStatus } from './websiteBuildState.ts';
import type { WebsiteTemplate } from './websiteTemplates.ts';
import { CORE_BUILD_FACTS } from './websiteTemplates.ts';
import type { SiteInfo } from './siteInfo.ts';
import type { FullCrawlEvidence } from './fullCrawl.ts';

export interface FactsContext {
  lead: Record<string, unknown> | null;
  onboarding: Record<string, unknown> | null;
  baseline_audit: Record<string, unknown> | null;
  discovery_audit: Record<string, unknown> | null;
  crawl: { url?: string | null; created_at?: string | null; mode?: string | null; result?: { siteInfo?: SiteInfo | null } | null; full_evidence?: Partial<FullCrawlEvidence> | null } | null;
}

export interface FactRow {
  key: string;
  label: string;
  value: string;
  status: FactStatus;
  source: string;
  /** Why this row needs a look — a conflict, or the source has changed since Paul approved it. */
  note: string;
  /** True when Paul's decision is stored for this key (so "reset" means something). */
  decided: boolean;
  /** Whether the selected template treats this fact as required. */
  required: boolean;
  /** Where the value was seen (URL or short context) — Paul's, stored with the decision. */
  source_url: string;
  /** Paul's notes on the fact. Never published. */
  notes: string;
  /** Why it is verified (Phase 3): operator / source_site / client, '' when not verified. */
  basis: FactBasis;
}

const CRAWL_SOURCE = "client's current website (stored crawl)";

interface Candidate { key: string; label: string; value: string; source: string; status: StoredFactStatus; note: string }

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
const srcLabel = (s: FactSource | null) => (s ? FACT_SOURCE_LABELS[s] : '');

function fromScalar(key: string, f: ResolvedFact, label = f.label): Candidate | null {
  if (!f.value) return null;
  const conflict = f.conflicts.map((c) => `${FACT_SOURCE_LABELS[c.source]} says "${c.value}"`).join('; ');
  return {
    key, label, value: f.value, source: srcLabel(f.source),
    status: f.source === 'onboarding' && !conflict ? 'verified' : 'detected',
    note: conflict ? `Sources disagree: ${conflict}. Confirm which is current.` : '',
  };
}

function fromList(key: string, f: ResolvedListFact, label = f.label): Candidate | null {
  if (!f.values.length) return null;
  const conflict = f.conflicts.map((c) => `${FACT_SOURCE_LABELS[c.source]} lists "${c.values.join(', ')}"`).join('; ');
  return {
    key, label, value: f.values.join(', '), source: srcLabel(f.source),
    status: f.source === 'onboarding' && !conflict ? 'verified' : 'detected',
    note: conflict ? `Sources disagree: ${conflict}. Not merged — confirm the real list.` : '',
  };
}

/** Add a crawl-seen value: fills a gap as `detected`, or annotates a disagreement on an existing row. */
function withCrawl(c: Candidate | null, key: string, label: string, crawlValue: string | null | undefined): Candidate | null {
  const v = String(crawlValue ?? '').trim();
  if (!v) return c;
  if (!c) return { key, label, value: v, source: CRAWL_SOURCE, status: 'detected', note: '' };
  if (norm(c.value) === norm(v) || norm(c.value).replace(/\s/g, '') === norm(v).replace(/\s/g, '')) return c;
  return { ...c, status: 'detected', note: [c.note, `The current website shows "${v}".`].filter(Boolean).join(' ') };
}

/** Every candidate fact Findable's stored records can offer. Pure; no I/O. */
export function candidateFacts(ctx: FactsContext, savedCanonicalDomain = ''): Candidate[] {
  const facts: ClientFacts = resolveClientFacts({
    lead: ctx.lead as never, onboarding: ctx.onboarding as never,
    baselineAudit: ctx.baseline_audit as never, discoveryAudit: ctx.discovery_audit as never,
    savedCanonicalDomain: savedCanonicalDomain || null,
  });
  const si = ctx.crawl?.result?.siteInfo ?? null;
  /* The FULL manual crawl's evidence, when the latest crawl is one. Every value it adds is DETECTED
     and names where it was read; none can be verified without Paul approving it. */
  const full = ctx.crawl?.mode === 'full' ? (ctx.crawl.full_evidence ?? null) : null;
  const seenList = (xs: Array<{ value: string }> | undefined, n = 6) => (xs ?? []).slice(0, n).map((x) => x.value).join(' | ');
  const lead = ctx.lead ?? {};
  const ob = ctx.onboarding ?? {};

  const address = (() => {
    const obAddr = String((ob as { business_address?: unknown }).business_address ?? '').trim();
    const leadAddr = String((lead as { address?: unknown }).address ?? '').trim();
    const base: Candidate | null = obAddr
      ? { key: 'address', label: 'Business address', value: obAddr, source: FACT_SOURCE_LABELS.onboarding, status: 'verified', note: '' }
      : leadAddr ? { key: 'address', label: 'Business address', value: leadAddr, source: FACT_SOURCE_LABELS.client_record, status: 'detected', note: '' } : null;
    return withCrawl(base, 'address', 'Business address', si?.address);
  })();

  const owner = facts.contactName.value
    ? { key: 'owner_name', label: 'Owner / person customers deal with', value: facts.contactName.value, source: srcLabel(facts.contactName.source), status: 'detected' as const,
        note: 'This is the contact name on record. Confirm they are happy to be named on the website.' }
    : null;

  const list: Array<Candidate | null> = [
    fromScalar('business_name', facts.businessName),
    fromScalar('trade', facts.category, 'Trade / category'),
    withCrawl(fromScalar('phone', facts.phone, 'Phone number'), 'phone', 'Phone number', si?.phone),
    withCrawl(fromScalar('email', facts.email), 'email', 'Email', si?.email),
    address,
    fromScalar('primary_town', facts.primaryLocation, 'Home town'),
    fromList('service_areas', facts.areas),
    fromList('services', facts.services),
    si?.services?.length ? { key: 'services_on_site', label: 'Services named on the current site (raw menu text — edit before approving)', value: si.services.join(', '), source: CRAWL_SOURCE, status: 'detected', note: 'Menu and page-title text, so it includes non-services. Trim it, then approve — or copy the genuine ones into Services.' } : null,
    si?.towns?.length ? { key: 'towns_on_site', label: 'Towns with pages on the current site', value: si.towns.join(', '), source: CRAWL_SOURCE, status: 'detected', note: 'A town page existing is not proof they work there. Confirm with the client.' } : null,
    owner,
    fromScalar('website', facts.website, 'Current website'),
    fromScalar('accreditations', facts.accreditations, 'Accreditations / credentials / checks'),
    fromScalar('standout', facts.standout),
    si?.openingHours?.length ? { key: 'opening_hours', label: 'Opening hours / availability', value: si.openingHours.join('; '), source: CRAWL_SOURCE, status: 'detected', note: '' } : null,
    si?.socialLinks?.length ? { key: 'social_profiles', label: 'Social profiles', value: si.socialLinks.map((s) => s.url).join(', '), source: CRAWL_SOURCE, status: 'detected', note: '' } : null,
    si?.directories?.length ? { key: 'directory_profiles', label: 'Third-party / directory profiles', value: si.directories.join(', '), source: CRAWL_SOURCE, status: 'detected', note: 'Brand names seen on the site. Get the real profile URLs before approving.' } : null,
    si?.companyNumber ? { key: 'company_number', label: 'Company number', value: si.companyNumber, source: CRAWL_SOURCE, status: 'detected', note: '' } : null,
    full?.business?.credentials?.length ? { key: 'credentials_on_site', label: 'Credentials / memberships the current site mentions', value: seenList(full.business.credentials, 10), source: CRAWL_SOURCE, status: 'detected', note: 'A mention on the site is not proof. Confirm each one (and get the member number) before approving.' } : null,
    full?.business?.guarantees?.length ? { key: 'guarantees_on_site', label: 'Guarantees / warranties the current site states', value: seenList(full.business.guarantees), source: CRAWL_SOURCE, status: 'detected', note: 'Only publish a guarantee the client confirms they still offer.' } : null,
    full?.business?.experience?.length ? { key: 'experience_on_site', label: 'Experience / established claims on the current site', value: seenList(full.business.experience), source: CRAWL_SOURCE, status: 'detected', note: 'Figures go stale — confirm the current number of years.' } : null,
    full?.business?.people?.length ? { key: 'people_on_site', label: 'People named on the current site', value: seenList(full.business.people), source: CRAWL_SOURCE, status: 'detected', note: 'Confirm they are happy to be named.' } : null,
    full?.business?.profiles?.length ? { key: 'profiles_on_site', label: 'Third-party profile links on the current site', value: full.business.profiles.slice(0, 12).map((p) => p.value).join(', '), source: CRAWL_SOURCE, status: 'detected', note: 'Check each link still resolves to this business.' } : null,
    full?.business?.logo ? { key: 'logo_on_site', label: 'Logo on the current site', value: full.business.logo, source: CRAWL_SOURCE, status: 'detected', note: 'Reuse only if the client owns it.' } : null,
    /* ⛔ NOT the onboarding GBP answers: "yes_all" is a consent / access status, not something a
       website states. It was listed as a publishable fact on the first production run (SC Plumbing,
       2026-09-23). A Google profile belongs on the site only as a verified review-profile URL. */
  ];
  /* ⛔ WHO TYPED THE ONBOARDING ANSWERS IS SAID OUT LOUD. Answers the operator entered on the
     client's behalf are used exactly like the client's own, but the source never claims the client
     wrote them. */
  const operatorEntered = String((ob as { client_source?: unknown }).client_source ?? '') === 'manual'
    || !!String((ob as { operator_edited_at?: unknown }).operator_edited_at ?? '').trim();
  const onboardingLabel = FACT_SOURCE_LABELS.onboarding;
  /* ⛔ An onboarding the OPERATOR typed (client_source 'manual' — no client ever submitted it) is
     SOURCE MATERIAL, not the client's word: every value starts NEEDS APPROVAL (Paul, 2026-09-25, the
     BS4 pilot — 26 pasted crawl service strings and a disputed base town had auto-verified). A
     client-submitted form that an operator later edited keeps the client's standing. */
  const manual = String((ob as { client_source?: unknown }).client_source ?? '') === 'manual';
  return list.filter((c): c is Candidate => !!c)
    .map((c) => {
      if (!(operatorEntered && c.source === onboardingLabel)) return c;
      const relabelled = { ...c, source: onboardingLabel + ' (entered by operator)' };
      return manual && c.status === 'verified'
        ? { ...relabelled, status: 'detected' as const, note: [c.note, 'Entered by an operator, not submitted by the client — confirm before publishing.'].filter(Boolean).join(' ') }
        : relabelled;
    });
}

/**
 * The fact list the screen shows and the prompts are built from: candidates, overridden by Paul's
 * stored decisions, plus his own added facts, plus a MISSING row for every template fact nobody has.
 */
export function mergeFacts(candidates: Candidate[], stored: BuildFact[], template: WebsiteTemplate | null): FactRow[] {
  const byKey = new Map(stored.map((f) => [f.key, f]));
  const specs = template?.facts ?? CORE_BUILD_FACTS;
  const required = new Set(specs.filter((f) => f.required).map((f) => f.key));
  const rows: FactRow[] = [];
  const seen = new Set<string>();
  const push = (r: FactRow) => { if (!seen.has(r.key)) { seen.add(r.key); rows.push(r); } };

  for (const c of candidates) {
    const s = byKey.get(c.key);
    if (s) {
      const drift = s.status === 'verified' && c.value && norm(c.value) !== norm(s.value)
        ? `Since you approved this, ${c.source} says "${c.value}".` : '';
      push({ key: c.key, label: s.label || c.label, value: s.value, status: s.value ? s.status : (s.status === 'verified' || s.status === 'detected' ? 'missing' : s.status),
        source: s.source || c.source, note: drift, decided: true, required: required.has(c.key), source_url: s.source_url ?? '', notes: s.notes ?? '', basis: s.basis ?? '' });
    } else {
      push({ ...c, decided: false, required: required.has(c.key), source_url: '', notes: '', basis: c.status === 'verified' ? 'client' : '' });
    }
  }
  for (const s of stored) {
    push({ key: s.key, label: s.label, value: s.value, status: s.value ? s.status : (s.status === 'verified' || s.status === 'detected' ? 'missing' : s.status),
      source: s.source || 'added by Paul', note: '', decided: true, required: required.has(s.key), source_url: s.source_url ?? '', notes: s.notes ?? '', basis: s.basis ?? '' });
  }
  for (const spec of specs) {
    push({ key: spec.key, label: spec.label, value: '', status: 'missing', source: '', note: spec.hint ?? '', decided: false, required: spec.required, source_url: '', notes: '', basis: '' });
  }
  /* What needs Paul first: the ones awaiting a decision, then what is settled. Stable within a group. */
  const ORDER: Record<FactStatus, number> = { detected: 0, verified: 1, missing: 2, rejected: 3, not_applicable: 3 };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => ORDER[a.r.status] - ORDER[b.r.status] || a.i - b.i).map((x) => x.r);
}

/** Only these reach the website. */
export const isPublishable = (r: FactRow) => r.status === 'verified' && !!r.value;

export interface FactsSummary { verified: number; awaiting: number; missing: number; requiredMissing: string[]; rejected: number }

export function factsSummary(rows: FactRow[]): FactsSummary {
  return {
    verified: rows.filter(isPublishable).length,
    awaiting: rows.filter((r) => r.status === 'detected').length,
    missing: rows.filter((r) => r.status === 'missing').length,
    requiredMissing: rows.filter((r) => r.required && !isPublishable(r)).map((r) => r.label),
    rejected: rows.filter((r) => r.status === 'rejected' || r.status === 'not_applicable').length,
  };
}

/* ── template claim mapping ───────────────────────────────────────────────────────────────────── */

export type ClaimVerdict = 'verified' | 'needs_approval' | 'missing' | 'not_applicable';
export const CLAIM_VERDICT_LABELS: Record<ClaimVerdict, string> = {
  verified: 'VERIFIED FOR THIS CLIENT — may be used',
  needs_approval: 'DETECTED BUT NOT VERIFIED — do not publish until approved',
  missing: 'MISSING — remove the section / claim',
  not_applicable: 'NOT APPLICABLE — remove',
};

export interface ClaimMapping { id: string; label: string; sourceExample: string; verdict: ClaimVerdict; clientValue: string }

/** For every client-specific claim the template carries: may an equivalent appear for THIS client? */
export function mapTemplateClaims(template: WebsiteTemplate, rows: FactRow[]): ClaimMapping[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return template.claims.map((c) => {
    const r = byKey.get(c.factKey);
    const verdict: ClaimVerdict = !r || r.status === 'missing' ? 'missing'
      : isPublishable(r) ? 'verified'
      : r.status === 'detected' ? 'needs_approval'
      : 'not_applicable';
    return { id: c.id, label: c.label, sourceExample: c.sourceExample, verdict, clientValue: verdict === 'verified' ? r!.value : '' };
  });
}

/** The row → the stored decision it becomes when Paul acts on it. Source URL and notes travel with it. */
export function decide(row: FactRow, status: StoredFactStatus, value = row.value): BuildFact {
  /* Approving is Paul's decision, whatever the value's origin. */
  return { key: row.key, label: row.label, value: value.trim(), status, source: row.source, source_url: row.source_url, notes: row.notes, basis: status === 'verified' ? 'operator' : '' };
}

/** Change a row's source URL / notes WITHOUT deciding it: the status it already has is kept
 *  (a MISSING row is stored as needs-approval with no value, which still reads as missing). */
export function annotate(row: FactRow, over: { source_url?: string; notes?: string }): BuildFact {
  const status: StoredFactStatus = row.status === 'missing' ? 'detected' : row.status;
  return { ...decide(row, status), basis: row.status === 'verified' ? row.basis : '', ...over };
}

/**
 * Facts pasted back from the capture ("Label: value" per line) become DETECTED rows — Paul still
 * approves each one. A label that matches a template fact's label or key reuses that key.
 */
export function parseFactLines(text: string, template: WebsiteTemplate | null, source: string): BuildFact[] {
  const specs = template?.facts ?? [];
  const out: BuildFact[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    const m = /^([^:]{2,80}):\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim(), value = m[2].trim();
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const spec = specs.find((s) => s.key === slug || s.label.toLowerCase() === label.toLowerCase());
    const key = spec?.key ?? ('custom_' + slug).slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: spec?.label ?? label, value, status: 'detected', source, source_url: '', notes: '', basis: '' });
  }
  return out;
}
