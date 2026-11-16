/* ══ TPS / CTPS SCREENING BEFORE A CALL — the fetch + the cache (2026-11-16, v1-tps-templates-callable) ══════════════
   The rules are src/lib/tpsCheck.ts (pure); docs/tps-screening.md is the record.
   ⛔ SWITCHED OFF until BOTH edge secrets exist: TPSMYDATA_API_KEY (Paul's tpsmydata API key) and TPSMYDATA_API_URL (the
      check address from tpsmydata's API page). Off = { state: "off" }: nothing is read, fetched or charged, and the call
      goes on exactly as before. The key is never logged, returned or stored.
   ⛔ CACHED PER NUMBER: a current answer for both registers (≤ TPS_RECHECK_DAYS) is reused for every lead with that number;
      tpsmydata is asked only when there is none. Errors are never stored.
   ⛔ ON AND UNSURE = DO NOT CALL: a failed fetch, a non-2xx, or an answer tpsCheck cannot read → { state: "unchecked" },
      and the caller refuses the call. Never "assume clear". */
import { TPSMYDATA, tpsCallDecision, tpsMyDataAnswers, tpsRowFromAnswer, tpsScreenable, TPS_RECHECK_DAYS, type TpsCheckRow } from "../../../src/lib/tpsCheck.ts";

// deno-lint-ignore no-explicit-any
type Service = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type TpsScreen =
  | { state: "off" }            // no secrets: screening not switched on
  | { state: "not_uk" }         // Irish / Malaysian / Singapore number: not on the UK registers
  | { state: "clear"; cached: boolean }
  | { state: "registered"; cached: boolean }
  | { state: "unchecked"; error: string };

export function tpsScreeningOn(): boolean {
  return !!(Deno.env.get("TPSMYDATA_API_KEY") ?? "").trim() && /^https:\/\//.test((Deno.env.get("TPSMYDATA_API_URL") ?? "").trim());
}

const TIMEOUT_MS = 8_000;

/** Ask tpsmydata about ONE number. Returns the raw JSON (or an error) — parsing is tpsMyDataAnswers. */
async function askTpsMyData(e164: string): Promise<{ ok: true; body: unknown; date: string } | { ok: false; error: string }> {
  const key = (Deno.env.get("TPSMYDATA_API_KEY") ?? "").trim();
  const url = (Deno.env.get("TPSMYDATA_API_URL") ?? "").trim();
  const national = "0" + e164.replace(/\D/g, "").slice(2);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}`, "x-api-key": key },
      body: JSON.stringify({ phone: national, number: national, phone_number: national, e164: `+${e164.replace(/\D/g, "")}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = await res.json().catch(() => null);
    if (body === null) return { ok: false, error: "not_json" };
    return { ok: true, body, date: res.headers.get("date") ?? new Date().toUTCString() };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "TimeoutError" ? "timeout" : "fetch_failed" };
  }
}

/** The one TPS step before a call. digits = E.164 without "+". */
export async function screenNumberForCall(service: Service, digits: string, leadId: string | null, now: Date = new Date()): Promise<TpsScreen> {
  if (!tpsScreeningOn()) return { state: "off" };
  if (!tpsScreenable(digits)) return { state: "not_uk" };
  const phone = `+${digits.replace(/\D/g, "")}`;
  const since = new Date(now.getTime() - TPS_RECHECK_DAYS * 86_400_000).toISOString();
  const { data: rows, error } = await service.from("phone_tps_checks")
    .select("lead_id, phone, register, result, provider, provider_reference, checked_at")
    .eq("phone", phone).gte("checked_at", since).order("checked_at", { ascending: false }).limit(10);
  if (error) return { state: "unchecked", error: "cache_unreadable" };
  const cached = tpsCallDecision(rows as TpsCheckRow[], now);
  if (cached === "block") return { state: "registered", cached: true };
  if (cached === "clear") return { state: "clear", cached: true };

  const asked = await askTpsMyData(phone);
  if (!asked.ok) { console.warn("[tps-screen] check failed:", asked.error); return { state: "unchecked", error: asked.error }; }
  const answers = tpsMyDataAnswers(asked.body, `tpsmydata ${asked.date}`);
  const checkedAt = now.toISOString();
  const fresh = answers.map((a) => tpsRowFromAnswer(a, { providerId: TPSMYDATA.id, leadId, phone, checkedAt }));
  if (fresh.length !== 2 || fresh.some((r) => !r)) {
    console.warn("[tps-screen] unreadable answer; keys:", Object.keys((asked.body ?? {}) as object).join(","));
    return { state: "unchecked", error: answers.find((a) => !a.ok) ? (answers.find((a) => !a.ok) as { error: string }).error : "unreadable_answer" };
  }
  const { error: insErr } = await service.from("phone_tps_checks").insert(fresh);
  if (insErr) console.warn("[tps-screen] answer not stored:", insErr.message);
  return tpsCallDecision(fresh as TpsCheckRow[], now) === "block" ? { state: "registered", cached: false } : { state: "clear", cached: false };
}

/** Admin-only probe (twilio-voice-token { tps_probe }): what tpsmydata answers for one number and how it was read. Stores
 *  nothing. Returns the response's field NAMES and the parsed answers — never the key. */
export async function probeTpsMyData(digits: string): Promise<Record<string, unknown>> {
  if (!tpsScreeningOn()) return { on: false };
  const asked = await askTpsMyData(digits);
  if (!asked.ok) return { on: true, ok: false, error: asked.error };
  return { on: true, ok: true, body: asked.body, parsed: tpsMyDataAnswers(asked.body, `tpsmydata ${asked.date}`) };
}
