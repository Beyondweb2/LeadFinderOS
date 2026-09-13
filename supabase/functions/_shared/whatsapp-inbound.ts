import { toWhatsAppNumber } from "./whatsapp-send.ts";
import { isAggregatorUrl } from "./aggregators.ts";

/* A DIRECTORY OR SOCIAL URL IS NOT A WEBSITE. `!!lead.website` was a bare truthiness test, so a
   listing whose only "website" is a Facebook page reported has_website: true — and
   process-ai-audit-queue then ran a ~$0.12 Apify SEO scan against facebook.com, grading Facebook's
   markup. isAggregatorUrl is the same classifier search-leads and the audit report use, so
   "not their own website" means one thing everywhere.
   The URL is dropped as well as the flag: the scan needs both, and leaving a facebook.com value on a
   row that says has_website: false is the stale-field trap that started this. The raw URL is still on
   outreach_leads.website, so nothing is lost. */
function ownWebsite(raw: string | null | undefined): string | null {
  const w = (raw ?? "").trim();
  return w && !isAggregatorUrl(w) ? w : null;
}
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { AUDIT_ONLY_STATUS, DEFAULT_FIRST_REPLY_TEMPLATE, armStatusFor, autoReplyEnvOn, autoReplyToggleOn, firstReplyMode, firstReplyTemplate, isDecline, isSubstantiveText, looksAutomated, modeSends, phoneSuppressed, pitchEverSent } from "./auto-reply-rules.ts";
import { suppress } from "./suppression.ts";
import { createMockupRow, fillMockupFromSite } from "./mockup-trigger.ts";

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
// conversation in the Inbox, where not_interested is hidden by default). report_sent
// is deliberately NOT protected either — a reply to the pitch flips it to 'replied'.
// price_given and beyond (interested / paid / in_delivery / completed) ARE protected:
// an inbound must never wipe quote/deal state.
const NO_DOWNGRADE = "(payment_received,replied,interested,price_given,in_delivery,completed)";

/** Best text/body for an inbound message. Text → the text body; a template QUICK-REPLY BUTTON
 *  or an INTERACTIVE reply → the button/list LABEL (so "Yes please" is stored and treated as a
 *  real reply, not "[button]"); any other type (image/audio/document/reaction/…) → a "[type]"
 *  placeholder so the operator can see a reply landed and follow up.
 *  ⛔ Load-bearing for the auto-pitch: the arm gate keys on isSubstantiveText(body), which rejects
 *  "[...]" placeholders — so a button reply only triggers a pitch because its label is extracted
 *  HERE. WhatsApp shapes: text→msg.text.body, template button→msg.button.text (payload as
 *  fallback), interactive→msg.interactive.button_reply.title / list_reply.title. */
function bodyFor(msg: Record<string, unknown>): string {
  const type = typeof msg?.type === "string" ? msg.type : "unknown";
  if (type === "text") {
    const t = msg?.text as { body?: string } | undefined;
    return (t?.body ?? "").toString();
  }
  if (type === "button") {
    const b = msg?.button as { text?: string; payload?: string } | undefined;
    const txt = (b?.text ?? b?.payload ?? "").toString().trim();
    if (txt) return txt;
  }
  if (type === "interactive") {
    const it = msg?.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    } | undefined;
    const txt = (it?.button_reply?.title ?? it?.list_reply?.title ?? "").toString().trim();
    if (txt) return txt;
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
      const body = bodyFor(msg);

      const { error: insErr } = await service.from("whatsapp_messages").insert({
        direction: "inbound",
        user_id: userId,
        lead_id: leadId,
        phone: waPhone,
        body,
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
          /* Reply → 'replied'. ⛔ NO next_action IS WRITTEN ANY MORE (2026-09-13). This used to
             also set next_action 'send_draft' due today, and nothing ever cleared it when the
             operator answered: 625 unarchived leads carried an overdue 'send_draft' by the time it
             was noticed. The Dashboard's Next Actions card has derived "they replied and you have
             not answered" from message timestamps since 2026-07-28 (src/lib/dashboardTasks.ts), so
             the stored copy was pure duplication that only ever went stale. A stored next_action is
             now something a PERSON set, and only a person clears it. */
          await service
            .from("outreach_leads")
            .update({ status: "replied" })
            .eq("id", leadId)
            .not("status", "in", NO_DOWNGRADE);
        } catch (e) {
          console.error(`[whatsapp-inbound] lead status→replied failed (${leadId}):`, (e as Error).message);
        }

        /* Is this business archived? Archiving is the operator saying "stop contacting them", so it
           must stop the AUTOMATIC consequences of an inbound reply — the audit and the pitch — not
           just hide the lead from the SPA. Read once here and used by both automations below.
           Deliberately narrow: the reply is still stored and the lead still flips to 'replied' above,
           because recording what a business said is not the same as contacting them, and an operator
           un-archiving later should see the full history.
           Only queried when at least one automation could act on it, so the normal inbound path pays
           nothing. A failed read leaves this false: the individual send paths re-check archived at
           send time, so failing open here cannot produce a send. */
        let leadArchived = false;
        if (autoReplyEnvOn() || Deno.env.get("AUTO_REPLY_FLOW_ENABLED") === "1") {
          try {
            const { data: archRow } = await service
              .from("outreach_leads").select("is_archived").eq("id", leadId).maybeSingle();
            leadArchived = archRow?.is_archived === true;
            if (leadArchived) {
              console.log(`[whatsapp-inbound] lead ${leadId}: archived — skipping auto-audit and auto-pitch (reply still stored).`);
            }
          } catch (e) {
            console.error(`[whatsapp-inbound] archived check failed (${leadId}):`, (e as Error).message);
          }
        }

        // Automation A: a reply auto-triggers an AI-visibility audit for this lead. Fired at most
        // ONCE per lead — idempotency guard: skip if an ai_audits row already exists for the lead,
        // so repeat replies never spawn duplicate audits. Own try/catch: a failure to start the
        // audit must NEVER break the inbound webhook (the reply is already stored + status set).
        // Runs through the existing async queue; no follow-up message here (that's automation B).
        try {
          const { data: existingAudit } = await service
            .from("ai_audits").select("id").eq("lead_id", leadId).limit(1).maybeSingle();
          // Automation A gated OFF by default while audit_reply is in Meta review / replies are
          // handled manually. Set AUTO_REPLY_FLOW_ENABLED=1 to re-enable (no code change).
          if (Deno.env.get("AUTO_REPLY_FLOW_ENABLED") === "1" && !existingAudit && !leadArchived) {
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
                  // See ownWebsite: a Facebook page is not a website, and was being SEO-scanned.
                  website: ownWebsite(lead.website),
                  has_website: !!ownWebsite(lead.website),
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

        // Auto audit_reply rule (SEPARATE from the legacy Automation A/B chain above, which stays
        // gated by AUTO_REPLY_FLOW_ENABLED and untouched): the lead's FIRST substantive human
        // inbound THAT IS A REPLY TO THE initial_contact OPENER queues ONE delayed audit_reply,
        // processed ≥3 min later by process-whatsapp-queue (mode 'auto_replies') so a decline
        // arriving in the meantime cancels it. Hard-gated: the AUTO_AUDIT_REPLY_ENABLED env
        // kill-switch AND the Inbox UI toggle must BOTH be on.
        // ⛔ THE OPENER GATE (below) IS LOAD-BEARING: a reply to any OTHER outbound (hook_followup,
        // contact_followup, audit_reply itself, onboarding_followup, re_engage, or a manual message)
        // must NOT auto-send the audit report — only a reply to "is this the right number?" should.
        // Queue-time guards here; send-time re-checks live in the processor. The lead_id UNIQUE
        // index on whatsapp_auto_replies makes "once per lead, ever" structural (23505 → skip).
        // Own try/catch — a missing table / any failure can never break the inbound webhook.
        try {
          /* !leadArchived: an archived lead's reply arms NOTHING — no whatsapp_auto_replies row at
             all, rather than a skipped_* one. The lead_id UNIQUE index makes any row a once-ever
             claim, so recording a skip here would silently burn the slot and mean an un-archived
             lead could never be pitched. Nothing is lost by not writing: the reply is stored, the
             lead shows as 'replied', and the operator sees the thread in the Inbox. */
          if (autoReplyEnvOn() && (await autoReplyToggleOn(service)) && !leadArchived &&
              isSubstantiveText(body)) {
            /* ⛔ ONCE PER BUSINESS, EVER — keyed on the whatsapp_auto_replies slot, NOT "first
               inbound". The old `inboundCount <= 1` test was fragile in exactly the ways that made
               this feel dead: a bot-ack, media or reaction as message #1 pushed the real "yes" to
               inbound #2 (missed), and rapid back-to-back messages could each pass it. The slot is
               the truth: if this lead already holds ANY row (pending, sent, awaiting_audit, or any
               flagged/skipped status), the once-ever pitch is already claimed and we never arm
               again. Note this is NOT the type=="text" gate either — it was dropped above so a
               template QUICK-REPLY BUTTON (whose label bodyFor now extracts) counts as a real reply.
               The lead_id UNIQUE index remains the ATOMIC backstop for truly simultaneous messages:
               every insert below skips on 23505, and the awaiting_audit insert gates the audit
               firing, so back-to-back replies can never double-audit or double-pitch. */
            const { data: existingSlot } = await service
              .from("whatsapp_auto_replies")
              .select("id").eq("lead_id", leadId).limit(1).maybeSingle();
            if (!existingSlot) {
              /* ⛔ THE OPENER GATE — auto-audit fires ONLY when the LAST thing WE sent this lead was
                 the initial_contact opener. This is the condition the feature's intent always
                 assumed but the code never enforced: without it, a reply to ANY outbound
                 (hook_followup, contact_followup, audit_reply, onboarding_followup, re_engage, or a
                 manual message) auto-sent the audit report, and a first inbound with no prior opener
                 did too. Non-failed only — a failed opener was never delivered, so the lead cannot be
                 replying to it. Keyed by lead_id, like the slot check above. On the "not the
                 opener" branch we arm NOTHING (no whatsapp_auto_replies row): the reply is already
                 stored and the lead already shows 'replied' for the operator to handle by hand. */
              const { data: lastOut } = await service
                .from("whatsapp_messages")
                .select("template_name")
                .eq("lead_id", leadId).eq("direction", "outbound").neq("status", "failed")
                .order("created_at", { ascending: false }).limit(1).maybeSingle();
              const lastOutboundTemplate = (lastOut as { template_name: string | null } | null)?.template_name ?? null;
              /* ⛔ NEVER AUTO-PITCH A PAYING CUSTOMER — amount_paid > 0, the money-not-status rule
                 (CLAUDE.md §6). A paid client must never receive the audit sales pitch, whatever they
                 reply. Arm-time refusal (no row); the send path re-checks as the authoritative line. */
              const { data: paidRow } = await service
                .from("outreach_leads").select("amount_paid").eq("id", leadId).maybeSingle();
              const leadPaid = ((paidRow as { amount_paid: number | null } | null)?.amount_paid ?? 0) > 0;
              if (lastOutboundTemplate !== "initial_contact") {
                console.log(`[auto-reply] lead ${leadId}: reply arrived but the last outbound was '${lastOutboundTemplate ?? "none"}', not the initial_contact opener — NOT arming an audit pitch.`);
              } else if (leadPaid) {
                console.log(`[auto-reply] lead ${leadId}: paying customer (amount_paid > 0) — NEVER auto-pitch, not arming.`);
              } else if (looksAutomated(body)) {
                // Booking-bot / out-of-office auto-ack — not a human yes. No row, no send; the
                // thread is already surfaced to the operator (status='replied' + next_action).
                console.log(`[auto-reply] lead ${leadId}: bot_autoreply_skipped — first inbound matches an auto-responder pattern, not arming a pitch.`);
              } else if (await phoneSuppressed(service, waPhone)) {
                // Suppressed number → burn the once-ever slot with skipped_suppressed (never pend).
                await service.from("whatsapp_auto_replies").insert({
                  lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                  status: "skipped_suppressed", fire_after: new Date().toISOString(),
                });
                console.log(`[auto-reply] lead ${leadId}: suppressed — recorded skipped_suppressed.`);
              } else if (isDecline(body)) {
                /* Obvious decline → flag for a human; never auto-send anything.
                   ⛔ AND SUPPRESS, at the earliest moment the no is visible. The send-time path in
                   process-whatsapp-queue also suppresses, but only for leads that had a pitch
                   queued — a decline arriving from someone with nothing pending used to leave no
                   trace outside this flag, which no other channel reads. Suppressing here covers
                   both. The lead id rides along so the EMAIL channel is covered too. */
                await suppress(service,
                  { phone: waPhone, leadId, email: null },
                  { reason: "replied_no", source: "whatsapp_decline_inbound" });
                await service.from("whatsapp_auto_replies").insert({
                  lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                  status: "flagged_decline", reason: body.slice(0, 300), fire_after: new Date().toISOString(),
                });
                console.log(`[auto-reply] lead ${leadId}: decline detected — flagged for human.`);
              } else {
                // The reply-trigger template (setting; null → the shared default template).
                const replyTemplate = await firstReplyTemplate(service);
                /* ⛔ THE MODE DECIDES THE OUTCOME, NOT THE GUARDS. Everything above this line — the
                   opener gate, the once-ever slot, decline, bot, suppression, paid, archived — runs
                   identically in both working modes, because none of those refusals depends on
                   whether we intend to send. Only what we ARM changes here. Any unreadable or
                   unknown value resolves to 'audit_only', the mode that sends nothing. */
                const mode = await firstReplyMode(service);
                const willSend = modeSends(mode);
                // Does the lead already have a COMPLETED audit (complete/capped — same set the
                // audit_reply resolver accepts)? Cheap two-step existence check.
                let hasCompletedAudit = false;
                const { data: leadAudits } = await service
                  .from("ai_audits").select("id").eq("lead_id", leadId);
                const auditIds = ((leadAudits ?? []) as Array<{ id: string }>).map((a) => a.id);
                if (auditIds.length) {
                  const { data: doneRun } = await service
                    .from("ai_audit_runs").select("id").in("audit_id", auditIds)
                    .in("status", ["complete", "capped"]).limit(1).maybeSingle();
                  hasCompletedAudit = !!doneRun;
                }

                /* ══ MOCKUP PREPARATION ═══════════════════════════════════════════════════════
                   Paul's flow: a reply triggers their audit AND their mockup, then he opens ONE
                   screen, places their images, and sends the before/after by hand.

                   ⛔ CALLED FROM INSIDE THIS BRANCH SO IT INHERITS ALL SEVEN GUARDS. Everything
                   above — the opener gate, the once-ever slot, decline, auto-responder,
                   suppression, paying-customer, archived — has already refused by the time this
                   runs, and every one of those refusals is the right answer for a mockup too. A
                   parallel trigger would need all seven again, which is the drift CLAUDE.md
                   records four incidents of.

                   ⛔ IT SENDS NOTHING. It creates a `draft` row and reads their website. The
                   before/after image is a manual second message, always.

                   🔴 THE ROW IS AWAITED; THE SCRAPE IS NOT. This is a META WEBHOOK — the scrape
                   takes 8-25s (measured 3.2s to 25.9s on six real sites) and Meta retries a slow
                   webhook, which would re-run this whole chain. So the insert (one query) is
                   awaited and the scrape is handed to EdgeRuntime.waitUntil, which runs it after
                   the 200 has gone back. No waitUntil → the row still exists with `scrape: null`
                   and the picker fills it on demand; absent and empty are different values. */
                const prepareMockup = async (): Promise<void> => {
                  try {
                    const outcome = await createMockupRow(service, leadId);
                    if (!outcome.started) {
                      console.log(`[mockup] lead ${leadId}: not prepared — ${outcome.reason}${outcome.detail ? ` (${outcome.detail})` : ""}`);
                      return;
                    }
                    console.log(`[mockup] lead ${leadId}: draft ${outcome.siteId} created, niche '${outcome.niche}'`);
                    const fill = () =>
                      fillMockupFromSite(
                        service,
                        outcome.siteId,
                        {
                          website: outcome.website,
                          businessName: outcome.businessName,
                          niche: outcome.niche,
                          leadId,
                          ownerId: outcome.ownerId,
                        },
                        {
                          supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
                          /* ⚠️ THE INTERNAL DOOR IS NOW OPEN — scan-site-details gained the
                             CRON_SECRET + x-internal-job branch in this same series (its
                             `isInternal`), so this call reaches the scraper for real.
                             ⛔ IF CRON_SECRET IS UNSET IT 401s AND THAT IS THE SAFE FAILURE: the
                             row keeps `scrape: null`, which the picker reads as "not scraped yet"
                             and fills on demand with the operator's own JWT. Degraded, not broken.
                             ⛔ AND NOT TO BE "FIXED" BY SENDING THE SERVICE-ROLE KEY, which §8
                             proves is dead on every function that has such a branch. */
                          auth: {
                            kind: "internal" as const,
                            cronSecret: Deno.env.get("CRON_SECRET") ?? "",
                          },
                        },
                      ).then((r) =>
                        console.log(`[mockup] lead ${leadId}: scrape ${r.ok ? "ok" : "FAILED"} — ${r.detail}`)
                      ).catch((e) => console.error(`[mockup] lead ${leadId}: scrape threw`, (e as Error).message));
                    // deno-lint-ignore no-explicit-any
                    const rt = (globalThis as any).EdgeRuntime;
                    if (rt && typeof rt.waitUntil === "function") rt.waitUntil(fill());
                    else console.log(`[mockup] lead ${leadId}: no waitUntil — scrape deferred to the picker.`);
                  } catch (e) {
                    // A mockup must never break the inbound webhook. The reply is already stored.
                    console.error(`[mockup] lead ${leadId}: prepare threw`, (e as Error).message);
                  }
                };

                /* ⚠️ THE ALREADY-SENT CHECK IS A SEND-MODE QUESTION. In audit_only mode we are not
                   proposing to send anything, so whether a pitch went out before decides nothing —
                   asking it would only mean recording a different reason for the same inaction, and
                   it costs a query on every reply. */
                if (willSend && hasCompletedAudit && (await pitchEverSent(service, leadId, replyTemplate ?? DEFAULT_FIRST_REPLY_TEMPLATE))) {
                  // DURABLE once-ever (arm time): the pitch already went out (message log — covers
                  // manual sends and survives queue-row deletion). Burn the slot instead of arming.
                  await service.from("whatsapp_auto_replies").insert({
                    lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                    template_name: replyTemplate,
                    status: "skipped_already_sent", fire_after: new Date().toISOString(),
                  });
                  console.log(`[auto-reply] lead ${leadId}: pitch already sent — recorded skipped_already_sent, not re-arming.`);
                } else if (hasCompletedAudit) {
                  /* They already have a measurement. In SEND mode that arms the delayed pitch as
                     before; in audit_only mode there is nothing left to do — no audit to run and
                     nothing to send — so the slot is claimed TERMINALLY and the operator sees a
                     lead whose audit is ready to quote by hand.
                     ⛔ armStatusFor owns the choice, so the trigger and the tests cannot disagree
                     about which status a mode writes. */
                  const armStatus = armStatusFor(mode, true);
                  if (!armStatus) {
                    console.log(`[auto-reply] lead ${leadId}: mode '${mode}' takes no automatic action — nothing armed.`);
                  } else {
                    const { error: qErr } = await service.from("whatsapp_auto_replies").insert({
                      lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                      template_name: replyTemplate,
                      status: armStatus,
                      /* A terminal audit_only row is due immediately and never read by the drain;
                         a pending one keeps the 3-minute cancel window that lets a late decline
                         stop the send. */
                      fire_after: armStatus === "pending"
                        ? new Date(Date.now() + 3 * 60_000).toISOString()
                        : new Date().toISOString(),
                      ...(armStatus === AUDIT_ONLY_STATUS
                        ? { reason: "audit already complete — send the template by hand" }
                        : {}),
                    });
                    if (qErr && (qErr as { code?: string }).code !== "23505") {
                      console.error(`[auto-reply] queue insert failed for lead ${leadId}:`, (qErr as { message?: string }).message);
                    } else if (!qErr) {
                      console.log(armStatus === "pending"
                        ? `[auto-reply] lead ${leadId}: '${replyTemplate ?? DEFAULT_FIRST_REPLY_TEMPLATE}' queued (fires in ~3 min).`
                        : `[auto-reply] lead ${leadId}: audit already complete and mode is '${mode}' — recorded ${AUDIT_ONLY_STATUS}, NOTHING will send.`);
                      /* Mockup call site 1 of 2: they ALREADY have a measurement. The audit half is
                         done, so this is the only preparation left before Paul opens the picker. */
                      await prepareMockup();
                    }
                  }
                } else {
                  // AUTO CHAIN — no completed audit yet. If the lead has usable audit inputs, fire
                  // create-ai-audit internally and park the pitch as 'awaiting_audit' (claims the
                  // once-ever slot WITHOUT firing; the completion hook upgrades it to pending when
                  // the audit completes — capped/failed audits leave it visible for a human). If
                  // inputs are missing, NEVER guess garbage — flagged_no_inputs for a human (burns
                  // the slot, correctly: no audit can exist, so no completion will ever fire).
                  const { data: leadRow } = await service
                    .from("outreach_leads")
                    .select("business_name, category, search_keyword, search_location, address, country, website, user_id")
                    .eq("id", leadId).maybeSingle();
                  const bizType = ((leadRow?.category as string) || (leadRow?.search_keyword as string) || "").trim();
                  const locText = ((leadRow?.search_location as string) || (leadRow?.address as string) || "").trim();
                  if (!leadRow?.business_name || !leadRow?.user_id || !bizType || !locText) {
                    await service.from("whatsapp_auto_replies").insert({
                      lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                      template_name: replyTemplate,
                      status: "flagged_no_inputs",
                      reason: `missing ${[!bizType ? "business_type" : "", !locText ? "location" : ""].filter(Boolean).join("+") || "lead fields"} — run the audit manually`,
                      fire_after: new Date().toISOString(),
                    });
                    console.log(`[auto-reply] lead ${leadId}: no completed audit + missing inputs — flagged_no_inputs.`);
                  } else {
                    /* Claim the slot FIRST (row = the intent + the template memory); only start the
                       audit if we actually own the slot (a 23505 means another trigger got there).
                       ⛔ AND THE STATUS IS WHERE THE TWO MODES DIVERGE — STRUCTURALLY, NOT BY A FLAG.
                       'awaiting_audit' is the status the completion hook in process-ai-audit-queue
                       looks for (`.eq("status", "awaiting_audit")`) when it arms the send. An
                       audit_only row is written as AUDIT_ONLY_STATUS instead, which that hook cannot
                       see, so no completion, no later mode flip and no stale row can turn this into
                       a message. The audit below still runs exactly the same way either way. */
                    const armStatus = armStatusFor(mode, false) ?? AUDIT_ONLY_STATUS;
                    const { error: awaitErr } = await service.from("whatsapp_auto_replies").insert({
                      lead_id: leadId, phone: waPhone, trigger_wa_message_id: wamid || null,
                      template_name: replyTemplate,
                      status: armStatus,
                      ...(armStatus === AUDIT_ONLY_STATUS
                        ? { reason: "audit running — send the template by hand when it completes" }
                        : {}),
                      fire_after: new Date().toISOString(), // real fire_after is set by the completion upgrade
                    });
                    if (awaitErr) {
                      if ((awaitErr as { code?: string }).code !== "23505") {
                        console.error(`[auto-reply] ${armStatus} insert failed for lead ${leadId}:`, (awaitErr as { message?: string }).message);
                      }
                    } else {
                      /* Mockup call site 2 of 2: no completed audit, so the audit is about to be
                         fired below. The mockup does not wait for it — the two are independent
                         (the mockup needs their WEBSITE, the audit needs Apify), and only the
                         composite PNG needs both. Prepared first so the row exists even if the
                         audit path below returns early. */
                      await prepareMockup();
                      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                      try {
                        const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
                            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
                            "x-internal-job": "1",
                          },
                          // Outreach hook: the count is STATED, from the shared policy. This used
                          // to send nothing and inherit create-ai-audit's default — and the
                          // comment here claimed that default was 4 when it was 3, which is
                          // exactly how a silent cost drift starts.
                          body: JSON.stringify({
                            user_id: leadRow.user_id,
                            lead_id: leadId,
                            business_name: leadRow.business_name,
                            business_type: bizType,
                            location_text: locText,
                            country: leadRow.country ?? null,
                            website: ownWebsite(leadRow.website),
                            has_website: !!ownWebsite(leadRow.website),
                            question_count: OUTREACH_HOOK_QUESTIONS,
                          }),
                        });
                        if (!res.ok) {
                          const txt = await res.text().catch(() => "");
                          await service.from("whatsapp_auto_replies")
                            .update({ status: "flagged_error", reason: `auto-audit start failed: HTTP ${res.status} ${txt.slice(0, 200)}` })
                            .eq("lead_id", leadId).eq("status", "awaiting_audit");
                          console.error(`[auto-reply] chain audit start failed for lead ${leadId}: HTTP ${res.status}`);
                        } else {
                          console.log(`[auto-reply] lead ${leadId}: no completed audit — auto-audit started, pitch parked as awaiting_audit.`);
                        }
                      } catch (e) {
                        await service.from("whatsapp_auto_replies")
                          .update({ status: "flagged_error", reason: `auto-audit start error: ${(e as Error).message}`.slice(0, 300) })
                          .eq("lead_id", leadId).eq("status", "awaiting_audit");
                        console.error(`[auto-reply] chain audit start error for lead ${leadId}:`, (e as Error).message);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`[auto-reply] trigger error for lead ${leadId}:`, (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[whatsapp-inbound] message handling error:", (e as Error).message);
    }
  }

  return inserted;
}
