// sales-ready — is this salesperson READY TO SELL? (2026-10-05, docs/salesperson-onboarding.md)
// Asks the ONE rule in the database (public.salesperson_onboarding_missing). For an edge function that
// acts for a salesperson WITHOUT going through public.guard_action (which already refuses 'not_onboarded').
// ⛔ FAIL CLOSED: a failed read is "not ready" — absence is never permission on a selling path.
// ⛔ Callers apply it to the SALES role only; the admin is never gated.

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface SalesReadiness {
  ready: boolean;
  /** The missing keys (src/lib/salespersonOnboarding.ts BLOCKING_KEYS / INACTIVE_KEYS); ['unknown'] when the check failed. */
  missing: string[];
}

export async function salesReadiness(service: ServiceClient, userId: string): Promise<SalesReadiness> {
  try {
    const { data, error } = await service.rpc("salesperson_onboarding_missing", { _user_id: userId });
    if (error || !Array.isArray(data)) throw new Error(String(error?.message ?? "no answer"));
    const missing = (data as unknown[]).map(String);
    return { ready: missing.length === 0, missing };
  } catch (e) {
    console.error(`[sales-ready] check failed: ${e instanceof Error ? e.message : String(e)}`);
    return { ready: false, missing: ["unknown"] };
  }
}

/** The refusal body every gated function returns (the SPA's refusalText knows the code). */
export const NOT_READY_BODY = {
  ok: false,
  error: "not_ready_to_sell",
  detail: "You are not Ready to Sell yet. Finish your onboarding with Paul first.",
} as const;
