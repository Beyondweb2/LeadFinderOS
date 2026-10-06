// template-status — META'S LIVE STATUS FOR A REGISTERED TEMPLATE (2026-10-07,
// docs/pre-sales-certification/sales-close-handoff-australia.md). The words are src/lib/whatsappLinkTemplates.ts.
//
// Callers: fn send-whatsapp-message (the gate before a findable_signup_link / findable_onboarding send),
// fn quick-close and fn paid-client-hub (what the button says).
//
// ⛔ APPROVAL IS READ FROM META, NEVER HARD-CODED: GET /{waba}/message_templates?name=… with the SAME access token
//    the sender uses. The WhatsApp Business Account id is WHATSAPP_BUSINESS_ACCOUNT_ID when set, otherwise read
//    from the token itself (debug_token → the whatsapp_business_management scope's target ids). Nothing is sent.
// ⛔ CACHED in whatsapp_template_status (service role only) so a screen load is not a Meta call: an APPROVED answer
//    is trusted for APPROVED_TTL_MS, anything else is re-asked after OTHER_TTL_MS, a failed read after
//    FAILED_TTL_MS. A send that Meta refuses as "template unavailable" forces a fresh read.
// ⛔ NEVER THROWS. A read that fails answers UNKNOWN (the sender then still tries and Meta decides).
import { GRAPH_VERSION } from "./whatsapp-send.ts";
import { normaliseMetaStatus, type MetaTemplateStatus, type TemplateAvailability } from "../../../src/lib/whatsappLinkTemplates.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const APPROVED_TTL_MS = 30 * 60_000;
export const OTHER_TTL_MS = 3 * 60_000;
export const FAILED_TTL_MS = 60_000;

let wabaMemo: string | null = null;

async function wabaId(token: string): Promise<string | null> {
  const fromEnv = (Deno.env.get("WHATSAPP_BUSINESS_ACCOUNT_ID") ?? "").trim();
  if (fromEnv) return fromEnv;
  if (wabaMemo) return wabaMemo;
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
    const d = await r.json().catch(() => ({}));
    const scopes = (d?.data?.granular_scopes ?? []) as Array<{ scope?: string; target_ids?: string[] }>;
    const ids = scopes.find((s) => s.scope === "whatsapp_business_management")?.target_ids ?? [];
    /* Exactly one account, or we don't guess (two accounts = which one sends is not ours to pick). */
    if (ids.length === 1) { wabaMemo = String(ids[0]); return wabaMemo; }
    console.error(`[template-status] could not identify ONE WhatsApp Business Account from the token (${ids.length} found) — set WHATSAPP_BUSINESS_ACCOUNT_ID`);
    return null;
  } catch (e) {
    console.error("[template-status] debug_token failed:", (e as Error)?.message ?? e);
    return null;
  }
}

/** Ask Meta now. Exact-name match only (Meta's `name` filter is a substring match). */
async function probe(name: string): Promise<{ status: MetaTemplateStatus; category: string | null; language: string | null; error: string | null }> {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  if (!token) return { status: "UNKNOWN", category: null, language: null, error: "no_token" };
  const waba = await wabaId(token);
  if (!waba) return { status: "UNKNOWN", category: null, language: null, error: "no_waba" };
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waba}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,category,language&limit=25`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { status: "UNKNOWN", category: null, language: null, error: `graph_${r.status}:${JSON.stringify(d?.error?.code ?? "")}` };
    const rows = ((d?.data ?? []) as Array<{ name?: string; status?: string; category?: string; language?: string }>).filter((t) => t.name === name);
    if (!rows.length) return { status: "NOT_FOUND", category: null, language: null, error: null };
    /* One name can exist in several languages: an APPROVED one wins, else the first. */
    const best = rows.find((t) => normaliseMetaStatus(t.status) === "APPROVED") ?? rows[0];
    return { status: normaliseMetaStatus(best.status), category: best.category ?? null, language: best.language ?? null, error: null };
  } catch (e) {
    return { status: "UNKNOWN", category: null, language: null, error: (e as Error)?.message ?? "fetch_failed" };
  }
}

/** The template's availability — cached; `force` re-asks Meta now. Never throws. */
export async function templateAvailability(service: Service, name: string, opts: { force?: boolean } = {}): Promise<TemplateAvailability> {
  const now = Date.now();
  try {
    if (!opts.force) {
      const { data } = await service.from("whatsapp_template_status").select("name,status,category,language,checked_at,error").eq("name", name).maybeSingle();
      if (data) {
        const age = now - Date.parse(String(data.checked_at));
        const ttl = data.error ? FAILED_TTL_MS : data.status === "APPROVED" ? APPROVED_TTL_MS : OTHER_TTL_MS;
        if (Number.isFinite(age) && age >= 0 && age < ttl) {
          return { name, status: normaliseMetaStatus(data.status), category: data.category ?? null, language: data.language ?? null, checked_at: data.checked_at };
        }
      }
    }
  } catch (e) { console.error("[template-status] cache read failed (non-blocking):", (e as Error)?.message ?? e); }
  const p = await probe(name);
  const checked_at = new Date().toISOString();
  try {
    await service.from("whatsapp_template_status").upsert({ name, status: p.status, category: p.category, language: p.language, checked_at, error: p.error }, { onConflict: "name" });
  } catch (e) { console.error("[template-status] cache write failed (non-blocking):", (e as Error)?.message ?? e); }
  return { name, status: p.status, category: p.category, language: p.language, checked_at };
}
