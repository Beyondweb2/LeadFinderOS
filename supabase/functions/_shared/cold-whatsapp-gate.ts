// cold-whatsapp-gate — the database half of the cold WhatsApp guard (the rule itself: src/lib/whatsappColdGuard.ts). Asked by the
// three doors a cold send can leave through: process-whatsapp-queue, send-whatsapp-message and inbox-scheduled-send.
//
// ⛔ FAILS TOWARDS NOT SENDING: an unreadable count or state answers null from loadColdFacts, and every door treats that as "no".
// ⛔ THE GAP IS ONE CONDITIONAL WRITE (claimColdSlot): whichever door wins the row sends, the others wait. A read here would let
//    two doors go in the same second. On 2 Nov queued openers went 4 seconds apart.
import {
  COLD_READ_HOURS, coldGapMs, coldVerdict, isCountedColdSend, probeFailedReason, probeStart, probeVerdict, coldMarketOfPhone,
  COOLDOWN_HOURS, UK_PROBE_REST_HOURS,
  type ColdFacts, type ColdSendRow, type ColdVerdict,
} from "../../../src/lib/whatsappColdGuard.ts";
import type { CountrySettings, Market } from "../../../src/lib/outreachMarkets.ts";
import { loadCountrySettings } from "./country-settings.ts";
import { healthVerdict, type StoredHealth } from "../../../src/lib/whatsappNumberHealth.ts";
import { struckOut, statusAfterStrike, STRIKE_DELIVERY_STATES, type StrikeSendRow } from "../../../src/lib/whatsappOneStrike.ts";
import { failureRunWindows, insideFailureRun } from "../../../src/lib/whatsappPace.ts";

/** How far back the per-lead check looks for runs of failures (the number being refused, not the lead). */
const RUN_WINDOW_DAYS = 30;

// deno-lint-ignore no-explicit-any
type Service = any;

/* 2026-11-23: plus the cached Meta reading. Since 23 Nov pm the tier / status / can-send set the number's daily cap (200, or the
   safety net's 60: src/lib/whatsappQualityCap.ts); the quality colour only feeds the likelihood hold. */
const STATE_COLUMNS = "cold_stop_at, cold_stop_reason, cold_gap_until, meta_quality_rating, meta_messaging_tier, meta_health_ok_at, meta_health_checked_at, meta_health_error, meta_number_status, meta_can_send";
const FAILED = ["failed", "failed_temporary"];

export interface LoadedColdFacts extends ColdFacts { stopAt: string | null; gapUntil: string | null }

/** Everything the rule needs, read once. Null = could not be read: the doors refuse. */
export async function loadColdFacts(service: Service, settingsIn?: CountrySettings | null, now: Date = new Date()): Promise<LoadedColdFacts | null> {
  try {
    const settings = settingsIn ?? await loadCountrySettings(service);
    const since = new Date(now.getTime() - COLD_READ_HOURS * 3_600_000).toISOString();
    const [{ data: st, error: stErr }, { data: rows, error: rErr }] = await Promise.all([
      service.from("whatsapp_outreach_state").select(STATE_COLUMNS).eq("id", 1).maybeSingle(),
      /* A template is what a cold send always has: free text (in-window replies) is left out by the read. Newest first and
         bounded: far above any cap, and a truncated read can only show MORE than the cap counts, never hide today's. */
      service.from("whatsapp_sends").select("created_at, phone, template, user_id, delivery_status, error_code, message_id, test_mode, lead_id")
        .gte("created_at", since).not("template", "is", null).eq("test_mode", false)
        .order("created_at", { ascending: false }).limit(1000),
    ]);
    if (stErr || rErr || !st) return null;
    const counted = ((rows ?? []) as Array<ColdSendRow & { lead_id: string | null }>).filter(isCountedColdSend);
    /* Only a failure needs its lead read: the flag says whether the number is simply not on WhatsApp. */
    const failedLeadIds = [...new Set(counted.filter((r) => FAILED.includes(String(r.delivery_status)) && r.lead_id).map((r) => r.lead_id as string))];
    const flags = new Map<string, { status: string | null; whatsapp_delivery_status: string | null; whatsapp_message_id: string | null }>();
    for (let i = 0; i < failedLeadIds.length; i += 200) {
      const { data: ls, error: lErr } = await service.from("outreach_leads").select("id, status, whatsapp_delivery_status, whatsapp_message_id").in("id", failedLeadIds.slice(i, i + 200));
      if (lErr) return null;
      for (const l of (ls ?? []) as Array<{ id: string; status: string | null; whatsapp_delivery_status: string | null; whatsapp_message_id: string | null }>) flags.set(l.id, l);
    }
    const sends: ColdSendRow[] = counted.map((r) => {
      const l = r.lead_id ? flags.get(r.lead_id) : undefined;
      if (!l || !FAILED.includes(String(r.delivery_status))) return r;
      return { ...r,
        leadNoWhatsApp: l.status === "no_whatsapp" || l.whatsapp_delivery_status === "no_whatsapp",
        /* The live webhook writes the send row BEFORE it patches the lead (docs/country-auto-off.md). */
        leadUnsettled: r.error_code == null && !!r.message_id && l.whatsapp_message_id === r.message_id
          && !["failed", "failed_temporary", "no_whatsapp"].includes(String(l.whatsapp_delivery_status ?? ""))
          && !["no_whatsapp", "whatsapp_failed"].includes(String(l.status ?? "")),
      };
    });
    return {
      stopReason: (st.cold_stop_at ? (st.cold_stop_reason as string | null) ?? "Meta limited the number." : null),
      stopAt: (st.cold_stop_at as string | null) ?? null,
      gapUntil: (st.cold_gap_until as string | null) ?? null,
      health: healthVerdict(st as StoredHealth, now).state,
      meta: {
        meta_messaging_tier: (st.meta_messaging_tier as string | null) ?? null, meta_number_status: (st.meta_number_status as string | null) ?? null,
        meta_can_send: (st.meta_can_send as string | null) ?? null, meta_health_ok_at: (st.meta_health_ok_at as string | null) ?? null,
      },
      settings, sends,
    };
  } catch {
    return null;
  }
}

/** Start a country's rest. Idempotent in SQL (a country already resting is left alone). A failed write answers false. */
export async function startCooldown(service: Service, market: Market, reason: string, hours: number): Promise<boolean> {
  try {
    const { error } = await service.rpc("country_whatsapp_start_cooldown", { _market: market, _reason: reason, _hours: hours });
    return !error;
  } catch {
    return false;
  }
}

/** The verdict for one market. A failed probe starts the rest here, so whichever door saw it first is the one that records it. */
export async function coldGateFor(service: Service, facts: LoadedColdFacts, market: Market, now: Date = new Date()): Promise<ColdVerdict> {
  const v = coldVerdict(market, facts, now);
  if (!v.go && v.code === "probe_failed") {
    const mine = facts.sends.filter((r) => coldMarketOfPhone(r.phone) === market && Date.parse(r.created_at) >= probeStart(market, facts.settings, now).getTime());
    await startCooldown(service, market, probeFailedReason(market, probeVerdict(mine, now)), market === "UK" ? UK_PROBE_REST_HOURS : COOLDOWN_HOURS);
  }
  return v;
}

/** Take the next cold slot. True = this caller won and may send; the row now says when the next one may go.
 *  An error answers false: never a send past the gap. */
export async function claimColdSlot(service: Service, now: Date = new Date()): Promise<boolean> {
  try {
    const nowIso = now.toISOString();
    const until = new Date(now.getTime() + coldGapMs()).toISOString();
    const { data, error } = await service.from("whatsapp_outreach_state")
      .update({ cold_gap_until: until })
      .eq("id", 1).or(`cold_gap_until.is.null,cold_gap_until.lte.${nowIso}`)
      .select("id");
    return !error && Array.isArray(data) && data.length === 1;
  } catch {
    return false;
  }
}

/* ══ ONE STRIKE (2026-11-23, src/lib/whatsappOneStrike.ts) ══════════════════════════════════════════════════════════════
   Has a message to this lead or this number ever failed as undeliverable, with nothing delivered and nothing from them?
   true = struck out (a cold door refuses). null = could not be read: the caller refuses too (fails towards not sending). */
export async function whatsappStruckOut(service: Service, leadId: string | null, digits: string | null): Promise<boolean | null> {
  try {
    const d = String(digits ?? "").replace(/\D/g, "");
    const ors = [leadId ? `lead_id.eq.${leadId}` : null, d ? `phone.eq.${d}` : null].filter(Boolean) as string[];
    if (!ors.length) return false;
    const { data: rows, error } = await service.from("whatsapp_sends").select("created_at, delivery_status, error_code, test_mode")
      .or(ors.join(",")).eq("test_mode", false).order("created_at", { ascending: false }).limit(200);
    if (error) return null;
    let sends = (rows ?? []) as Array<StrikeSendRow & { created_at: string }>;
    if (!sends.some((r) => STRIKE_DELIVERY_STATES.includes(String(r.delivery_status ?? "")))) return false;
    /* 2026-11-23 pm (src/lib/whatsappPace.ts failureRunWindows): a failure inside a RUN of the queue's failures (5+ in a row, none
       delivered between) was WhatsApp refusing the number, not this lead: it is no strike. Unreadable = null (refuse). */
    const since = new Date(Date.now() - RUN_WINDOW_DAYS * 24 * 3_600_000).toISOString();
    const { data: qRows, error: qErr } = await service.from("whatsapp_sends").select("created_at, delivery_status")
      .is("user_id", null).eq("test_mode", false).gte("created_at", since).order("created_at", { ascending: false }).limit(8000);
    if (qErr) return null;
    const windows = failureRunWindows((qRows ?? []) as Array<{ created_at: string; delivery_status: string | null }>);
    if (windows.length) {
      sends = sends.filter((r) => !(STRIKE_DELIVERY_STATES.includes(String(r.delivery_status ?? "")) && insideFailureRun(Date.parse(r.created_at), windows)));
      if (!sends.some((r) => STRIKE_DELIVERY_STATES.includes(String(r.delivery_status ?? "")))) return false;
    }
    let inbound = false;
    if (leadId) {
      const { data: m, error: mErr } = await service.from("whatsapp_messages").select("id").eq("lead_id", leadId).eq("direction", "inbound").limit(1);
      if (mErr) return null;
      inbound = (m ?? []).length > 0;
    }
    if (!inbound && d) {
      const { data: m, error: mErr } = await service.from("whatsapp_messages").select("id").eq("phone", d).eq("direction", "inbound").limit(1);
      if (mErr) return null;
      inbound = (m ?? []).length > 0;
    }
    return struckOut(sends, inbound);
  } catch {
    return null;
  }
}

/** Mark a struck-out lead No WhatsApp and take it out of every WhatsApp lane. Never throws; false = the write failed. */
export async function applyStrike(service: Service, leadId: string, currentStatus: string | null): Promise<boolean> {
  try {
    const { error } = await service.from("outreach_leads").update({
      status: statusAfterStrike(currentStatus), whatsapp_delivery_status: "no_whatsapp",
      hook_followup_queued_at: null, contact_followup_queued_at: null,
    }).eq("id", leadId);
    if (error) return false;
    await service.from("outreach_leads").update({ contact_method: null }).eq("id", leadId).eq("contact_method", "whatsapp");
    return true;
  } catch {
    return false;
  }
}
