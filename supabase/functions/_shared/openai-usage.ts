/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE PLACE THAT WRITES OpenAI SPEND TO api_usage_log.

   Why this exists: the OpenAI calls (the competitor cleaner, generate-report, page-generator) logged
   NOTHING to a queryable table, so an OpenAI cost estimate was a guess derived from comments — and
   one went 3x out. Apify and Google already write api_usage_log; this makes OpenAI sit beside them,
   so `select api_type, sum(estimated_cost_usd) from api_usage_log group by 1` tells the truth.

   ⛔ RATES NAME THE MODEL, per CLAUDE.md §4. These are OpenAI's published standard (non-batch,
   non-cached) per-1M-token prices; an unknown model falls back to gpt-4o so a miss over-states
   rather than hides the cost. Update here when a price moves — one place, not three.

   ⚠️ NEVER THROWS. A logging failure must not fail the call whose cost it is recording — the work
   is already done and billed by the time this runs. Every write is wrapped. */

const RATES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
};

/** USD for a call, from the model and its token counts. Unknown model → gpt-4o rate (over-state). */
export function openAiUsd(model: string, promptTokens: number, completionTokens: number): number {
  const r = RATES[model] ?? RATES["gpt-4o"];
  return Number(((promptTokens / 1e6) * r.input + (completionTokens / 1e6) * r.output).toFixed(6));
}

export interface OpenAiUsageArgs {
  functionName: string;                 // api_usage_log.function_name (e.g. "extract-competitors")
  apiType: string;                      // api_usage_log.api_type (e.g. "openai_competitor_clean")
  model: string;                        // used only to price the tokens
  promptTokens: number;
  completionTokens: number;
  calls?: number;                       // OpenAI requests made (batches/retries); default 1
  userId?: string | null;
  triggerSource?: string | null;        // "internal" | "user" | "auto" | "admin" | "verify"
}

/**
 * Record one OpenAI spend row. Best-effort: logs an error and returns on any failure, never throws.
 * `service` is a service-role Supabase client.
 */
// deno-lint-ignore no-explicit-any
export async function logOpenAiUsage(service: any, a: OpenAiUsageArgs): Promise<void> {
  try {
    await service.from("api_usage_log").insert({
      user_id: a.userId ?? null,
      function_name: a.functionName,
      api_type: a.apiType,
      calls_made: a.calls ?? 1,
      cache_hit: false,
      estimated_cost_usd: openAiUsd(a.model, a.promptTokens, a.completionTokens),
      trigger_source: a.triggerSource ?? null,
    });
  } catch (e) {
    console.error(`[openai-usage] log failed (${a.functionName}/${a.apiType}):`, e instanceof Error ? e.message : e);
  }
}
