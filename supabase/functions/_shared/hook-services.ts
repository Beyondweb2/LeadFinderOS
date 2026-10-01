/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CRAWL FIRST, THEN THE QUESTIONS (Paul, 2026-10-01) — the quick (hook) audit's services, from the
   business's own website.

     website → crawl (a fresh stored crawl is REUSED; otherwise crawl-check runs now, deep, so the
     post-audit crawl in process-ai-audit-queue then reuses THIS row) → verified services with the
     page each came from (src/lib/serviceEvidence.ts) → generateQuestions' "Known for" line → the
     same three questions, the same two engines, the same spend.

   ⛔ HOOK AUDITS ONLY. Baseline, measurement, re-measure, free check, discovery and weekly checks never
      call this — their question methodology is unchanged.
   ⛔ NOTHING IS INVENTED. No website, a crawl that failed, or a site with no service evidence → the
      audit asks what it asked before (trade + town), and the run records basis.source = 'fallback'
      with the reason. The fallback is internal; the questions themselves read the same either way.
   ⛔ IT CAN NEVER STOP AN AUDIT. Every failure is a fallback, never a throw. */
import { CRAWL_CHECK_VERSION } from "../../../src/lib/crawlCheck.ts";
import { pickServicesForQuestions, verifiedServices, type QuestionBasis, type ServiceEvidence } from "../../../src/lib/serviceEvidence.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

/** A stored crawl younger than this is reused (the same window process-ai-audit-queue uses). */
export const HOOK_CRAWL_FRESH_MS = 30 * 86_400_000;
/** The crawl-check call's own ceiling: its budget is 35 s, plus the network. */
export const HOOK_CRAWL_TIMEOUT_MS = 45_000;

export interface HookServices { specialisms: string; basis: QuestionBasis }

const fallback = (reason: string, crawledAt: string | null = null, reused = false): HookServices =>
  ({ specialisms: "", basis: { source: "fallback", services: [], reason, crawledAt, reused } });

/** The capitalised words and pairs in the candidates — what a uk_towns lookup is asked about. */
function placeTokens(ev: ServiceEvidence): string[] {
  const out = new Set<string>();
  for (const c of ev.candidates) {
    const words = c.text.split(/[^A-Za-z'-]+/).filter((w) => /^[A-Z][a-z]/.test(w));
    words.forEach((w, i) => { out.add(w); if (words[i + 1]) out.add(`${w} ${words[i + 1]}`); });
  }
  return [...out].slice(0, 200);
}

export async function resolveHookServices(service: Client, p: {
  leadId: string | null; website: string | null; trade: string; town: string; businessName: string;
  serviceAreas: string[]; count: number;
  /** False when the questions are already written (a reviewed preview sent back verbatim): only a
   *  stored crawl is read, so the basis is recorded without crawling again. */
  crawlIfMissing?: boolean;
}): Promise<HookServices> {
  if (!p.website) return fallback("no_website");
  try {
    let result: Record<string, unknown> | null = null;
    let crawledAt: string | null = null;
    let reused = false;
    if (p.leadId) {
      const { data: row } = await service.from("lead_crawl_checks").select("result, created_at").eq("lead_id", p.leadId).maybeSingle();
      const r = (row?.result ?? null) as Record<string, unknown> | null;
      const fresh = !!row && Date.now() - new Date(row.created_at as string).getTime() < HOOK_CRAWL_FRESH_MS;
      if (r && fresh && Number(r.version ?? 0) >= CRAWL_CHECK_VERSION && r.serviceEvidence) {
        result = r; crawledAt = row.created_at as string; reused = true;
      }
    }
    if (!result && p.crawlIfMissing === false) return fallback("not_checked");
    if (!result) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), HOOK_CRAWL_TIMEOUT_MS);
      try {
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crawl-check`, {
          method: "POST", signal: ctl.signal,
          headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "", "x-internal-job": "1" },
          body: JSON.stringify({ lead_id: p.leadId, url: p.website, deep: true }),
        });
        const j = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (!res.ok || !j?.ok) return fallback("crawl_failed");
        if ((j.signals as { fetchFailed?: boolean } | undefined)?.fetchFailed) return fallback("crawl_failed", (j.checked_at as string) ?? null);
        result = j; crawledAt = (j.checked_at as string) ?? null;
      } finally { clearTimeout(timer); }
    }
    const ev = (result?.serviceEvidence ?? null) as ServiceEvidence | null;
    if (!ev?.candidates?.length) return fallback("no_services_found", crawledAt, reused);
    /* Places the services must not be mistaken for: the lead's town and areas, the site's own location
       pages, and any uk_towns name among the candidates (the gazetteer read can fail; it only adds). */
    const towns = [p.town, ...p.serviceAreas, ...(((result?.siteInfo as { towns?: string[] } | null)?.towns) ?? [])];
    try {
      const { data: rows } = await service.from("uk_towns").select("name").in("name", placeTokens(ev));
      for (const t of (rows ?? []) as Array<{ name: string }>) towns.push(t.name);
    } catch { /* the gazetteer only adds */ }
    const verified = verifiedServices(ev, { trade: p.trade, towns, businessName: p.businessName });
    if (!verified.length) return fallback("no_services_found", crawledAt, reused);
    const chosen = pickServicesForQuestions(verified, p.count);
    return {
      specialisms: chosen.map((s) => s.name).join(", ").slice(0, 200),
      basis: { source: "crawl", services: chosen.map((s) => s.name), reason: null, crawledAt, reused },
    };
  } catch (e) {
    console.error("[hook-services] fell back:", (e as Error).message);
    return fallback("crawl_failed");
  }
}
