// send-whatsapp-media — ONE image, video or document to ONE lead, inside the 24-hour customer-service
// window only (2026-09-27). Used by the Inbox and by the salesperson's lead page.
//
// The rules and their order live in _shared/media-attachment-send.ts (tested with fakes in
// scripts/whatsapp-media-send.test.ts); this file only wires them to Supabase and Meta.
//
// ⛔ SEPARATE FROM send-whatsapp-voice AND send-whatsapp-message ON PURPOSE: neither of their paths
// changes. Nothing here sends a template, free text or a voice note.
// ⛔ THE BROWSER NEVER WRITES TO STORAGE. It posts the file here; this function checks who is sending
// to which lead, then stores the one copy (service role, the book owner's folder, the same bucket
// and path scheme as a voice note) and uploads it to Meta. Meta credentials never leave the server.
// ⛔ `mode=dry_run` runs every check (who, which lead, window, type, size, bytes) and stops before
// anything is stored or sent — the production test path.
// Auth: the caller's own JWT (resolveActor). admin: the book's leads, as the voice note. sales: the
// lead must be assigned to them and not a client (leadAccess) — checked here, on every request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { resolveWhatsAppEnv, toWhatsAppNumber, sendViaGraph } from "../_shared/whatsapp-send.ts";
import { uploadMediaToGraph } from "../_shared/whatsapp-media-upload.ts";
import { sendMediaAttachment } from "../_shared/media-attachment-send.ts";
import { ATTACHMENT_MAX_UPLOAD_BYTES } from "../../../src/lib/mediaAttachment.ts";

/* The deploy marker, on the OPTIONS preflight: readable with no credential, carries no secret. */
const BUILD_ID = "2026-09-27a-media";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-swmd-build",
  "x-swmd-build": BUILD_ID,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* Multipart overhead allowance above the file cap, for the boundary and the small fields. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json({ ...refusalBody(who), reason: who.detail }, who.status);
    const actor = who.actor;

    /* Refuse an oversized body BEFORE reading it into memory. */
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > ATTACHMENT_MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES) {
      return json({ ok: false, error: "too_large" }, 413);
    }
    const form = await req.formData().catch(() => null);
    if (!form) return json({ ok: false, error: "bad_request" }, 400);
    const str = (k: string) => { const v = form.get(k); return typeof v === "string" ? v.trim() : ""; };
    const raw = form.get("file");
    const file = raw && typeof raw !== "string" ? raw : null;

    /* ⛔ WHOSE BOOK, WHO PRESSED SEND — the voice note's rule. admin: unchanged. sales: must name a
       lead assigned to them (not a client); the thread is the lead's book, the person goes in
       sent_by_user_id and whatsapp_sends.user_id. A lead reassigned since the page loaded is
       refused here, whatever the browser still shows. */
    let operatorId = actor.id;
    if (actor.role !== "admin") {
      const salesLeadId = str("lead_id");
      if (!salesLeadId) return json({ ok: false, error: "lead_required" }, 400);
      const access = await leadAccess(service, actor, salesLeadId);
      if (!access.ok) return json({ ok: false, error: access.error === "lookup_failed" ? "upstream_timeout" : "forbidden" }, access.error === "lookup_failed" ? 503 : 403);
      operatorId = access.bookUserId;
      /* ⛔ A SUSPENDED SALESPERSON SENDS NOTHING (2026-09-29, docs/abuse-cost-protection.md). */
      const guard = await guardAction(service, actor.id, "whatsapp_send", { fn: "send-whatsapp-media", leadId: salesLeadId, role: actor.role });
      if (!guard.ok) return json(guard.body, guard.status);
    }

    const env = resolveWhatsAppEnv();
    const result = await sendMediaAttachment({
      operatorId,
      leadId: str("lead_id") || null,
      phone: str("phone"),
      sendId: str("send_id"),
      filename: file?.name || str("filename"),
      caption: str("caption"),
      declaredBytes: file?.size ?? 0,
      /* Read only if the declared size is under the cap; the module re-checks the real length. */
      bytes: file && file.size <= ATTACHMENT_MAX_UPLOAD_BYTES ? new Uint8Array(await file.arrayBuffer()) : null,
      dryRun: str("mode") === "dry_run",
    }, {
      now: () => Date.now(),
      live: env.live,
      testMode: env.testMode,
      normalise: toWhatsAppNumber,
      async getLead(id) {
        const { data } = await service.from("outreach_leads").select("id, user_id, phone, country, is_archived").eq("id", id).maybeSingle();
        return (data as { id: string; user_id: string; phone: string | null; country: string | null; is_archived: boolean | null } | null) ?? null;
      },
      async lastInboundAt(uid, to) {
        /* Same read as send-whatsapp-voice's window: the book's inbound rows for this number. */
        const { data } = await service.from("whatsapp_messages").select("created_at")
          .eq("user_id", uid).eq("phone", to).eq("direction", "inbound")
          .order("created_at", { ascending: false }).limit(1);
        return (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
      },
      async claimStorage(path, bytes, mime) {
        const { error } = await service.storage.from("whatsapp-media").upload(path, bytes, { contentType: mime, upsert: false });
        if (!error) return { ok: true };
        const msg = String((error as { message?: string }).message ?? "");
        const code = String((error as { statusCode?: string | number }).statusCode ?? "");
        return { ok: false, exists: /exist|duplicate/i.test(msg) || code === "409", error: msg };
      },
      async releaseStorage(path) {
        await service.storage.from("whatsapp-media").remove([path]);
      },
      uploadMedia: (bytes, mime, filename) => uploadMediaToGraph(env.accessToken, env.phoneNumberId, bytes, mime, filename),
      async sendMedia(to, payload) {
        const r = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);
        if (r.ok && r.messageId) return { ok: true, messageId: r.messageId };
        return { ok: false, definitive: typeof r.failCode === "number", error: r.error ?? "send failed" };
      },
      async insertMessage(row) {
        const { data, error } = await service.from("whatsapp_messages").insert({ ...row, sent_by_user_id: actor.id }).select("*").maybeSingle();
        if (error) console.error("[send-whatsapp-media] message insert failed:", error.message);
        return (data as Record<string, unknown> | null) ?? null;
      },
      async insertSendLog(row) {
        const { error } = await service.from("whatsapp_sends").insert({ ...row, user_id: actor.id });
        if (error) console.error("[send-whatsapp-media] send-audit insert failed (non-blocking):", error.message);
      },
      async markAnswered(leadId) {
        await service.from("outreach_leads")
          .update({ status: "awaiting_reply", whatsapp_template: null, whatsapp_sent_at: new Date().toISOString() })
          .eq("id", leadId).eq("status", "replied");
      },
    });
    return json(result.body, result.status);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.error("[send-whatsapp-media] error:", msg);
    try {
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (url && key) {
        /* error_id + context only: client_error_reports has no `message` column (CLAUDE.md §8). */
        await createClient(url, key, { auth: { persistSession: false } }).from("client_error_reports")
          .insert({ error_id: "send_whatsapp_media_threw", context: { message: msg.slice(0, 2000), at: new Date().toISOString(), build: BUILD_ID } });
      }
    } catch { /* recording is never allowed to matter */ }
    return json({ ok: false, error: "internal", reason: "The file could not be processed. Nothing was confirmed as sent — check the thread before trying again." }, 500);
  }
});
