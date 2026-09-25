/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the shapes.

   An OUTREACH tool, not a Website Build. One replacement homepage + one evidence card + screenshots,
   generated on an operator's click for a prospect whose AI audit went badly. It never touches
   `outreach_leads.website_build`, the Website Build templates' rows, or any paid-client surface.

   ⛔ THE PROSPECT-SPECIFIC PART IS DATA, NEVER CODE. A template renders a ProspectConfig; the config
   holds only values that came from this prospect's own records (lead row, audit, crawl, their own
   public website). Every value carries its SOURCE so the operator can see where a line came from,
   and so the contamination check can tell "theirs" from "someone else's".

   Pure and edge-reachable: relative `.ts` imports only, no fetch, no DOM, no platform globals.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Where a value came from. "existing_site" = the business states it on its own public website
 *  (the Findable source-site rule) — reusable, never "verified". */
export type FactSource = 'lead_record' | 'outreach_contact' | 'google_places' | 'ai_audit' | 'existing_site' | 'crawl' | 'fixture';

export const FACT_SOURCE_LABELS: Record<FactSource, string> = {
  lead_record: 'Lead record',
  outreach_contact: 'LeadFinder contact number (the number we are messaging) — outreach preview only',
  google_places: 'Google Business Profile (via Places)',
  ai_audit: 'AI audit',
  existing_site: 'Existing client website',
  crawl: 'Existing crawl of their site',
  fixture: 'Test fixture',
};

export interface Sourced<T> {
  value: T;
  source: FactSource;
  /** The page the value was read from, when it came from a page. */
  url?: string | null;
  /** The words on the page, when a sentence carried it. */
  quote?: string | null;
}

/** Two sources disagree. Flagged for the operator; the value is NOT used on the page. */
export interface FactConflict {
  field: string;
  values: Array<{ value: string; source: FactSource; url?: string | null }>;
  note: string;
}

export interface ProspectBrand {
  /** The prospect's genuine logo, as found on their site. Never redrawn. */
  logoUrl: Sourced<string> | null;
  /** Brand colours read from their site (theme-color, CSS custom properties, dominant CSS colours). */
  primary: Sourced<string> | null;
  accent: Sourced<string> | null;
  /** Genuine business photos from their site (not icons, not logos, not stock-looking sprites). */
  photos: Array<Sourced<string>>;
}

export interface ProspectService {
  name: string;
  /** A sentence from their own site about it, when one exists. Never written by us. */
  description: string | null;
  source: FactSource;
  url?: string | null;
}

export interface ProspectConfig {
  /** Stable key of the trade family, e.g. 'electrician', 'plumber'. */
  tradeKey: string;
  /** The trade as a customer would say it, singular ("electrician"). */
  tradeLabel: string;
  business: {
    name: Sourced<string>;
    website: Sourced<string> | null;
    phone: Sourced<string> | null;
    email: Sourced<string> | null;
    address: Sourced<string> | null;
    town: Sourced<string>;
    openingHours: Sourced<string[]> | null;
    /** The number their WEBSITE shows, kept as its own fact. Never overwritten by the outreach
     *  number; when the two differ the preview's CTA uses the outreach number and this is flagged. */
    websitePhone: Sourced<string> | null;
  };
  brand: ProspectBrand;
  services: ProspectService[];
  /** Genuine service areas — home town first. A town that only exists as a mass-generated URL is
   *  NOT here (see facts.ts); it is listed under `rejectedAreas` for the operator. */
  areas: Array<Sourced<string>>;
  proof: {
    credentials: Array<Sourced<string>>;
    yearsTrading: Sourced<string> | null;
    rating: Sourced<{ rating: number; count: number }> | null;
    summary: Sourced<string> | null;
  };
  conflicts: FactConflict[];
  /** Operator-only notes: missing logo, poor logo, no photos, areas rejected, etc. */
  flags: string[];
  rejectedAreas: string[];
  /** What a PAID build would have to resolve with the client before production (the outreach
   *  preview may proceed). */
  requiresResolution: string[];
}

/* ─────────────────────────────── templates ─────────────────────────────── */

export type HomepageSectionId =
  | 'header' | 'hero' | 'trust' | 'services' | 'about' | 'areas' | 'proof' | 'faq' | 'contact' | 'footer';

/**
 * A design that renders ANY prospect's config for the trades it supports.
 *
 * ⛔ A TEMPLATE CARRIES NO CLIENT DATA. No default phone, name, town, photo, review, credential or
 * price — a template that needs a value it was not given leaves the section out. The contamination
 * check (contamination.ts) is the backstop, not the design.
 */
export interface ProspectTemplate {
  id: string;
  version: string;
  name: string;
  /** Trade keys this design is approved for; '*' = trade-agnostic. */
  trades: readonly string[] | '*';
  /** 'approved' = a Findable trade template signed off for prospect use; 'demo' = the built-in
   *  demonstration design, used only when no approved template covers the trade. */
  status: 'approved' | 'demo';
  sections: readonly HomepageSectionId[];
  /** The most images this design shows — the ONLY images the pipeline copies from their site. */
  imageBudget: { logo: boolean; photos: number };
  render(cfg: ProspectConfig, opts?: { year?: number }): string;
}

/* ─────────────────────────────── audit + findings ─────────────────────────────── */

export interface ProspectHeadline {
  auditId: string;
  runId: string | null;
  /** The customer-style question, verbatim as it was asked. */
  question: string;
  /** Engines that answered it ("ChatGPT", "Gemini"). */
  engines: string[];
  /** Businesses AI named instead, as the audit recorded them (cleaned run only). */
  competitors: string[];
  /** The prospect was not named on this question on any engine that answered. */
  prospectNamed: boolean;
  trade: string | null;
  town: string | null;
  /** Named in N of M answers across the whole audit. */
  namedDatapoints: number | null;
  totalDatapoints: number | null;
  /** Named / asked per scored engine across the whole audit (the report's `perEngine`). Absent on
   *  rows stored before it existed — eligibility then falls back to the overall share. */
  perEngine?: Array<{ label: string; named: number; total: number }>;
}

export interface CardFinding {
  id: string;
  /** Short, phone-readable line for the card ("AI search crawlers are blocked"). */
  line: string;
  /** The plain-English detail, for the operator. */
  detail: string;
  strength: number;
  source: string;
}

export interface FindingSelection {
  primary: CardFinding | null;
  secondary: CardFinding[];
  /** No technical finding worth leading with: the card uses the truthful fallback hook. */
  fallback: boolean;
  fallbackReason: string | null;
}

/* ─────────────────────────────── status + storage ─────────────────────────────── */

export const PREVIEW_STATUSES = [
  'not_generated', 'gathering', 'selecting_template', 'building', 'rendering', 'ready', 'failed',
] as const;
export type PreviewStatus = typeof PREVIEW_STATUSES[number];

export const PREVIEW_STATUS_LABELS: Record<PreviewStatus, string> = {
  not_generated: 'Not generated',
  gathering: 'Gathering business data',
  selecting_template: 'Selecting template',
  building: 'Building homepage',
  rendering: 'Rendering screenshots',
  ready: 'Ready',
  failed: 'Failed',
};

/** The images a preview produces. Keys are the stored asset names. */
export const PREVIEW_ASSETS = ['evidence_card', 'desktop_hero', 'desktop_full', 'mobile_hero', 'mobile_full'] as const;
export type PreviewAsset = typeof PREVIEW_ASSETS[number];

export const PREVIEW_ASSET_LABELS: Record<PreviewAsset, string> = {
  evidence_card: 'Evidence card',
  desktop_hero: 'Desktop — top of page',
  desktop_full: 'Desktop — full homepage',
  mobile_hero: 'Mobile — first screen',
  mobile_full: 'Mobile — full homepage',
};
