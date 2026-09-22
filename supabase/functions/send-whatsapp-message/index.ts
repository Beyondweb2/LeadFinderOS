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
import { buildsFromAudit } from "../../../src/lib/templateRouting.ts";
/* 🔴 THE SAME LEAF THE QUEUE READS, AND IT WAS USED HERE FOR A DAY WITHOUT BEING IMPORTED.
   `rivalHookDecision` and `templateNeedsRivals` were written into the audit branch on 2026-09-14 and
   the import line was never added — a plain ReferenceError that nothing local could see, because
   `npm run typecheck` does not cover supabase/functions and the parse gate never resolves names.
   It surfaced only once the branch became reachable AND the error path started reporting honestly.
   `scripts/check-edge-undefined.mjs` is the gate. */
import { rivalHookDecision, templateNeedsRivals } from "../../../src/lib/rivalHook.ts";
import { pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { isColdOutreachTemplate } from "../../../src/lib/coldOutreach.ts";
import { resolveOnboardingFollowupVars } from "../_shared/onboarding-followup.ts";
import { createTemplateSnapshot } from "../../../src/lib/whatsappTemplateSnapshot.ts";

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

/* ⛔ THE BUILD MARKER — THE ONLY THING ON THIS ENDPOINT THAT CAN PROVE WHICH BYTES ARE LIVE.
   Three faults in a row on one button were each diagnosed against `main` because there was no way
   to read the DEPLOYED version: the routing fix changed behaviour only, so a deploy timestamp
   eleven seconds from a file's mtime was the entire evidence base (CLAUDE.md §30c).
   ⛔ IT RIDES ON `corsHeaders`, SO IT IS ON THE **OPTIONS PREFLIGHT** — which needs no credential.
   That is the whole design: anyone can `curl -X OPTIONS` this function and read exactly which build
   is answering, with no operator session, no key, and nothing sent. It carries no secret.
   ⛔ `CAPABILITIES` IS NOT DECORATION AND MUST NOT BE HAND-WAVED. `scripts/dry-run-preview.test.ts`
   asserts "dry_run" is listed IF AND ONLY IF this file actually contains the dry-run return, so the
   marker cannot claim a feature these bytes do not have — a constant that can lie is worse than no
   constant. BUMP `BUILD_ID` in the same commit as any change worth proving live. */
const CAPABILITIES = ["dry_run", "build_phase_hold", "routing_leaf"] as const;
/* Bumped for the initial-opener A/B: this build is the first that carries initial_opener_v2 in
   WA_TEMPLATES (vars []). The preflight marker is the only way to prove those bytes are live. */
const BUILD_ID = "2026-09-22a";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  /* Exposed so a browser can read it too, not only curl. */
  "Access-Control-Expose-Headers": "x-swm-build, x-swm-caps",
  "x-swm-build": BUILD_ID,
  "x-swm-caps": CAPABILITIES.join(","),
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  /* 🔴 DECLARED OUT HERE, ABOVE THE `try`, AND THAT IS THE WHOLE POINT — IT WAS INSIDE IT FOR ONE
     DEPLOY AND BROKE THE CATCH ITSELF (2026-09-15). A `catch` clause is a SIBLING scope, not a child
     of the `try` block, so a `let` declared inside the try is not visible to the catch: every throw
     produced a ReferenceError *inside the error handler*, which escaped Deno.serve, and the runtime
     answered with its own 500 carrying NONE of our CORS headers. The browser could not read it, so
     supabase-js reported "Failed to send a request to the Edge Function" — a THIRD distinct symptom
     for what was still just "something threw".
     ⛔ NOTHING LOCAL COULD SEE IT: `npm run typecheck` does not cover supabase/functions (§3), the
     esbuild parse gate only parses and never resolves names, and Deno is not on this machine. The
     gate is `scripts/edge-catch-scope.test.ts`, which now asserts the outer catch of every edge
     entrypoint references only names declared above its `try`. */
  let phase: "build" | "send" = "build";

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
    /* ⚠️ `let`, and ONLY because a rival-naming template can fall back to video_template when the
       lead's audit cannot supply three competitor names (src/lib/rivalHook.ts). It is reassigned in
       exactly one place; everything downstream — the payload, the stored body, the message row —
       then describes what was ACTUALLY sent, which is the point. */
    let templateName: string | null = typeof body.template_name === "string" && body.template_name ? body.template_name : null;
    /* Non-empty only after a fallback, so the operator who pressed send is told what went instead. */
    let fellBackReason = "";
    // Set by the Inbox ONLY after the operator confirmed a repeat send. Strict === true so a
    // stray truthy value ("false", 1) can't wave the duplicate guard through.
    const allowResend: boolean = body.allow_resend === true;
    const country: string | null = typeof body.country === "string" ? body.country : null;
    /* ══ mode 'dry_run' — PROVE A SEND WILL WORK WITHOUT SENDING ═════════════════════════════════
       Built 2026-09-15, after two live prospects were burned on `audit_followup` 500s (CLAUDE.md
       §30b). The reason a failure was only ever discovered in front of a prospect is that there was
       no way to ask this function what it WOULD do: every refusal and every throw needed a real
       attempt on a real lead to provoke.

       ⛔ IT IS THE SAME CODE PATH, NOT A SECOND ONE. Every guard, every resolver and the real
       `claimTemplatePayload` run exactly as they do for a send; the ONLY difference is that it
       returns the built payload immediately before the Graph POST instead of making it. A separate
       "preview" that rebuilt the payload its own way would be the one-rule-in-two-places failure
       this codebase has recorded seven times — and it would agree with the sender right up to the
       day it mattered.

       ⛔ SO A REFUSAL IS REPORTED, NEVER SKIPPED. pitch_already_sent, phone_already_contacted,
       audit_reply_unavailable, unsafe_template_var and the rest all return their normal 200 with
       ok:false — that IS the answer to "would this send". A dry run that waved the guards through
       to show a payload would be lying about the send it is previewing.

       ⚠️ IT WRITES NOTHING AND SENDS NOTHING: it returns before the Graph POST, before the
       whatsapp_messages insert, before the whatsapp_sends row and before the status move. Unlike
       `test_send` (which costs a real message on purpose, because only Meta can prove Meta accepts
       a template) this proves only OUR half — which is the half that has failed twice.
       ⚠️ AND IT IS THE DEPLOY MARKER. `mode:"dry_run"` exists only in this version, so a response
       carrying `mode:"dry_run"` is proof the live function is running these bytes — §4's rule that
       you assert on something only the target can produce. */
    const dryRun: boolean = body.mode === "dry_run";

    const to = toWhatsAppNumber(rawPhone, country);
    /* ⚠️ test_send is the one mode that does NOT need a phone in the request — it takes its
       destination from WHATSAPP_TEST_NUMBER (see below). Refusing here would make the safest
       form of the call impossible. Every other path still requires a readable number. */
    if (!to && body.mode !== "test_send") return json({ ok: false, error: "invalid_phone" }, 400);

    /* ══ mode 'test_send' — THE ONLY HONEST WAY TO PROVE A TEMPLATE ACTUALLY SENDS ═══════════════
       Built 2026-09-12 on the `instantly-push` mode:'auth_probe' precedent, and for the same
       reason that one exists: every other path through this function reads a lead, writes rows and
       mutates lead status, so "does video_template work" could previously only be answered by
       messaging a real prospect and seeing what happened.

       ⛔ WHAT IT DOES NOT TOUCH, and this list IS the feature:
         · no lead is read, and NO LEAD IS ADOPTED BY PHONE LOOKUP — this returns before the
           conversation lookup below, which would otherwise attach a bare number to whatever lead
           happens to own it;
         · no whatsapp_messages row, no whatsapp_sends row;
         · no lead status change (the live path sets report_sent on success — not here);
         · no queue, no pacing clock, no suppression state.
       It builds the payload with the REAL claimTemplatePayload and posts it with the REAL
       sendViaGraph, so what it proves is the thing we needed proven: our header component, our
       variable order, and Meta accepting both.

       ⛔ HARD-GATED TO ONE NUMBER, AND IT FAILS CLOSED. The destination IS WHATSAPP_TEST_NUMBER —
       read from the secret, never taken from the request (see the note at `dest`). With that secret
       UNSET the mode refuses outright rather than falling back to "any number the caller typed":
       the failure this guards is a mistyped digit reaching a stranger, and an admin typo is exactly
       as damaging as a hostile call. Absence is never permission.
       ⚠️ ADMIN ONLY, using the same user_roles check every other admin mode here uses.
       ⚠️ It sends a REAL message and costs a real template send. It is a diagnostic, not a preview:
       there is no dry-run, because a dry-run would prove nothing about Meta. */
    if (body.mode === "test_send") {
      const { data: roleRow } = await service
        .from("user_roles").select("role").eq("user_id", operatorId).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "admin_only" }, 403);

      /* ⛔ THE DESTINATION IS THE SECRET, NOT THE REQUEST (2026-09-12). It first REQUIRED the caller
         to supply a matching phone, which turned out to be unusable for the one job this mode has:
         `supabase secrets list` returns SHA-256 DIGESTS, so nobody operating the function can read
         the number back to retype it — and retyping it was the only way to get a digit wrong.
         Taking the destination straight from WHATSAPP_TEST_NUMBER removes the typo surface
         entirely: there is no longer any input through which this mode can address anyone else.
         ⚠️ A supplied phone is kept as an OPTIONAL CONFIRMATION and must still match — a caller who
         names a number is told when it is the wrong one rather than having it quietly ignored. */
      const dest = toWhatsAppNumber(Deno.env.get("WHATSAPP_TEST_NUMBER") ?? "", "UK");
      if (!dest) return json({ ok: false, error: "test_number_not_configured" }, 400);
      if (to && to !== dest) return json({ ok: false, error: "phone_not_the_test_number" }, 403);

      if (!templateName) return json({ ok: false, error: "empty_message" }, 400);
      const entry = WA_TEMPLATES[templateName];
      if (!entry) return json({ ok: false, error: "unknown_template", detail: templateName }, 400);

      /* Literal values, straight from the caller. This mode deliberately resolves NOTHING from the
         database — supplying the variables by hand is what keeps it lead-free, and it also lets a
         specific trade/town be driven through the normaliser on purpose. */
      const v = (body.vars ?? {}) as Record<string, string>;
      let payload: Record<string, unknown>;
      try {
        payload = claimTemplatePayload(templateName, entry.lang, v.name ?? "", v.url ?? "", {
          trade: v.trade, town: v.town, auditUrl: v.audit_url,
          competitors: v.competitors, onboardingUrl: v.onboarding_url, contactName: v.contact_first_name,
        }) as Record<string, unknown>;
      } catch (e) {
        /* The trade/town guards throw here exactly as they do on the live path, so a test send is
           refused for the same reasons a real one would be — which is part of what it proves. */
        return json({ ok: false, error: "payload_refused", detail: (e as Error).message }, 400);
      }

      const env = resolveWhatsAppEnv();
      if (!env.live) {
        return json({ ok: false, error: "not_live", detail: "WHATSAPP_TEST_MODE is on, or the WhatsApp secrets are missing — nothing was sent." }, 400);
      }
      const r = await sendViaGraph(env.accessToken, env.phoneNumberId, dest, payload);
      console.log(`[send-whatsapp-message] test_send ${templateName} -> ${dest}: ${r.ok ? "ok " + r.messageId : "FAILED " + r.error}`);
      return json({
        ok: r.ok, mode: "test_send", template: templateName, to: dest,
        messageId: r.messageId, failCode: r.failCode ?? null, error: r.error,
        /* Echoed so the payload that was actually posted is inspectable without a redeploy. */
        payload,
      });
    }

    if (!text && !templateName) return json({ ok: false, error: "empty_message" }, 400);

    // --- Ownership check: the operator must own this conversation ---
    // Either they already have a message thread with this number, OR they own a lead
    // whose number normalises to it (new conversation started from a lead).
    let ownsConversation = false;
    let resolvedLeadId = leadId;
    let businessName = "";
    /* The lead's own town, for displayNameFor's IDENTIFY style — it drops a trailing town from
       the greeting name. `initial_contact` is the only identify template and it is sent from the
       plain branch below, which declares no town VARIABLE; this is the name rule's evidence, not
       a Meta parameter. Empty when the caller has no lead, and the strip then does not run. */
    let leadTown = "";

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
        .select("id, user_id, business_name, phone, country, is_archived, derived_town, search_location")
        .eq("id", resolvedLeadId)
        .maybeSingle();
      const l = lead as { user_id: string; business_name: string; phone: string; country: string | null; is_archived: boolean | null; derived_town: string | null; search_location: string | null } | null;
      if (l && l.user_id === operatorId && toWhatsAppNumber(l.phone, l.country) === to) {
        ownsConversation = true;
        businessName = l.business_name ?? "";
        leadTown = (l.derived_town ?? l.search_location ?? "").trim();
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
    /* ⛔ A PAYLOAD THAT CANNOT BE BUILT IS A REFUSAL, NEVER A 500 — and that distinction is the
       whole reason `audit_followup` cost two live prospects. Every DESIGNED refusal on this endpoint
       answers 200 with ok:false; the branch predicate sent it down a path whose resolver threw, and
       a throw here reached the outer catch as `internal` 500 with the reason in an edge log the CLI
       cannot read. The operator was shown "Edge Function returned a non-2xx status code" and had
       nothing to act on.
       ⚠️ The individual branches still catch their own `unsafe_template_var:` throws and return the
       specific, already-tested shape — this is the net UNDER them, so a branch that forgets (or a
       throw that carries no prefix, like the empty audit_url / onboarding_url guards) degrades to a
       readable hold instead of a 500. Two layers, one rule. */
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
      /* ⚠️ `let` for ONE reason: a template that names three competitors and cannot get three falls
         back to video_template (rivalHookDecision, in the audit branch below). One-way, nothing
         else reassigns them. */
      let tvars = WA_TEMPLATES[templateName].vars;
      let lang = WA_TEMPLATES[templateName].lang;
      /* Refuse before building anything: this template greets by name, so a blank name would send
         "Hi your business, Paul here" - visibly automated in the one message meant to sound human. */
      if (TEMPLATES_NEEDING_REAL_NAME.has(templateName) && !businessName.trim()) {
        return json({ ok: false, error: "no_business_name" }, 200);
      }
      /* ⛔ ONE RULE, SHARED WITH THE QUEUE — src/lib/templateRouting.ts. This was
         `tvars.includes("trade") || tvars.includes("competitors")` here AND, identically, in
         process-whatsapp-queue, and both were wrong the same way: audit_followup and
         competitor_hook declare `trade_plural`, `rival_*` and `audit_url` and NOT `trade`, so they
         answered NO, fell to the plain opener branch with no audit resolved, and threw where no
         catch exists — a 500 in front of the operator with the reason in an unreadable edge log.
         The predicate named the variables of the day instead of the property that decides. */
      const needsAudit = buildsFromAudit(tvars);
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
        /* ⛔ A TEMPLATE THAT NAMES A TOWN MUST NOT SEND A BLANK ONE, AND THIS IS THE SAME CLASS OF
           FAULT AS AN EMPTY LINK. `templateBodyParams`' town case returns "" for a blank rather than
           throwing — a deliberate carve-out for free_check_result, whose sentence still reads
           without it — but an EMPTY Meta parameter is rejected outright (#132000-class) and takes
           the whole send with it. That is how video_template failed for its entire life.
           ⚠️ REFUSED HERE, NOT IN THE RESOLVER, so onboarding_followup is untouched: it declares no
           town, and 58 leads have none — refusing in the shared resolver would have quietly made a
           LIVE template stricter to serve a new one. Measured 2026-09-15: the town-less leads are a
           SUBSET of the trade-less ones the resolver already refuses, so this costs nothing.
           ⚠️ AND IT IS A PROPERTY TEST, never a template name — a future town-bearing template on
           this branch is covered the day it is registered. */
        if (tvars.includes("town") && !f.town) {
          return json({ ok: false, error: "followup_unavailable", reason: "That lead has no town stored, and this template names one — add the town on the lead and try again." }, 200);
        }
        if (tvars.includes("trade_plural") && !f.trade) {
          return json({ ok: false, error: "followup_unavailable", reason: "That lead has no trade stored, and this template names one." }, 200);
        }
        payload = claimTemplatePayload(templateName, lang, f.business, "", { onboardingUrl: f.url, trade: f.trade, town: f.town });
        storedBody = renderTemplateBody(templateName, f.business, f.url, f.trade, undefined, undefined, f.town);
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
        let a = await resolveAuditReplyVars(service, resolvedLeadId);
        /* ⛔ TRIGGER THE CLEANER AND SEND WHEN READY — DON'T REFUSE (Paul, 2026-09-16). The common
           refusal here is "the cleaner hasn't run": extract-competitors ran at finalisation but gpt-4o
           returned a malformed batch, so it stamped complete:false and left no competitors. Refusing
           left the lead sitting until the operator remembered to come back. Instead: re-invoke the
           cleaner for the lead's newest completed run (a fresh model call clears the flaky omission
           nearly always), await it, and re-resolve. If it still can't, THEN refuse. */
        if (!a.ok && /cleaner hasn.?t run|haven.?t been extracted/i.test(a.reason)) {
          const { data: auds } = await service.from("ai_audits").select("id").eq("lead_id", resolvedLeadId);
          const auditIds = ((auds ?? []) as Array<{ id: string }>).map((x) => x.id);
          let runId: string | null = null;
          if (auditIds.length) {
            const { data: run } = await service.from("ai_audit_runs").select("id")
              .in("audit_id", auditIds).eq("status", "complete")
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            runId = (run as { id?: string } | null)?.id ?? null;
          }
          if (runId) {
            try {
              const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-competitors`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "", "x-internal-job": "1" },
                body: JSON.stringify({ runId }),
              });
              if (!res.ok) console.error(`[send-whatsapp-message] on-send cleaner invoke HTTP ${res.status} for run ${runId}`);
            } catch (e) {
              console.error(`[send-whatsapp-message] on-send cleaner invoke error for run ${runId}:`, (e as Error).message);
            }
            a = await resolveAuditReplyVars(service, resolvedLeadId);   // re-resolve after the fresh clean
          }
        }
        if (!a.ok) return json({ ok: false, error: "audit_reply_unavailable", reason: a.reason }, 200);
        /* ⛔ THREE NAMES OR A DIFFERENT MESSAGE (src/lib/rivalHook.ts). Same decision as the drip,
           from the same leaf, so the two paths cannot fall back to different templates.
           ⚠️ THE OPERATOR IS TOLD, because on this path a person pressed send and is owed the truth
           about what went out: `fell_back` comes back with the send and the UI shows it. A silent
           substitution here would be the worse half of both options — they would believe the
           competitor message went and never check.
           ⚠️ `allowResend`'s pitchEverSent check above was keyed to the REQUESTED template and stays
           that way: it asks "have we already sent THIS message to this lead", and the answer about
           competitor_hook does not change because today's attempt fell back. The fallback's own
           once-per-lead protection is the cold-outreach machinery it already lives under. */
        const rivalCall = rivalHookDecision(templateName, templateNeedsRivals(tvars), a.rivals.length);
        /* ⛔ A CONTINUATION HOLDS — NOTHING IS SUBSTITUTED AND NOTHING IS SENT (2026-09-16).
           ⚠️ AND THIS IS A BUG FIX, NOT A NEW RULE. The phone-history seatbelt above runs ONCE, on
           the REQUESTED name, before any branch. The substitution happens HERE, after it. So a
           continuation (audit_followup, audit_followup_call) passed the seatbelt and then sent
           video_template — a COLD opener, "is this the right number", into a conversation the
           prospect had already replied to, with the one guard written for that exact mistake
           already behind it. Measured shape: 6 of 147 recent audits supply fewer than three names.
           Re-running the seatbelt after the swap would not fix it either — it would refuse with
           "phone_already_contacted" for a template the operator never chose. The honest answer is
           to send nothing and say why, which is what src/lib/rivalHook.ts now decides. */
        if (rivalCall.held) {
          console.warn(`[send-whatsapp-message] HELD ${resolvedLeadId} (${templateName}): ${rivalCall.reason}`);
          return json({ ok: false, error: "rivals_unavailable", reason: rivalCall.reason, template: templateName }, 200);
        }
        if (rivalCall.fellBack) {
          console.warn(`[send-whatsapp-message] ${resolvedLeadId}: ${rivalCall.reason}`);
          templateName = rivalCall.template;
          tvars = WA_TEMPLATES[templateName].vars;
          lang = WA_TEMPLATES[templateName].lang;
          fellBackReason = rivalCall.reason;
        }
        /* ⛔ BUILT FROM THE TEMPLATE'S DECLARED VARS - see the identical note in
           process-whatsapp-queue. `needsAudit` is `trade || competitors`, so audit_result_hook
           enters here as well, and a fixed `{ trade, competitors }` would leave its `town` and
           `audit_url` empty (templateBodyParams throws on the latter). */
        const auditExtra: Record<string, string | string[]> = { trade: a.trade };
        if (tvars.includes("competitors")) auditExtra.competitors = a.competitors;
        if (templateNeedsRivals(tvars)) auditExtra.rivals = a.rivals;
        if (tvars.includes("town")) auditExtra.town = a.town;
        if (tvars.includes("audit_url")) auditExtra.auditUrl = a.link;
        /* audit_followup_fault's {{6}}: the site's main crawl fault, resolved beside the rivals. An
           empty value makes templateBodyParams throw unsafe_template_var (Meta rejects a blank
           parameter), which the catch below returns as a visible hold — the fail-closed gate for a
           lead with no fault. The picker keeps this template off a clean-site lead in the first
           place. */
        if (tvars.includes("site_fault")) auditExtra.siteFault = a.siteFault ?? "";
        /* ⛔ THE SAME TRADE/TOWN HOLD AS THE QUEUE (2026-09-12), and it matters MORE here because
           this is the manual path: the operator pressed send and is owed an answer. A plural trade
           or a town like "Bourne uk" would render "for a Locksmiths in Bourne uk" to a prospect, so
           templateBodyParams throws and this returns the reason to the UI instead of sending.
           ⚠️ 200 with ok:false, matching every other refusal on this endpoint — the operator sees
           why, and nothing is written to whatsapp_messages as though it went out. */
        try {
          payload = claimTemplatePayload(templateName, lang, a.business, a.link, auditExtra);
        } catch (e) {
          const msg = (e as Error).message ?? "";
          if (msg.startsWith("unsafe_template_var:")) {
            const [, reason, detail] = msg.split(":");
            console.warn(`[send-whatsapp-message] HELD ${resolvedLeadId} (${templateName}): ${msg}`);
            return json({ ok: false, error: "unsafe_template_var", reason, detail: detail ?? "" }, 200);
          }
          throw e;
        }
        auditBusinessName = a.business;
        auditClaimUrl = a.link;
        storedBody = renderTemplateBody(templateName, a.business, a.link, a.trade, a.competitors, undefined, a.town, a.siteFault ?? undefined);
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
        payload = claimTemplatePayload(templateName, lang, businessName, claimUrl, { town: leadTown });
        storedBody = renderTemplateBody(templateName, businessName, claimUrl, undefined, undefined, undefined, leadTown);
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

    /* ⛔ THE DRY RUN STOPS HERE — after every guard and the real payload build, before anything
       leaves the building. Nothing below this line has run. */
    if (dryRun) {
      return json({
        ok: true,
        mode: "dry_run",
        sent: false,
        template: usedTemplate,
        message_type: messageType,
        live: env.live,
        window_open: windowOpen,
        to,
        lead_id: resolvedLeadId,
        /* The exact object that would be POSTed to Meta, so a wrong parameter ORDER or a missing
           header component is visible without a send (the fault `test_send` was built to expose). */
        payload,
        /* What the Inbox would store as the transcript — what the prospect reads. */
        body: storedBody,
        ...(messageType === "template" && usedTemplate ? { template_snapshot: createTemplateSnapshot({ templateName: usedTemplate, language: WA_TEMPLATES[usedTemplate].lang, body: storedBody, payload }) } : {}),
        ...(fellBackReason ? { fell_back: fellBackReason } : {}),
      });
    }

    phase = "send";
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
      ...(messageType === "template" && usedTemplate ? { template_snapshot: createTemplateSnapshot({ templateName: usedTemplate, language: WA_TEMPLATES[usedTemplate].lang, body: storedBody, payload }) } : {}),
    }).select("*").maybeSingle();
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

    // A successful LIVE send of a PITCH-CLASS template (a template built from the lead's own audit)
    // moves the lead to report_sent. Forward-only (mirrors the webhook's pattern): never overwrites
    // the interested/paid-class statuses. Free-form texts and openers don't move the pipeline here.
    /* ⚠️ `trade_plural` HAD TO JOIN THIS TEST, and missing it would have been invisible.
       competitor_hook declares `trade_plural` rather than `trade`, so a lead sent their report by
       the new hook would have stayed at its old status while the same lead sent video_template moved
       to report_sent — two templates delivering the same report, disagreeing about whether it had
       been delivered. The class is "was this built from the lead's audit", and the variable names
       are how a template says so. */
    if (env.live && status === "sent" && resolvedLeadId) {
      const tvars = usedTemplate ? (WA_TEMPLATES[usedTemplate]?.vars ?? []) : [];
      const isReportSend = tvars.includes("trade") || tvars.includes("trade_plural") || tvars.includes("competitors");
      if (isReportSend) {
        try {
          await service.from("outreach_leads")
            .update({ status: "report_sent" })
            .eq("id", resolvedLeadId)
            .not("status", "in", "(interested,price_given,payment_received,in_delivery,completed)");
        } catch (e) {
          console.error(`[send-whatsapp-message] report_sent status write failed for lead ${resolvedLeadId}:`, (e as Error).message);
        }
      } else {
        /* ⛔ ANY OTHER SEND TO A REPLIED LEAD → 'awaiting_reply' ("You replied"), so the operator's
           Replied list holds only leads that still need them (Paul, 2026-09-16). This covers the
           templates that are NOT report deliverers (book_call, audit_followup_call, onboarding_followup,
           re_engage_49, …) and a FREE-FORM typed reply (usedTemplate null) — the case that used to
           leave a lead stuck on Replied after the operator had already answered.
           ⛔ SCOPED .eq(status=replied) ON PURPOSE: it moves ONLY a lead currently on the Replied
           list, so it can never overwrite a later pipeline status (report_sent, interested, price_given,
           paid, in_delivery, completed) or a lead the operator has not actually just answered. Report
           sends keep 'report_sent' above; both leave the Replied list, and the two stay distinct.
           ⚠️ whatsapp_template + whatsapp_sent_at record WHAT was sent and WHEN, for the status hover
           (awaitingReplyTooltip). A free-form reply stores a null template → the hover reads
           "You replied · <when>". These columns are the lead's "last sent" markers (the queue writes
           them too; WhatsAppLeadControls already displays them), and an awaiting_reply lead is never in
           the queue, so overwriting them here starts no automated send.
           ⛔ THE AUDIT IS UNAFFECTED. A prospect's reply flips this back to 'replied' in
           whatsapp-inbound and runs the reply trigger, which is gated by the once-per-lead
           whatsapp_auto_replies slot (claimed on their FIRST reply) and the completed-audit check —
           neither of which this status touches. So no reply-to-an-inbox-message can start a 2nd audit. */
        try {
          await service.from("outreach_leads")
            .update({ status: "awaiting_reply", whatsapp_template: usedTemplate ?? null, whatsapp_sent_at: new Date().toISOString() })
            .eq("id", resolvedLeadId)
            .eq("status", "replied");
        } catch (e) {
          console.error(`[send-whatsapp-message] awaiting_reply status write failed for lead ${resolvedLeadId}:`, (e as Error).message);
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
      /* Present ONLY after a substitution. The operator pressed send on one template and a different
         one went out; saying nothing would leave them believing the competitor message had gone. */
      ...(fellBackReason ? { template: usedTemplate, fell_back: fellBackReason } : {}),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    /* ⛔ THE REASON IS WRITTEN DOWN, NOT ONLY LOGGED. The CLI has no `functions logs` subcommand
       (§4), so until now every crash on this endpoint was undiagnosable after the fact — which is
       why three separate faults on one button each cost a live prospect to find. Best-effort and
       wrapped: a failure to record must never change what the caller is told. */
    try {
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (url && key) {
        await createClient(url, key, { auth: { persistSession: false } })
          .from("client_error_reports")
          /* ⛔ `error_id` + `context` ONLY, AND THAT IS NOT A STYLE CHOICE: `client_error_reports`
             HAS NO `message` COLUMN. Ten call sites across the edge functions insert one, so every
             one of those rows has been silently rejected — the diagnostic layer this codebase built
             precisely because the CLI cannot read logs (§4) is, for those writers, writing nothing.
             Checked against the live table, not inherited from a neighbouring file. */
          .insert({
            error_id: `send_whatsapp_threw_during_${phase}`,
            context: { message: msg.slice(0, 2000), phase, at: new Date().toISOString(), build: BUILD_ID },
          });
      }
    } catch { /* recording is never allowed to matter */ }
    /* ⛔ A BUILD FAILURE IS A HOLD WITH ITS REASON, NOT AN OPAQUE 500. See the note at `phase`.
       `phase` is still "build" only if nothing has been sent and nothing has been written, so this
       cannot turn a half-completed send into a cheerful refusal. */
    if (phase === "build") {
      console.warn(`[send-whatsapp-message] HELD before send: ${msg}`);
      if (msg.startsWith("unsafe_template_var:")) {
        const [, reason, detail] = msg.split(":");
        return json({ ok: false, error: "unsafe_template_var", reason, detail: detail ?? "" }, 200);
      }
      return json({ ok: false, error: "template_not_buildable", reason: msg }, 200);
    }
    console.error("[send-whatsapp-message] error:", msg);
    return json({ ok: false, error: "internal" }, 500);
  }
});

/* ⛔ WHY THERE IS NO SECOND WRAPPER AROUND THIS. The catch above now references only `e`, `phase`
   (hoisted above the try) and module-level names, so it has nothing left that can throw a
   ReferenceError — and the test asserts that property rather than trusting this comment. A
   belt-and-braces outer try would hide the next instance of the same mistake instead of failing the
   build on it, which is the trade this codebase has repeatedly got wrong in the other direction. */
