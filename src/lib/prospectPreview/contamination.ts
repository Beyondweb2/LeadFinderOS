/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — no other client's data, ever.

   A preview is refused (never stored, never shown) when its rendered HTML contains:
     1. IDENTITY FROM ANOTHER CLIENT — the Website Build templates' own forbidden seed values (read
        from websiteTemplates.ts, never copied) and the known client/pilot names below — unless the
        same value is genuinely this prospect's (a prospect IN Canterbury may say Canterbury).
     2. ANY PHONE, EMAIL OR WEB ADDRESS THAT IS NOT THIS PROSPECT'S. Structural, so it catches a
        client nobody listed: every tel:/mailto:/number/host in the output must be one the config
        holds (plus the font CDN and schema.org, which carry no identity).
   Templates hold no client data by design; this is the backstop that makes "by design" checkable.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ProspectConfig } from './types.ts';
import { WEBSITE_TEMPLATES, seedValueIn } from '../websiteTemplates.ts';
import { normalisePhone } from './facts.ts';

/** Real Findable clients and pilots whose identity must never appear on someone else's preview.
 *  Business names only — phones/emails/domains are caught structurally by rule 2. Hand-kept: add a
 *  client here when they sign. */
export const KNOWN_CLIENT_NAMES: readonly string[] = [
  'RG Locksmiths', "Ronnie's Shoe Repairs", 'SC Plumbing & Gas', 'SC Plumbing and Gas', 'BS4 Electrical',
  'MC Locksmiths', 'MCLocksmiths', 'ABLM',
];

/** Hosts a rendered page may reference that identify nobody. */
const NEUTRAL_HOSTS = /^(?:fonts\.googleapis\.com|fonts\.gstatic\.com|schema\.org|www\.w3\.org)$/i;

export interface ContaminationHit { rule: 'other_client' | 'foreign_contact'; value: string; why: string }

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

/** The prospect's IDENTITY only — an identity needle (another firm's name, phone, email, domain,
 *  address) is allowed only when it is one of THESE, never because it turned up in a service name. */
function identityCorpus(cfg: ProspectConfig): string {
  const b = cfg.business;
  return [b.name.value, b.website?.value, b.phone?.value, b.email?.value, b.address?.value].filter(Boolean).join(' | ').toLowerCase();
}
const IDENTITY_KINDS = new Set(['owner', 'business_name', 'domain', 'phone', 'email', 'address']);

function prospectCorpus(cfg: ProspectConfig): string {
  return JSON.stringify({ trade: [cfg.tradeKey, cfg.tradeLabel], business: cfg.business, services: cfg.services, areas: cfg.areas, proof: cfg.proof }).toLowerCase();
}

export function scanContamination(html: string, cfg: ProspectConfig, extraNeedles: readonly string[] = []): ContaminationHit[] {
  const hits: ContaminationHit[] = [];
  const own = prospectCorpus(cfg);
  const ownIdentity = identityCorpus(cfg);
  // Visible text + attribute values — the whole document, minus the tag syntax.
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  /* 1. another client's identity */
  const needles = [
    ...WEBSITE_TEMPLATES.flatMap((t) => t.forbiddenSeedValues.map((v) => ({ value: v.value, why: `${t.name} seed value (${v.kind})`, identity: IDENTITY_KINDS.has(v.kind) }))),
    ...KNOWN_CLIENT_NAMES.map((n) => ({ value: n, why: 'another Findable client', identity: true })),
    ...extraNeedles.map((n) => ({ value: n, why: 'another prospect / client value', identity: true })),
  ];
  for (const n of needles) {
    if (!n.value || !seedValueIn(text, n.value)) continue;
    // Towns, credentials, trade words: allowed when they are genuinely this prospect's. Identity: only
    // when it IS this prospect's identity.
    if (seedValueIn(n.identity ? ownIdentity : own, n.value.toLowerCase())) continue;
    hits.push({ rule: 'other_client', value: n.value, why: n.why });
  }

  /* 2. contact details that are not this prospect's */
  const phones = new Set([cfg.business.phone?.value].filter(Boolean).map((p) => normalisePhone(p!)));
  const emails = new Set([cfg.business.email?.value].filter(Boolean).map((e) => e!.toLowerCase()));
  const hosts = new Set([cfg.business.website?.value, cfg.brand.logoUrl?.value, ...cfg.brand.photos.map((p) => p.value)]
    .filter(Boolean).map((u) => hostOf(/^https?:/i.test(u!) ? u! : `https://${u}`)).filter(Boolean));
  for (const m of text.matchAll(/tel:([+\d]+)/g)) {
    if (!phones.has(normalisePhone(m[1]))) hits.push({ rule: 'foreign_contact', value: m[1], why: 'a phone link that is not the prospect’s number' });
  }
  const visible = text.replace(/<[^>]+>/g, ' ');
  for (const m of visible.matchAll(/(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g)) {
    const p = normalisePhone(m[0]);
    if (p.length >= 10 && !phones.has(p)) hits.push({ rule: 'foreign_contact', value: m[0].trim(), why: 'a phone number that is not the prospect’s' });
  }
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    if (!emails.has(m[0].toLowerCase())) hits.push({ rule: 'foreign_contact', value: m[0], why: 'an email address that is not the prospect’s' });
  }
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
    const h = hostOf(m[0]);
    if (!h || NEUTRAL_HOSTS.test(h) || hosts.has(h)) continue;
    hits.push({ rule: 'foreign_contact', value: h, why: 'a web address that is not the prospect’s site or assets' });
  }
  const seen = new Set<string>();
  return hits.filter((h) => { const k = `${h.rule}:${h.value.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
