// apify-stub.ts — the ONE module every Apify enrichment call goes through.
//
// In this build APIFY_MODE is always 'stub' (the default): no real Apify key, no
// real calls, no spend. It returns realistic fake data shaped like the real
// Apify response we expect, plus a small fake cost, so the whole enrich-lead
// pipeline can build and self-test end-to-end with zero cost.
//
// The 'live' branch is intentionally NOT wired — it documents the real call
// structure for a later, deliberate swap when an APIFY_TOKEN is provided.

export type EnrichmentType = "email" | "facebook" | "instagram";

export interface ApifyEnrichInput {
  enrichmentType: EnrichmentType;
  placeId: string;
  businessName: string;
  website?: string | null;
}

export interface ApifyEnrichResult {
  found: boolean;
  /** The resolved value: an email address, or a Facebook/Instagram profile URL. */
  value: string | null;
  /** Cost attributed to this call (USD). Drives the durable per-user daily cap. */
  costUsd: number;
  /** Always 'apify' — provenance written to the lead + usage rows. */
  source: "apify";
  /** Echoes the mode that produced this result, for logging/debugging. */
  mode: "stub" | "live";
}

// Per-call fake cost in stub mode (matches the ballpark of a real Apify actor run).
const STUB_COST_USD = 0.01;

/**
 * Stub: returns NOT-FOUND, always. It used to fabricate plausible URLs/emails
 * from the business name (info@{slug}.co.uk, facebook.com/{slug}, …) which got
 * stored on leads and rendered as dead/wrong links — an honesty-rule violation.
 * That construction is deleted: this stub NEVER invents a value. Real contacts
 * come only from verified enrichment (enrich-business → Maps + Facebook actors).
 * Zero cost — it does no work.
 */
function stubResult(_input: ApifyEnrichInput): ApifyEnrichResult {
  return { found: false, value: null, costUsd: 0, source: "apify", mode: "stub" };
}

/**
 * Resolve a contact detail for a lead via Apify (stubbed in this build).
 * The enrich-lead edge function calls ONLY this — never Apify directly.
 */
export async function apifyEnrich(input: ApifyEnrichInput): Promise<ApifyEnrichResult> {
  const mode = (Deno.env.get("APIFY_MODE") ?? "stub").toLowerCase();

  if (mode !== "live") {
    // Default / stub: zero-cost-to-us fake data.
    return stubResult(input);
  }

  // ── LIVE (NOT wired in this build) ────────────────────────────────────────
  // TODO(real Apify): when APIFY_TOKEN is provided, replace this block with a
  // real Apify actor run. Expected shape:
  //
  //   const token = Deno.env.get("APIFY_TOKEN");
  //   const actorId = APIFY_ACTOR_BY_TYPE[input.enrichmentType]; // map type → actor
  //   const run = await fetch(
  //     `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`,
  //     { method: "POST", headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ placeId: input.placeId, businessName: input.businessName, website: input.website }) },
  //   );
  //   const items = await run.json();
  //   // → map items to { found, value }, set costUsd from the run's compute units.
  //
  // Until then, 'live' is deliberately unavailable so it can never spend by
  // accident in this build.
  throw new Error("APIFY_MODE=live is not wired in this build (stub only).");
}
