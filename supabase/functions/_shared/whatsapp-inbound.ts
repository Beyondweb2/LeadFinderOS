import { toWhatsAppNumber } from "./whatsapp-send.ts";

// Inbound WhatsApp message handling — barber replies arriving on the SAME Meta
// webhook that delivers statuses (Cloud API has ONE callback URL; inbound lives in
// entry[].changes[].value.messages[], statuses in value.statuses[]). Called from
// whatsapp-status for each change that carries messages[]. Writes each reply into
// whatsapp_messages as an inbound row so it surfaces in the Inbox, resolving the
// conversation owner + lead so it lands in the right operator's thread (or the
// admin-only Unassigned bucket when the sender can't be matched).
//
// service = service-role Supabase client (bypasses RLS). Loose-typed to any to
// avoid supabase-js generic friction, matching the rest of the codebase.

// Statuses we must never overwrite when a reply comes in (forward-only, no thrash).
// A new inbound reply flips the matched lead to 'replied' UNLESS it's already at a
// protected status. not_interested is deliberately NOT protected: a reply means the
// prospect is re-engaging, so it should flip to 'replied' (which also un-hides the
// conversation in the Inbox, where not_interested is hidden by default).
const NO_DOWNGRADE = "(payment_received,replied)";

/** Best text/body for an inbound message. Text → the text body; anything else
 *  (image/audio/document/interactive/button/reaction/…) → a "[type]" placeholder
 *  so the operator can see a reply landed and follow up. */
function bodyFor(msg: Record<string, unknown>): string {
  const type = typeof msg?.type === "string" ? msg.type : "unknown";
  if (type === "text") {
    const t = msg?.text as { body?: string } | undefined;
    return (t?.body ?? "").toString();
  }
  return `[${type}]`;
}

/** Meta unix-seconds timestamp → ISO, falling back to now() when absent/bad. */
function tsToIso(ts: unknown): string {
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000).toISOString();
  return new Date().toISOString();
}

/**
 * Resolve the conversation owner (user_id) + lead_id for an inbound sender.
 *  1. Primary: the most recent OUTBOUND whatsapp_messages row to this phone — this
 *     is authoritative and IS the agreed tiebreak ("whoever most recently sent an
 *     outbound to that number"). Always hits for a genuine reply (a barber can only
 *     reply within 24h of a template we sent, and every send logs an outbound row).
 *  2. Fallback: match outreach_leads by phone (cheap last-9-digits ilike prefilter,
 *     then confirm with the same normaliser). Single owner → use it; ambiguous with
 *     no outbound history to break the tie → Unassigned.
 *  3. Default: Unassigned (null / null) → admin-only bucket the Inbox supports.
 */
async function resolveOwner(
  // deno-lint-ignore no-explicit-any
  service: any,
  waPhone: string,
): Promise<{ userId: string | null; leadId: string | null }> {
  // 1. Most recent outbound to this number.
  const { data: prior } = await service
    .from("whatsapp_messages")
    .select("user_id, lead_id")
    .eq("phone", waPhone)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior?.user_id) {
    return { userId: prior.user_id as string, leadId: (prior.lead_id as string | null) ?? null };
  }

  // 2. Fallback — match a lead by phone. Prefilter on the last 9 digits, then
  //    confirm with the normaliser (leads store raw: 07…, +44…, spaced).
  const last9 = waPhone.slice(-9);
  if (last9.length >= 6) {
    const { data: leads } = await service
      .from("outreach_leads")
      .select("id, user_id, phone, country")
      .ilike("phone", `%${last9}%`);
    const matches = ((leads ?? []) as Array<{ id: string; user_id: string; phone: string; country: string | null }>)
      .filter((l) => toWhatsAppNumber(l.phone ?? "", l.country) === waPhone);
    const owners = new Set(matches.map((m) => m.user_id));
    if (owners.size === 1) {
      const m = matches[0];
      return { userId: m.user_id, leadId: m.id };
    }
    if (owners.size > 1) {
      console.warn(`[whatsapp-inbound] ${matches.length} leads / ${owners.size} owners for ${waPhone}, no outbound history — Unassigned`);
    }
  }

  // 3. Unknown sender.
  return { userId: null, leadId: null };
}

/**
 * Handle every inbound message in a webhook `change.value`. Idempotent per message
 * via the wa_messages_wa_id_uq unique index (23505 on redelivery → skip). Returns
 * the number of NEW rows inserted.
 */
export async function handleInboundMessages(
  // deno-lint-ignore no-explicit-any
  service: any,
  // deno-lint-ignore no-explicit-any
  value: any,
): Promise<number> {
  const messages = Array.isArray(value?.messages) ? value.messages : [];
  const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
  let inserted = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>;
    try {
      const wamid = typeof msg?.id === "string" ? msg.id : "";
      // Phone: msg.from, falling back to the matching contacts[].wa_id.
      const rawFrom = (typeof msg?.from === "string" && msg.from) ||
        (typeof contacts[i]?.wa_id === "string" && contacts[i].wa_id) || "";
      const waPhone = toWhatsAppNumber(String(rawFrom), null);
      if (!waPhone) {
        console.warn(`[whatsapp-inbound] message ${wamid || "(no id)"} has no usable phone — skipping`);
        continue;
      }

      const { userId, leadId } = await resolveOwner(service, waPhone);

      const { error: insErr } = await service.from("whatsapp_messages").insert({
        direction: "inbound",
        user_id: userId,
        lead_id: leadId,
        phone: waPhone,
        body: bodyFor(msg),
        message_type: "text", // CHECK allows only text|template; inbound media → text + [type] body
        wa_message_id: wamid || null,
        status: "received",
        test_mode: false,
        created_at: tsToIso(msg?.timestamp),
      });

      if (insErr) {
        // Duplicate (Meta redelivery) → unique-index violation. Idempotent skip.
        if ((insErr as { code?: string }).code === "23505") {
          console.log(`[whatsapp-inbound] duplicate ${wamid} — already stored, skipping`);
          continue;
        }
        console.error(`[whatsapp-inbound] insert failed for ${wamid}:`, (insErr as { message?: string }).message);
        continue;
      }
      inserted++;

      // Best-effort: a reply is a strong signal → move the matched lead to 'replied'.
      // Forward-only (never downgrade/thrash paid/not_interested/already-replied).
      // Only for matched leads; skip Unassigned/no-lead. Own try/catch — never
      // affects the message insert above.
      if (leadId) {
        try {
          // Reply → 'replied' AND queue the operator to respond: next_action
          // 'send_draft' due today (YYYY-MM-DD, matching record-site-event's
          // toISOString().slice(0,10) date style).
          const today = new Date().toISOString().slice(0, 10);
          await service
            .from("outreach_leads")
            .update({ status: "replied", next_action: "send_draft", next_action_date: today })
            .eq("id", leadId)
            .not("status", "in", NO_DOWNGRADE);
        } catch (e) {
          console.error(`[whatsapp-inbound] lead status→replied failed (${leadId}):`, (e as Error).message);
        }

        // Automation A: a reply auto-triggers an AI-visibility audit for this lead. Fired at most
        // ONCE per lead — idempotency guard: skip if an ai_audits row already exists for the lead,
        // so repeat replies never spawn duplicate audits. Own try/catch: a failure to start the
        // audit must NEVER break the inbound webhook (the reply is already stored + status set).
        // Runs through the existing async queue; no follow-up message here (that's automation B).
        try {
          const { data: existingAudit } = await service
            .from("ai_audits").select("id").eq("lead_id", leadId).limit(1).maybeSingle();
          if (!existingAudit) {
            const { data: lead } = await service
              .from("outreach_leads")
              .select("business_name, category, search_keyword, search_location, address, country, website, user_id")
              .eq("id", leadId).maybeSingle();
            if (lead?.business_name && lead?.user_id) {
              const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
              const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
                  "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
                  "x-internal-job": "1",
                },
                // No questions[] → create-ai-audit auto-generates them from the lead's details.
                body: JSON.stringify({
                  user_id: lead.user_id,
                  lead_id: leadId,
                  business_name: lead.business_name,
                  business_type: lead.category ?? lead.search_keyword ?? "",
                  location_text: lead.search_location ?? lead.address ?? "",
                  country: lead.country ?? null,
                  website: lead.website ?? null,
                  has_website: !!lead.website,
                }),
              });
              if (!res.ok) {
                const txt = await res.text().catch(() => "");
                console.error(`[whatsapp-inbound] reply→audit failed for lead ${leadId}: HTTP ${res.status} ${txt.slice(0, 300)}`);
              } else {
                console.log(`[whatsapp-inbound] reply→audit started for lead ${leadId}`);
              }
            }
          }
        } catch (e) {
          console.error(`[whatsapp-inbound] reply→audit error for lead ${leadId}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[whatsapp-inbound] message handling error:", (e as Error).message);
    }
  }

  return inserted;
}
