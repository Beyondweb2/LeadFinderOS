/* ════════════════════════════════════════════════════════════════════════════════════════════════
   RESEND DELIVERY EVENTS — "accepted" is not "delivered", and until now that was the end of it.

   🔴 THE INCIDENT THIS EXISTS FOR, 2026-09-14. The first genuine cold free check — Power pulse, an
   electrician in Manchester — typed `admin@power-pulse.co.un`. `.un` is not a delegated TLD and the
   domain returns NXDOMAIN. Resend returned 2xx, we stamped `email_status: "accepted"` with a
   provider id, and every surface read green. The prospect received nothing. A $0.0965 audit, a
   correct report, and a URL nobody was ever told about.

   ⛔ "ACCEPTED" MEANT, AND STILL MEANS, ONLY THAT RESEND TOOK THE MESSAGE. Whether a mailbox got it
   lives in Resend's delivery events, which is to say it lived nowhere we could read. This closes
   that: the bounce comes back to us, lands on the same stamp, and reaches Paul by email.

   ⛔ IT FAILS CLOSED ON SIGNATURE, ALWAYS. An unverified request writes NOTHING and returns 401.
   This endpoint is public (verify_jwt = false — it must be, Resend has no Supabase JWT), so the
   signature is the ONLY thing standing between a stranger and our delivery record. Resend signs
   with Svix headers: svix-id, svix-timestamp, svix-signature, over `${id}.${timestamp}.${body}`,
   HMAC-SHA256, secret base64 after the `whsec_` prefix.
   ⚠️ THE TIMESTAMP IS CHECKED TOO. A valid signature replayed for ever is still a replay; Svix's
   own tolerance is five minutes and that is what is used.
   ⚠️ AND THE COMPARISON IS CONSTANT-TIME. A fast-exit compare leaks the signature a byte at a time.

   ⛔ IT MATCHES ON provider_message_id, NEVER ON THE ADDRESS. One address can be sent several
   different things; the provider id identifies THIS send. free-check-result already stores it on
   `ai_audits.free_check_result`, which is why that field was worth storing.
   ⚠️ NO MATCH IS NOT AN ERROR. Resend fires for every email this project sends — the operator
   notifications, the payment emails, the four-week results — and only the free-check result stamps
   an id today. An unmatched event is recorded and acknowledged, never 500'd: a non-2xx makes Resend
   retry for hours over something we simply did not need.

   ⛔ IT ALWAYS RETURNS 2xx ONCE THE SIGNATURE PASSES, even if our own write fails. Resend retries a
   non-2xx, and a retry storm caused by a broken column would be a second incident on top of the
   first. A failed write is reported to client_error_reports instead, which is readable; the CLI has
   no `functions logs` (CLAUDE.md §4) so console.error alone is a dead end.

   ⚠️ IT SENDS PAUL AN EMAIL ON A BOUNCE, AND ONLY ON A BOUNCE OR A COMPLAINT. `delivered` is the
   happy path and does not need his attention; it is recorded and nothing else. A complaint (marked
   as spam) does need it — that is a sender-reputation event, and reputation is the thing that would
   take the whole channel down.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifySvix } from "../_shared/svix-verify.ts";

const ADMIN_EMAIL = "paul@move37.fun";
const FROM_OPERATOR = "Findable <alerts@findable.live>";
/** Svix's own replay tolerance. */
const TOLERANCE_MS = 5 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "";
  /* ⛔ NO SECRET, NO PROCESSING. Treating an unset secret as "skip verification" is how a public
     endpoint becomes a write primitive for anyone who finds it. 401, not 500: nothing to retry. */
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set — refusing every event");
    return json({ ok: false, error: "not_configured" }, 401);
  }

  const body = await req.text();
  const id = req.headers.get("svix-id") ?? "";
  const ts = req.headers.get("svix-timestamp") ?? "";
  const sigHeader = req.headers.get("svix-signature") ?? "";
  if (!id || !ts || !sigHeader) return json({ ok: false, error: "unsigned" }, 401);

  const tsMs = Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) {
    return json({ ok: false, error: "stale_timestamp" }, 401);
  }
  if (!(await verifySvix(secret, id, ts, body, sigHeader))) {
    return json({ ok: false, error: "bad_signature" }, 401);
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(body); } catch { return json({ ok: true, ignored: "unparseable" }); }

  const type = String(event.type ?? "");
  const data = (event.data ?? {}) as Record<string, unknown>;
  const messageId = String(data.email_id ?? "");
  const to = Array.isArray(data.to) ? data.to.join(", ") : String(data.to ?? "");
  /* Resend's bounce detail lives under `bounce`; shape varies by provider, so it is recorded whole
     rather than picked apart into fields that may not exist. */
  const detail = data.bounce ?? data.reason ?? null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  /* ⚠️ THE STATUSES WE ACT ON ARE NAMED, POSITIVELY. An unrecognised event type is acknowledged and
     dropped rather than guessed at — Resend adds types, and a default branch that treated an unknown
     one as a bounce would email Paul about a delivery. */
  const DELIVERY_STATUS: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.delivery_delayed": "delayed",
  };
  const status = DELIVERY_STATUS[type];
  if (!status) return json({ ok: true, ignored: type || "no_type" });

  let matched = false;
  if (messageId) {
    /* One document per send: the audit whose stamp carries this provider id. */
    const { data: rows, error } = await service
      .from("ai_audits")
      .select("id, free_check_result")
      .eq("free_check_result->>provider_message_id", messageId)
      .limit(1);
    if (error) {
      await service.from("client_error_reports").insert({
        error_id: "resend_webhook_lookup_failed",
        message: `${type} for ${messageId}: ${error.message}`,
      }).then(() => {}, () => {});
    } else if (rows && rows.length) {
      matched = true;
      const audit = rows[0] as { id: string; free_check_result: Record<string, unknown> | null };
      const stamp = { ...(audit.free_check_result ?? {}) };
      /* ⛔ `email_status` IS NOT OVERWRITTEN — it records what the SEND returned and stays true.
         Delivery is a separate fact with a separate field, so "Resend took it" and "a mailbox got
         it" can never be confused for one another again. */
      stamp.delivery_status = status;
      stamp[`${status}_at`] = new Date().toISOString();
      if (detail) stamp.delivery_detail = detail;
      const { error: upErr } = await service.from("ai_audits").update({ free_check_result: stamp }).eq("id", audit.id);
      if (upErr) {
        await service.from("client_error_reports").insert({
          error_id: "resend_webhook_write_failed",
          message: `${type} for ${messageId} on audit ${audit.id}: ${upErr.message}`,
        }).then(() => {}, () => {});
      }
    }
  }

  /* A bounce or a complaint is recorded whether or not we could match it to a send — an unmatched
     bounce is still a bounce, and losing it because the id belonged to an email we do not stamp
     would recreate the blind spot this function exists to close. */
  if (status === "bounced" || status === "complained") {
    await service.from("client_error_reports").insert({
      error_id: status === "bounced" ? "email_bounced" : "email_complained",
      message: `${to || "(no recipient)"} — ${type}${matched ? "" : " (no matching send on file)"}${detail ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`,
    }).then(() => {}, () => {});

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const what = status === "bounced" ? "BOUNCED" : "MARKED AS SPAM";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_OPERATOR,
          to: [ADMIN_EMAIL],
          subject: `EMAIL ${what} — ${to || "unknown recipient"}`,
          text: [
            `An email we sent ${status === "bounced" ? "did not arrive" : "was marked as spam"}.`,
            ``,
            `To:        ${to || "(not given)"}`,
            `Event:     ${type}`,
            `Resend id: ${messageId || "(none)"}`,
            matched
              ? `This was a free-check result. The audit's own record has been updated, so the Free checks card will show it.`
              : `No send on file carries this id, so it was one of the emails that do not stamp one (operator notifications, payment, four-week results).`,
            detail ? `\nProvider detail:\n${JSON.stringify(detail, null, 2).slice(0, 1200)}` : ``,
            ``,
            status === "bounced"
              ? `A bounce usually means the address is wrong. Nothing is retried automatically — "accepted" never meant delivered, and now it does not have to.`
              : `A complaint is a sender-reputation event. Worth looking at before it affects the channel.`,
          ].join("\n"),
        }),
      }).catch((e) => console.error("[resend-webhook] operator alert failed:", e instanceof Error ? e.message : String(e)));
    }
  }

  /* ⛔ 2xx ONCE THE SIGNATURE PASSED, whatever happened downstream. A non-2xx makes Resend retry for
     hours, and a retry storm over a column we failed to write is a second incident on top of the
     first. What went wrong is in client_error_reports, which is readable. */
  return json({ ok: true, type, status, matched });
});
