/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LINKEDIN DECISION-MAKER DISCOVERY — the real store and the real IO for the pipeline
   (src/lib/linkedinDiscoveryPipeline.ts, where every rule lives and is tested). 2026-09-30.

   STORE  public.linkedin_discovery_runs (20261001000000_linkedin_discovery_runs.sql) — the cache, the
          one-running-per-lead dedupe (a partial unique index) and the per-run cost. Paid calls also
          land in the shared ledgers every other enrichment writes: enrichment_usage (so the runner's
          per-user cap sees this spend) and api_usage_log.
   HELD   read-only from the Social Enrichment branch's lead_social_profiles (linkedin_person rows a
          person pasted or confirmed). Until that table exists the read answers "nothing held" —
          ONLY for "relation does not exist"; any other read error refuses (fail closed).
   IO     the business's own pages (crawlGet: timeout + 1 MB cap), Companies House (UK, only when
          COMPANIES_HOUSE_API_KEY is set), Apify run-sync with a per-run charge ceiling.

   ⛔ No LinkedIn credential exists anywhere in this path. APIFY_TOKEN and COMPANIES_HOUSE_API_KEY are
      read here, server-side, and never returned.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { crawlGet } from "./crawl-job.ts";
import { resolveSyncRunCost } from "./enrichment/apify.ts";
import { guardAction } from "./protection.ts";
import {
  discoverDecisionMaker, pickCompaniesHouseCompany,
  type DiscoveryIO, type DiscoveryRequest, type DiscoveryResponse, type DiscoveryStore,
} from "../../../src/lib/linkedinDiscoveryPipeline.ts";
import { RUNNING_STALE_MS, type HeldLinkedIn, type PriorRun } from "../../../src/lib/linkedinDiscovery.ts";
import { canonicalLinkedInUrl } from "../../../src/lib/linkedinMatch.ts";
import { LINKEDIN_RUN_MAX_CHARGE_USD } from "../../../src/lib/linkedinProviders.ts";
import type { CompaniesHouseOfficer } from "../../../src/lib/decisionMaker.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const LINKEDIN_DISCOVERY_FN = "linkedin-discovery";
const UA = "Mozilla/5.0 (compatible; FindableBot/1.0; +https://findable.live)";
const RUN_TIMEOUT_S = 60;

const isMissingRelation = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the table/i.test(String(e.message ?? "")));

export function makeStore(service: Service, actor: { id: string; role: "admin" | "sales" }, leadId: string): DiscoveryStore {
  const actorRole = actor.role;
  return {
    async loadHeld(leadId) {
      const { data, error } = await service.from("lead_social_profiles")
        .select("url, platform, state, source, confirmed_by")
        .eq("lead_id", leadId).in("platform", ["linkedin_person", "linkedin_company"]);
      if (error) {
        if (isMissingRelation(error)) return [];
        throw new Error(`held read: ${error.message}`);
      }
      const out: HeldLinkedIn[] = [];
      for (const r of (data ?? []) as Array<{ url: string; platform: string; state: string; source: string; confirmed_by: string | null }>) {
        const c = canonicalLinkedInUrl(r.url);
        if (!c) continue;
        out.push({ url: c.url, kind: c.kind, humanConfirmed: r.source === "manual" || !!r.confirmed_by, rejected: r.state === "rejected", personName: null });
      }
      return out;
    },

    async latestRun(leadId) {
      const { data, error } = await service.from("linkedin_discovery_runs")
        .select("id, status, input_fingerprint, created_at, expires_at, result")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`run read: ${error.message}`);
      return (data ?? null) as PriorRun | null;
    },

    async claimRun({ leadId, fingerprint, actorId }) {
      // A crashed run must not hold the lead forever: anything `running` past RUNNING_STALE_MS is dead.
      await service.from("linkedin_discovery_runs")
        .update({ status: "error", error: "stale running row (function did not finish)", finished_at: new Date().toISOString(), expires_at: new Date().toISOString() })
        .eq("lead_id", leadId).eq("status", "running").lt("created_at", new Date(Date.now() - RUNNING_STALE_MS).toISOString());
      const { data, error } = await service.from("linkedin_discovery_runs")
        .insert({ lead_id: leadId, requested_by: actorId, requested_role: actorRole, status: "running", input_fingerprint: fingerprint, paid: true })
        .select("id").single();
      if (error) {
        if (error.code === "23505") return { ok: false, reason: "in_progress" };
        console.error("[linkedin-discovery] claim failed:", error.message);
        return { ok: false, reason: "store_error" };
      }
      return { ok: true, runId: data.id as string };
    },

    async finishRun(runId, p) {
      const { error } = await service.from("linkedin_discovery_runs").update({
        status: p.status, result: p.result, cost_usd: p.cost_usd, cost_is_estimate: p.cost_is_estimate,
        provider_calls: p.provider_calls, provider: p.result.provider, expires_at: p.expires_at, error: p.error,
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      if (error) console.error("[linkedin-discovery] finish failed:", error.message);
    },

    async recordFreeRun({ leadId, fingerprint, actorId, status, result, expires_at }) {
      const { error } = await service.from("linkedin_discovery_runs").insert({
        lead_id: leadId, requested_by: actorId, requested_role: actorRole, status, input_fingerprint: fingerprint, paid: false,
        result, cost_usd: 0, cost_is_estimate: false, provider_calls: 0, expires_at, finished_at: new Date().toISOString(),
      });
      if (error) console.warn("[linkedin-discovery] free run not recorded:", error.message);
    },

    async spendSnapshot(actorId) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [acct, spend, mine] = await Promise.all([
        service.from("apify_account_usage").select("captured_at, monthly_usage_usd, max_monthly_usage_usd").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
        service.from("linkedin_discovery_runs").select("cost_usd").eq("paid", true).gte("created_at", since).limit(1000),
        service.from("linkedin_discovery_runs").select("id", { count: "exact", head: true }).eq("paid", true).eq("requested_by", actorId).gte("created_at", since),
      ]);
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return {
        apify: acct.error || !acct.data ? null : { captured_at: acct.data.captured_at, monthly_usage_usd: num(acct.data.monthly_usage_usd), max_monthly_usage_usd: num(acct.data.max_monthly_usage_usd) },
        spentLast24hUsd: spend.error ? null : (spend.data ?? []).reduce((s: number, r: { cost_usd: unknown }) => s + Number(r.cost_usd ?? 0), 0),
        userRunsLast24h: mine.error ? null : (mine.count ?? 0),
      };
    },

    /* The app-wide guard. It fails closed for a salesperson and lets the admin through with a warning
       when it cannot answer (protection.ts) — the spend gate that follows still fails closed for both. */
    async guard() {
      const g = await guardAction(service, actor.id, "enrich", { fn: LINKEDIN_DISCOVERY_FN, leadId, role: actorRole });
      return g.ok ? null : g.body.detail;
    },

    async logCost({ actorId, leadId, runId, actor, costUsd, isEstimate }) {
      const kind = /profile-scraper/.test(actor) ? "verify" : "search";
      const [u, a] = await Promise.all([
        service.from("enrichment_usage").insert({ user_id: actorId, enrichment_type: `linkedin_discovery_${kind}`, cost_usd: costUsd }),
        service.from("api_usage_log").insert({
          user_id: actorId, function_name: LINKEDIN_DISCOVERY_FN, api_type: `apify_linkedin_${kind}`, calls_made: 1, cache_hit: false,
          estimated_cost_usd: costUsd, trigger_source: isEstimate ? "estimate" : "apify_reported", action: "enrich",
          actor_role: actorRole, lead_id: leadId, outcome: "spent", reason: `run ${runId}`,
        }),
      ]);
      if (u.error) console.warn("[linkedin-discovery] enrichment_usage not written:", u.error.message);
      if (a.error) console.warn("[linkedin-discovery] api_usage_log not written:", a.error.message);
    },
  };
}

export function makeIO(): DiscoveryIO {
  const chKey = Deno.env.get("COMPANIES_HOUSE_API_KEY") ?? "";
  const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
  const io: DiscoveryIO = {
    async fetchPage(url) {
      const r = await crawlGet(url, UA);
      return { ok: r.ok, finalUrl: r.finalUrl, body: r.ok ? r.body : "", contentType: r.contentType };
    },
    async runActor(actor, input) {
      if (!apifyToken) throw new Error("APIFY_TOKEN is not set");
      const started = Date.now();
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), (RUN_TIMEOUT_S + 15) * 1000);
      try {
        const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${RUN_TIMEOUT_S}&maxTotalChargeUsd=${LINKEDIN_RUN_MAX_CHARGE_USD}`;
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apifyToken}` },
          body: JSON.stringify(input), signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Apify ${actor} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
        const items = await res.json();
        const costUsd = await resolveSyncRunCost(actor, apifyToken, started);
        return { items: Array.isArray(items) ? items : [], costUsd };
      } finally { clearTimeout(t); }
    },
  };
  if (chKey) {
    const auth = `Basic ${btoa(`${chKey}:`)}`;
    const get = async (path: string) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8_000);
      try {
        const r = await fetch(`https://api.company-information.service.gov.uk${path}`, { headers: { Authorization: auth }, signal: controller.signal });
        return r.ok ? await r.json() : null;
      } finally { clearTimeout(t); }
    };
    io.companiesHouse = async (businessName) => {
      const found = await get(`/search/companies?q=${encodeURIComponent(businessName)}&items_per_page=20`);
      const number = pickCompaniesHouseCompany(found?.items ?? [], businessName);
      if (!number) return null;
      const officers = await get(`/company/${encodeURIComponent(number)}/officers?items_per_page=35`);
      return {
        companyUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}`,
        officers: (officers?.items ?? []) as CompaniesHouseOfficer[],
      };
    };
  }
  return io;
}

/** The one entry point for any caller (the linkedin-discovery function today; the Enrichment
 *  branch's social-profiles function later). Role / lead-access checks are the CALLER's job. */
export async function runLinkedInDiscovery(service: Service, req: DiscoveryRequest): Promise<DiscoveryResponse> {
  return await discoverDecisionMaker(req, makeStore(service, req.actor, req.lead.id), makeIO());
}
