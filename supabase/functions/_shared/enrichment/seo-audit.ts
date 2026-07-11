/**
 * SEO audit source — misceres/seo-audit-tool (Apify). Audits the business's LANDING PAGE
 * (single page) and grades it into the AI-audit report's SEO section: three categories
 * weighted toward AI visibility (Local Presence highest), rolled up to an A–F letter grade.
 *
 * Runs on the SAME plumbing as the other actors: runApifyActor (./apify.ts) +
 * runEnrichSource (./runner.ts) in the caller (process-ai-audit-queue). Registered in
 * ./sources.ts as `seo_audit`.
 *
 * The actor returns per-page boolean checks + raw data (no vendor grades); we compute the
 * grades in-house so they're tuned for AI visibility (location, schema, meta = high weight).
 */
import { runApifyActor } from "./apify.ts";

/** misceres/seo-audit-tool — actor id uses `~` in the API path. */
export const SEO_AUDIT_ACTOR = "misceres~seo-audit-tool";

export interface SeoFinding {
  label: string;
  ok: boolean;
  detail: string;
  weight: number;
}
export interface SeoCategory {
  key: string;
  label: string;
  score: number;   // 0–100
  grade: string;   // A+ … F
  findings: SeoFinding[];
}
export interface SeoResult {
  url: string;
  checked_at: string;
  overall: { score: number; grade: string };
  categories: SeoCategory[];
  raw: Record<string, unknown>;   // compact subset we scored, for traceability (not shown to clients)
}

/** Landing page ONLY — pin the crawl to a single page so it's fast + cheap. */
export function buildSeoInput(url: string): Record<string, unknown> {
  return {
    startUrl: url,
    maxRequestsPerCrawl: 1,
    maxDepth: 0,
    proxy: { useApifyProxy: true },
  };
}

/** Run the actor for one URL. Thin wrapper over runApifyActor. */
export async function runSeoAudit(
  url: string,
  opts: { token: string; timeoutMs?: number; retry?: { on429?: boolean; onAbort?: boolean } },
): Promise<{ items: unknown[]; ms: number }> {
  return await runApifyActor(SEO_AUDIT_ACTOR, buildSeoInput(url), opts);
}

/* ─────────────────────────────── grading ────────────────────────────────── */

// Category weights in the overall score — Local Presence (AI visibility) weighted highest
// so a site invisible to AI grades F overall regardless of clean technical basics.
const CATEGORY_WEIGHTS = { on_page: 0.30, local_presence: 0.50, content_tech: 0.20 };
// A common set of schema.org local-business @types (best-effort detection in the JSON-LD).
const LOCAL_SCHEMA_RE = /localbusiness|restaurant|barorpub|hairsalon|beautysalon|healthandbeautybusiness|professionalservice|store|cafeorcoffeeshop|barbershop|dentist|foodestablishment|nightclub/;

function letter(score: number): string {
  return score >= 95 ? "A+" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
}
function isTrue(v: unknown): boolean {
  return v === true;
}
function nonEmpty(v: unknown): boolean {
  if (v == null || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
  return !!v;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function categoryScore(findings: SeoFinding[]): number {
  const total = findings.reduce((a, f) => a + f.weight, 0);
  if (!total) return 0;
  const passed = findings.reduce((a, f) => a + (f.ok ? f.weight : 0), 0);
  return Math.round((passed / total) * 100);
}

/**
 * Grade a single-page audit into the report SEO shape. `items` is the actor's dataset
 * (we score items[0], the landing page). `location` (from the audit) powers the derived
 * "location in key tags" check.
 */
export function gradeSeo(items: unknown[], opts: { url: string; location?: string | null }): SeoResult {
  const item = ((Array.isArray(items) ? items[0] : items) ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof item[k] === "string" ? (item[k] as string) : "");

  // ── On-Page SEO ──
  const metaOk = isTrue(item.isMetaDescription) && isTrue(item.isMetaDescriptionEnoughLong);
  const titleOk = isTrue(item.isTitle) && isTrue(item.isTitleEnoughLong);
  const onPage: SeoFinding[] = [
    { label: "Meta description", ok: metaOk, weight: 3, detail: metaOk ? "Present, good length" : (isTrue(item.isMetaDescription) ? "Present but too short" : "Missing") },
    { label: "Page title", ok: titleOk, weight: 3, detail: titleOk ? "Present, good length" : (isTrue(item.isTitle) ? "Present but too short" : "Missing") },
    { label: "H1 heading", ok: isTrue(item.isH1), weight: 2, detail: isTrue(item.isH1) ? "Present" : "No H1 on the page" },
    { label: "Single H1", ok: isTrue(item.isH1OnlyOne), weight: 1, detail: isTrue(item.isH1OnlyOne) ? "Exactly one" : "None or multiple" },
  ];

  // ── Local Presence (AI visibility) ──
  const loc = (opts.location ?? "").trim().toLowerCase();
  const hay = `${str("title")} ${str("h1")} ${str("metaDescription")}`.toLowerCase();
  const hasSchema = nonEmpty(item.jsonLd) || isTrue(item.microdata) || nonEmpty(item.microdata);
  const localSchemaOk = hasSchema && LOCAL_SCHEMA_RE.test(JSON.stringify(item.jsonLd ?? "").toLowerCase());
  const local: SeoFinding[] = [];
  if (loc) {
    const locOk = hay.includes(loc);
    local.push({ label: "Location in title / H1 / description", ok: locOk, weight: 4, detail: locOk ? `“${opts.location}” found` : `“${opts.location}” not in the key tags` });
  }
  local.push({ label: "Structured data (schema)", ok: hasSchema, weight: 4, detail: hasSchema ? "Present" : "No JSON-LD or microdata" });
  local.push({ label: "Local business schema", ok: localSchemaOk, weight: 2, detail: localSchemaOk ? "LocalBusiness type detected" : (hasSchema ? "Schema present but not LocalBusiness" : "None") });

  // ── Content & Technical ──
  const noBrokenLinks = num(item.brokenLinksCount) === 0;
  const noBrokenImages = num(item.brokenImagesCount) === 0;
  const contentTech: SeoFinding[] = [
    { label: "Enough content", ok: isTrue(item.isContentEnoughLong), weight: 2, detail: `${num(item.wordsCount)} words` },
    { label: "Mobile viewport", ok: isTrue(item.isViewport), weight: 2, detail: isTrue(item.isViewport) ? "Set" : "Missing viewport tag" },
    { label: "No broken links", ok: noBrokenLinks, weight: 1, detail: noBrokenLinks ? "None" : `${num(item.brokenLinksCount)} broken` },
    { label: "No broken images", ok: noBrokenImages, weight: 1, detail: noBrokenImages ? "None" : `${num(item.brokenImagesCount)} broken` },
    { label: "Valid doctype & encoding", ok: isTrue(item.isDoctype) && isTrue(item.isCharacterEncode), weight: 1, detail: isTrue(item.isDoctype) && isTrue(item.isCharacterEncode) ? "Valid" : "Missing doctype or charset" },
  ];

  const categories: SeoCategory[] = [
    { key: "on_page", label: "On-Page SEO", findings: onPage, score: categoryScore(onPage), grade: letter(categoryScore(onPage)) },
    { key: "local_presence", label: "Local Presence", findings: local, score: categoryScore(local), grade: letter(categoryScore(local)) },
    { key: "content_tech", label: "Content & Technical", findings: contentTech, score: categoryScore(contentTech), grade: letter(categoryScore(contentTech)) },
  ];
  const byKey = (k: keyof typeof CATEGORY_WEIGHTS) => categories.find((c) => c.key === k)!.score;
  const overallScore = Math.round(
    byKey("on_page") * CATEGORY_WEIGHTS.on_page +
    byKey("local_presence") * CATEGORY_WEIGHTS.local_presence +
    byKey("content_tech") * CATEGORY_WEIGHTS.content_tech,
  );

  return {
    url: opts.url,
    checked_at: new Date().toISOString(),
    overall: { score: overallScore, grade: letter(overallScore) },
    categories,
    raw: {
      title: str("title"),
      metaDescription: str("metaDescription"),
      h1: str("h1"),
      wordsCount: num(item.wordsCount),
      linksCount: num(item.linksCount),
      hasJsonLd: nonEmpty(item.jsonLd),
      hasMicrodata: isTrue(item.microdata) || nonEmpty(item.microdata),
      brokenLinksCount: num(item.brokenLinksCount),
      brokenImagesCount: num(item.brokenImagesCount),
      isMetaDescription: isTrue(item.isMetaDescription),
      isMetaDescriptionEnoughLong: isTrue(item.isMetaDescriptionEnoughLong),
      isTitleEnoughLong: isTrue(item.isTitleEnoughLong),
      isH1: isTrue(item.isH1),
      isH1OnlyOne: isTrue(item.isH1OnlyOne),
      isViewport: isTrue(item.isViewport),
      isDoctype: isTrue(item.isDoctype),
      isCharacterEncode: isTrue(item.isCharacterEncode),
      isContentEnoughLong: isTrue(item.isContentEnoughLong),
    },
  };
}
