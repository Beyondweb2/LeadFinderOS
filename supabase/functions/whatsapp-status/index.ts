import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leadFailurePatch } from "../_shared/whatsapp-failure.ts";
import { handleInboundMessages } from "../_shared/whatsapp-inbound.ts";

// whatsapp-status — Meta WhatsApp delivery STATUS webhook.
//
// Meta reports message status (sent → delivered → read, or failed) asynchronously
// here, NOT in the synchronous send response. This is where a genuine
// "not-on-WhatsApp" (error 131026) actually surfaces. It matches the callback to a
// lead by whatsapp_message_id and applies the SAME failure routing as the queue
// processor (shared _shared/whatsapp-failure.ts), and records delivered/read so the
// operator can see what actually landed.
//
// GET  = Meta's subscription handshake (hub.verify_token must match the secret).
// POST = status events AND inbound barber replies — Cloud API has ONE callback URL,
//        so both arrive here under the same `messages` field: value.statuses[] for
//        delivery receipts, value.messages[] for inbound. Statuses are handled below;
//        inbound is delegated to handleInboundMessages (_shared/whatsapp-inbound.ts).
//        Verified with the app-secret X-Hub-Signature-256 when set (one gate covers both).
// verify_jwt = false (this is a public webhook; auth is the verify token + signature).

const VERIFY_TOKEN_SECRET = "WHATSAPP_WEBHOOK_VERIFY_TOKEN";
const APP_SECRET_SECRET = "WHATSAPP_APP_SECRET";

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(hex, provided);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- GET: Meta verification handshake ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get(VERIFY_TOKEN_SECRET) ?? "";
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  try {
    const rawBody = await req.text();

    // Signature check (when the app secret is configured). If it's NOT set we accept
    // but warn — set WHATSAPP_APP_SECRET to authenticate Meta's callbacks.
    const appSecret = Deno.env.get(APP_SECRET_SECRET) ?? "";
    if (appSecret) {
      const ok = await validSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
      if (!ok) {
        console.error("[whatsapp-status] bad signature — rejecting");
        return new Response("invalid signature", { status: 401 });
      }
    } else {
      console.warn("[whatsapp-status] WHATSAPP_APP_SECRET not set — skipping signature check");
    }

    const body = JSON.parse(rawBody || "{}");
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const nowIso = new Date().toISOString();

    // entry[].changes[].value — value.statuses[] (delivery) OR value.messages[] (inbound)
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let handled = 0;
    for (const entry of entries) {
      for (const change of (entry?.changes ?? [])) {
        // Inbound barber replies → write into whatsapp_messages (own error handling).
        if (Array.isArray(change?.value?.messages) && change.value.messages.length) {
          try {
            handled += await handleInboundMessages(service, change.value);
          } catch (e) {
            console.error("[whatsapp-status] inbound handling error:", (e as Error).message);
          }
        }

        const statuses = change?.value?.statuses ?? [];
        for (const st of statuses) {
          const wamid: string = st?.id ?? "";
          const status: string = st?.status ?? ""; // sent | delivered | read | failed
          if (!wamid || !status) continue;
          try {
            // Mirror the status onto the audit row regardless of lead match.
            await service.from("whatsapp_sends").update({ delivery_status: status }).eq("message_id", wamid);

            const { data: lead } = await service
              .from("outreach_leads")
              .select("id, whatsapp_attempts, whatsapp_delivery_status, whatsapp_ever_delivered")
              .eq("whatsapp_message_id", wamid)
              .maybeSingle();
            if (!lead) continue;

            if (status === "failed") {
              const code = typeof st?.errors?.[0]?.code === "number" ? st.errors[0].code : undefined;
              // ONE-WAY RATCHET: a lead already delivered/read is proven-reachable — a
              // late / out-of-order 'failed' for the same message must NOT overwrite it.
              const already = lead.whatsapp_delivery_status;
              if (already === "delivered" || already === "read") {
                console.log(`[whatsapp-status] ignoring late 'failed' (code ${code ?? "?"}) — already ${already} for lead ${lead.id}`);
              } else {
                // Prior success = ever delivered/read, OR the lead's site was opened
                // (durable proof the link was received; survives a re-send that resets
                // whatsapp_delivery_status). One lookup by lead_id.
                let hasPriorSuccess = lead.whatsapp_ever_delivered === true;
                if (!hasPriorSuccess) {
                  const { data: openedSite } = await service
                    .from("generated_sites")
                    .select("id")
                    .eq("lead_id", lead.id)
                    .not("first_opened_at", "is", null)
                    .limit(1)
                    .maybeSingle();
                  hasPriorSuccess = !!openedSite;
                }
                await service.from("outreach_leads")
                  .update(leadFailurePatch(code, (lead.whatsapp_attempts as number) ?? 0, nowIso, hasPriorSuccess))
                  .eq("id", lead.id);
                console.log(`[whatsapp-status] failed (code ${code ?? "?"}) for lead ${lead.id} — hasPriorSuccess=${hasPriorSuccess}`);
              }
            } else if (status === "delivered" || status === "read") {
              // Real delivery confirmation — record it; keep the lead Contacted. Also
              // set the durable whatsapp_ever_delivered flag (set-once true; never
              // unset) so a later follow-up failure can't wrongly flip the lead.
              await service.from("outreach_leads")
                .update({ whatsapp_delivery_status: status, whatsapp_ever_delivered: true })
                .eq("id", lead.id);
            }
            handled++;
          } catch (e) {
            console.error("[whatsapp-status] status handling error:", (e as Error).message);
          }
        }
      }
    }

    // Always 200 quickly so Meta doesn't retry / disable the webhook.
    return new Response(JSON.stringify({ ok: true, handled }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[whatsapp-status] error:", e);
    // Still 200 — a non-2xx makes Meta retry; we've logged it.
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
