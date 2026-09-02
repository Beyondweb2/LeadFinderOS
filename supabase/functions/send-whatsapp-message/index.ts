import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveWhatsAppEnv,
  toWhatsAppNumber,
  sendViaGraph,
  textPayload,
  claimTemplatePayload,
  renderTemplateBody,
  WA_TEMPLATES,
  TEMPLATES_NEEDING_REAL_NAME,
  TEMPLATES_ALLOWING_NO_FIRST_NAME,
  firstNameFrom,
} from "../_shared/whatsapp-send.ts";
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";
import { pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { isColdOutreachTemplate } from "../../../src/lib/coldOutreach.ts";
import { resolveOnboardingFollowupVars } from "../_shared/onboarding-followup.ts";

// send-whatsapp-message — the Inbox reply sender (Phase A).
//
// Per-operator. Reuses the SAME proven send mechanism as process-whatsapp-queue
// (env + test-mode gate + Graph POST, all from _shared/whatsapp-send.ts). It sends
// ONE message to ONE number: a free-form TEXT inside the 24h window, or a claim
// TEMPLATE outside it. TEST_MODE is respected identically — nothing hits Meta unless
// WHATSAPP_TEST_MODE === "off" and both secrets exist. Every attempt is logged to
// whatsapp_messages as an outbound row owned by the sending operator.
//
// ⛔ IT DOES NOT ENFORCE THE DAILY OUTREACH CAP — in-window replies are exempt by design; the cap
// (DAILY_CAP) lives in process-whatsapp-queue for the outreach campaign.
//    ⚠️ THIS LINE SAID "the 10/day outreach cap". The cap has been 40, then 60, then 100, and is 120
//    as of 2026-08-12 — the number here was stale by more than 10x. It is the SECOND time this exact
//    fault has been recorded in this codebase (process-whatsapp-queue's own header once said 40 while
//    the constant was 100, and Paul believed his cap was 40 because of it). Never write the number in
//    prose: name the constant, which cannot go stale.
// ⚠️ AND EXEMPT IS NOT THE SAME AS FREE. Every send here writes a whatsapp_sends row, and
// process-whatsapp-queue's `sentToday` counts EVERY row in that table — so replies SPEND the queue's
// daily allowance while being immune to it. On 2026-08-11, 37 of 85 sends came from this path.
// A busy reply day therefore throttles the outreach queue, not this function.

const CLAIM_ORIGIN = "https://yoursites.uk";
const WINDOW_MS = 24 * 60 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth the operator ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    const operatorId = u?.user?.id;
    if (!operatorId) return json({ ok: false, error: "unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- Parse ---
    const body = await req.json().catch(() => ({}));
    const rawPhone: string = typeof body.phone === "string" ? body.phone : "";
    const leadId: string | null = typeof body.lead_id === "string" && body.lead_id ? body.lead_id : null;
    const text: string = typeof body.body === "string" ? body.body.trim() : "";
    const templateName: string | null = typeof body.template_name === "string" && body.template_name ? body.template_name : null;
    // Set by the Inbox ONLY after the operator confirmed a repeat send. Strict === true so a
    // stray truthy value ("false", 1) can't wave the duplicate guard through.
    const allowResend: boolean = body.allow_resend === true;
    const country: string | null = typeof body.country === "string" ? body.country : null;

    const to = toWhatsAppNumber(rawPhone, country);
    if (!to) return json({ ok: false, error: "invalid_phone" }, 400);
    if (!text && !templateName) return json({ ok: false, error: "empty_message" }, 400);

    // --- Ownership check: the operator must own this conversation ---
    // Either they already have a message thread with this number, OR they own a lead
    // whose number normalises to it (new conversation started from a lead).
    let ownsConversation = false;
    let resolvedLeadId = leadId;
    let businessName = "";

    const { data: existing } = await service
      .from("whatsapp_messages")
      .select("id, lead_id")
      .eq("user_id", operatorId)
      .eq("phone", to)
      .limit(1);
    if (existing && existing.length) {
      ownsConversation = true;
      if (!resolvedLeadId) resolvedLeadId = (existing[0] as { lead_id: string | null }).lead_id;
    }

    /* is_archived comes back so an archived lead can be refused below. Archiving means "stop
       contacting this business"; the Inbox no longer lists archived leads, so the UI route is
       already closed, but this function is callable directly and was the last path that would
       still send to one. */
    let leadArchived = false;
    if (resolvedLeadId) {
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, user_id, business_name, phone, country, is_archived")
        .eq("id", resolvedLeadId)
        .maybeSingle();
      const l = lead as { user_id: string; business_name: string; phone: string; country: string | null; is_archived: boolean | null } | null;
      if (l && l.user_id === operatorId && toWhatsAppNumber(l.phone, l.country) === to) {
        ownsConversation = true;
        businessName = l.business_name ?? "";
        leadArchived = l.is_archived === true;
      }
    }
    if (!ownsConversation) return json({ ok: false, error: "forbidden" }, 403);
    /* Checked AFTER ownership so an outsider probing lead ids still gets 403 rather than learning
       which ids exist and are archived. 409, not 403: the caller is allowed here, the lead's state
       is what refuses. */
    if (leadArchived) return json({ ok: false, error: "lead_archived" }, 409);

    // --- 24h customer-service window (from the operator's own inbound rows) ---
    const { data: lastIn } = await service
      .from("whatsapp_messages")
      .select("created_at")
      .eq("user_id", operatorId)
      .eq("phone", to)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastInboundAt = lastIn && lastIn.length ? new Date((lastIn[0] as { created_at: string }).created_at).getTime() : null;
    const windowOpen = lastInboundAt != null && Date.now() - lastInboundAt < WINDOW_MS;

    const env = resolveWhatsAppEnv();

    // --- Decide payload: template (out-of-window) vs text (in-window) ---
    let payload: Record<string, unknown>;
    let messageType: "text" | "template";
    let usedTemplate: string | null = null;
    // What we STORE as the message body: the text for free-form, or the rendered
    // template copy (real wording + business name + claim URL) so the Inbox shows
    // what the barber actually receives — not the internal template name.
    let storedBody: string | null = null;
    // What the SEND-AUDIT row records: the business name and the link actually placed in the
    // template. Hoisted out of the branches below because whatsapp_sends is written after them.
    // For audit_reply the "claim url" IS the report link — the same column, the send's outbound URL.
    let auditBusinessName = businessName;
    let auditClaimUrl = "";

    if (templateName) {
      if (!WA_TEMPLATES[templateName]) return json({ ok: false, error: "unknown_template" }, 400);
      /* ⛔ THE PHONE-HISTORY SEATBELT, SAME RULE AS THE DRIP. The comment in the opener branch
         below used to say "openers are guarded in the queue, not here" - and that was the hole.
         Measured 2026-09-02: a manual audit_result_hook went to SJA Locksmiths a day after their
         opener. Its whatsapp_ever_delivered was already true, so the QUEUE would have refused it at
         the already_sent guard; this path never runs that guard, and pitchEverSent could not help
         because it is per-TEMPLATE (initial_contact != audit_result_hook).

         ⛔ IT SITS ABOVE EVERY BRANCH ON PURPOSE. Placed inside them it would need writing three
         times - opener, audit, contact_followup - which is how the queue and this function drifted
         apart in the first place. One check, before anything is built.

         ⚠️ A FREE-FORM MESSAGE IS EXEMPT, AND THAT IS NOT THE ABSENT-VALUE TRAP. No templateName
         means the operator typed a reply into an open thread: prior contact is the PRECONDITION for
         that, not a hazard. The guard is about cold TEMPLATE sends, and `isColdOutreachTemplate`
         treats an unknown NAME as cold - it is only reached when a name was actually given.

         ⚠️ OVERRIDABLE BY allow_resend, matching the audit_reply guard below rather than the
         drip. The drip is a machine draining a list and must never be talked round; here a human is
         looking at the thread and can have a good reason (they asked again, the first went to a dead
         handset). The UI sends allow_resend only after an explicit confirm, so an ACCIDENTAL repeat -
         the actual failure mode - is still refused. */
      if (!allowResend && isColdOutreachTemplate(templateName)) {
        const { data: priorAny } = await service
          .from("whatsapp_messages")
          .select("id, lead_id")
          .eq("phone", to)
          .neq("status", "failed")
          .limit(1);
        if (Array.isArray(priorAny) && priorAny.length > 0) {
          return json({ ok: false, error: "phone_already_contacted", template: templateName }, 200);
        }
      }
      const tvars = WA_TEMPLATES[templateName].vars;
      const lang = WA_TEMPLATES[templateName].lang;
      /* Refuse before building anything: this template greets by name, so a blank name would send
         "Hi your business, Paul here" - visibly automated in the one message meant to sound human. */
      if (TEMPLATES_NEEDING_REAL_NAME.has(templateName) && !businessName.trim()) {
        return json({ ok: false, error: "no_business_name" }, 200);
      }
      const needsAudit = tvars.includes("trade") || tvars.includes("competitors");
      const needsOnboardingUrl = tvars.includes("onboarding_url");
      const needsContactName = tvars.includes("contact_first_name");
      if (needsContactName) {
        /* questionnaire_followup: {{1}} = the OWNER'S first name (first word of the lead's
           contact_name), {{2}} = business name. The one template that greets a person, so a blank
           name refuses with a code the UI turns into "type their first name" — never "Hi there".
           ⛔ ONE SEND PER LEAD, NO OVERRIDE. audit_reply's guard is overridable because a re-pitch
           is sometimes service; a second "just the payment step left" nudge to the same person is
           pressure, never service — Paul's rule 2026-08-17. No allow_resend read here on purpose. */
        if (!resolvedLeadId) return json({ ok: false, error: "template_needs_lead" }, 400);
        if (await pitchEverSent(service, resolvedLeadId, templateName)) {
          return json({ ok: false, error: "pitch_already_sent" }, 200);
        }
        const { data: cn } = await service
          .from("outreach_leads").select("contact_name").eq("id", resolvedLeadId).maybeSingle();
        const first = firstNameFrom((cn as { contact_name: string | null } | null)?.contact_name);
        /* A blank first name refuses — UNLESS this template allows the "there" fallback
           (hook_followup, for cold report leads we often have no name for). questionnaire_followup is
           not in that set, so its refusal is unchanged. When allowed and blank, `first` stays "" and
           the resolver + body renderer both degrade {{1}} to "there". */
        if (!first && !TEMPLATES_ALLOWING_NO_FIRST_NAME.has(templateName)) {
          return json({ ok: false, error: "no_contact_name" }, 200);
        }
        payload = claimTemplatePayload(templateName, lang, businessName, "", { contactName: first });
        storedBody = renderTemplateBody(templateName, businessName, "", undefined, undefined, first);
        auditClaimUrl = "";
      } else if (needsOnboardingUrl) {
        /* onboarding_followup: {{1}} business name, {{2}} that lead's onboarding URL, both resolved
           server-side from the lead's own row. Refuses rather than sending a partial — the entire
           message is a pointer to that link, so a follow-up without a correct one is spam that also
           burns a warm lead. Same contract as the audit branch below. */
        if (!resolvedLeadId) return json({ ok: false, error: "template_needs_lead" }, 400);
        const f = await resolveOnboardingFollowupVars(service, resolvedLeadId);
        if (!f.ok) return json({ ok: false, error: "followup_unavailable", reason: f.reason }, 200);
        payload = claimTemplatePayload(templateName, lang, f.business, "", { onboardingUrl: f.url });
        storedBody = renderTemplateBody(templateName, f.business, f.url);
        auditBusinessName = f.business;
        auditClaimUrl = f.url; // the outbound URL for this send, recorded like any other
      } else if (needsAudit) {
        // audit_reply: 4 vars resolved server-side STRICTLY from the lead's own completed audit
        // (report link = /a/<auditId>, competitors from that audit). Refuse (don't send a broken
        // template) when the lead has no completed audit / no competitors.
        if (!resolvedLeadId) return json({ ok: false, error: "template_needs_lead" }, 400);
        /* ONCE PER LEAD BY DEFAULT, DELIBERATELY OVERRIDABLE. The auto path has always had this
           guard; this path never called it, even though pitchEverSent's contract is "has this
           template EVER gone to this lead" and it reads the message log precisely so manual sends
           are covered. Two leads were pitched twice as a result.

           Not an absolute block: a second pitch is sometimes the right call (they replied and asked
           for it again, the first went to a dead handset). An absolute block would make the product
           wrong in those cases. So the refusal is the DEFAULT and the operator can override it by
           confirming — the UI sends allow_resend only after an explicit yes.

           The guard still stands for anything that does not ask for the override, which is what
           protects against an accidental repeat or a caller looping over leads. */
        if (!allowResend && await pitchEverSent(service, resolvedLeadId, templateName)) {
          return json({ ok: false, error: "pitch_already_sent" }, 200);
        }
        const a = await resolveAuditReplyVars(service, resolvedLeadId);
        if (!a.ok) return json({ ok: false, error: "audit_reply_unavailable", reason: a.reason }, 200);
        /* ⛔ BUILT FROM THE TEMPLATE'S DECLARED VARS - see the identical note in
           process-whatsapp-queue. `needsAudit` is `trade || competitors`, so audit_result_hook
           enters here as well, and a fixed `{ trade, competitors }` would leave its `town` and
           `audit_url` empty (templateBodyParams throws on the latter). */
        const auditExtra: Record<string, string> = { trade: a.trade };
        if (tvars.includes("competitors")) auditExtra.competitors = a.competitors;
        if (tvars.includes("town")) auditExtra.town = a.town;
        if (tvars.includes("audit_url")) auditExtra.auditUrl = a.link;
        payload = claimTemplatePayload(templateName, lang, a.business, a.link, auditExtra);
        auditBusinessName = a.business;
        auditClaimUrl = a.link;
        storedBody = renderTemplateBody(templateName, a.business, a.link, a.trade, a.competitors, undefined, a.town);
      } else {
        /* ⛔ contact_followup — a MANUAL follow-up, so ONE PER LEAD, NO OVERRIDE. It is a ["name"]
           template and would otherwise fall through this opener branch with no history guard at all
           (openers are guarded in the queue, not here). Same contract as hook_followup: a lead, then
           pitchEverSent for THIS template — a second "is this the right number" nudge is pressure. */
        if (templateName === "contact_followup") {
          if (!resolvedLeadId) return json({ ok: false, error: "template_needs_lead" }, 400);
          if (await pitchEverSent(service, resolvedLeadId, templateName)) {
            return json({ ok: false, error: "pitch_already_sent" }, 200);
          }
        }
        // Claim/opener template. The claim link is required ONLY for templates that use a url var;
        // a url-less opener (e.g. initial_contact, vars ["name"]) sends with no link (claimUrl "").
        const needsUrl = tvars.includes("url");
        let claimUrl = "";
        if (needsUrl) {
          if (!resolvedLeadId) return json({ ok: false, error: "template_needs_lead" }, 400);
          const { data: site } = await service
            .from("generated_sites")
            .select("share_token")
            .eq("lead_id", resolvedLeadId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const shareToken = (site as { share_token: string | null } | null)?.share_token ?? null;
          if (!shareToken) return json({ ok: false, error: "no_claim_link" }, 400);
          claimUrl = `${CLAIM_ORIGIN}/s/${shareToken}`;
        }
        payload = claimTemplatePayload(templateName, lang, businessName, claimUrl);
        storedBody = renderTemplateBody(templateName, businessName, claimUrl);
        auditClaimUrl = claimUrl;
      }
      messageType = "template";
      usedTemplate = templateName;
    } else {
      // Free-form text — only deliverable inside the 24h window when LIVE. In test
      // mode we allow it (simulated) so the UI can be exercised before the webhook.
      if (env.live && !windowOpen) return json({ ok: false, error: "window_closed" }, 200);
      payload = textPayload(text);
      messageType = "text";
      storedBody = text;
    }

    // --- Send (or simulate in test mode) ---
    let status = "simulated";
    let messageId: string | null = null;
    let sendError: string | null = null;

    if (env.live) {
      const r = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);
      if (r.ok) { status = "sent"; messageId = r.messageId; }
      else { status = "failed"; sendError = r.error; }
    } else {
      console.log(`WOULD SEND (${messageType}) to ${to}${usedTemplate ? ` [${usedTemplate}]` : ""}: ${text || "(template)"}`);
    }

    // --- Log the outbound row (owned by the operator) ---
    const { data: inserted, error: insErr } = await service.from("whatsapp_messages").insert({
      direction: "outbound",
      user_id: operatorId,
      lead_id: resolvedLeadId,
      phone: to,
      body: storedBody,
      message_type: messageType,
      template_name: usedTemplate,
      wa_message_id: messageId,
      status,
      test_mode: env.testMode,
      error: sendError,
    }).select("id, created_at").maybeSingle();
    if (insErr) console.error("[send-whatsapp-message] log insert failed:", insErr.message);

    /* THE SEND AUDIT ROW. Until now only the campaign queue wrote whatsapp_sends, so every send
       from this path was missing from it — 45 audit_reply sends existed in the message log and
       nowhere in the audit table. Two things depended on that table and were therefore wrong:
       the delivery-receipt mirror, and the DAILY CAP (process-whatsapp-queue counts whatsapp_sends
       rows since the London day start), which was undercounting real volume against Meta.

       Non-blocking, deliberately: the message is already gone by this point, so a failed log must
       never throw, retry, or double-send. Same contract as the queue's own message-log insert. */
    try {
      const { error: sendLogErr } = await service.from("whatsapp_sends").insert({
        lead_id: resolvedLeadId,
        user_id: operatorId, // the operator who sent it; the queue writes null for automated sends
        template: usedTemplate, // null for a free-form text — still a real send against the cap
        phone: to,
        business_name: auditBusinessName || null,
        claim_url: auditClaimUrl,
        test_mode: env.testMode,
        message_id: messageId,
        delivery_status: status,
        error: sendError,
      });
      if (sendLogErr) {
        console.error("[send-whatsapp-message] send-audit insert failed (non-blocking):", sendLogErr.message);
      }
    } catch (e) {
      console.error("[send-whatsapp-message] send-audit insert threw (non-blocking):", (e as Error).message);
    }

    // A successful LIVE send of a PITCH-CLASS template (trade/competitors vars — audit_reply today)
    // moves the lead to report_sent. Forward-only (mirrors the webhook's pattern): never overwrites
    // the interested/paid-class statuses. Free-form texts and openers don't move the pipeline here.
    if (env.live && status === "sent" && resolvedLeadId && usedTemplate) {
      const tvars = WA_TEMPLATES[usedTemplate]?.vars ?? [];
      if (tvars.includes("trade") || tvars.includes("competitors")) {
        try {
          await service.from("outreach_leads")
            .update({ status: "report_sent" })
            .eq("id", resolvedLeadId)
            .not("status", "in", "(interested,price_given,payment_received,in_delivery,completed)");
        } catch (e) {
          console.error(`[send-whatsapp-message] report_sent status write failed for lead ${resolvedLeadId}:`, (e as Error).message);
        }
      }
    }

    return json({
      ok: status !== "failed",
      status,
      simulated: !env.live,
      windowOpen,
      messageId,
      message: inserted ?? null,
      error: sendError,
    });
  } catch (e) {
    console.error("[send-whatsapp-message] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
