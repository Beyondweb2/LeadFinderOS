// Ask fn site-shot for ONE lead's homepage picture, in the background (2026-10-23).
//
// Called by process-ai-audit-queue the moment a lead's website check is settled (a fresh one reused, or one just written),
// because site-shot's own gate reads that check. FIRE AND FORGET: the audit never waits on a picture and a picture problem
// can never touch an audit — every failure is swallowed and logged. site-shot decides everything else (the switch, the protection
// mode, the monthly cap, the 30-day freshness, one conditional claim per lead); a call it refuses costs nothing.
// Internal auth only: CRON_SECRET + x-internal-job, the same door crawl-check and crawl-worker use.

export async function triggerSiteShot(leadId: string | null | undefined): Promise<void> {
  const id = String(leadId ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secret || !base) return;
  const fire = fetch(`${base}/functions/v1/site-shot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-job": "1", "x-cron-secret": secret },
    body: JSON.stringify({ mode: "shoot", lead_id: id, triggered_by: "audit_queue" }),
  }).then(() => {}).catch((e) => console.error("[site-shot-trigger] failed:", (e as Error).message));
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(fire); else await fire;
}
