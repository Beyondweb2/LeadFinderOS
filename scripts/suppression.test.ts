/* ============================================================
   SUPPRESSION — "one no anywhere means suppressed everywhere, forever".

   ⛔ WHAT THIS REPLACED, measured 2026-08-08. 142 leads had said no (31 not_interested, 1
   opted_out, 1 closed, 4 suppressed phones, 114 archived). Against that population:
     process-whatsapp-queue   reached 0 of 142   — protected
     bulk-jobs audit batch    reached 142 of 142 — no filter of any kind
     instantly-push           reached 1 of 142   — and ONLY because 141 had no email address.
                                                   79 of those 141 have a website, so the Find
                                                   emails crawl would have supplied one.
   The rule existed three times inline (WhatsApp queue, SMS queue, auto-reply-rules) and not at all
   in the two paths that could spend money or send email. Two copies of a suppression rule is how
   somebody gets emailed.
   ============================================================ */
import { toE164, normEmail, checkSuppressed, isSuppressed, suppress } from "../supabase/functions/_shared/suppression.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** A fake PostgREST chain: .from().select().eq().limit().maybeSingle() and .upsert(). */
function fakeDb(rows: Array<{ phone_e164?: string | null; email?: string | null; lead_id?: string | null; reason?: string }>, opts: { throwOn?: boolean } = {}) {
  const writes: unknown[] = [];
  const api = {
    writes,
    from() {
      let col = "", val: unknown = null;
      const chain = {
        select() { return chain; },
        eq(c: string, v: unknown) { col = c; val = v; return chain; },
        limit() { return chain; },
        maybeSingle() {
          if (opts.throwOn) throw new Error("connection reset");
          const hit = rows.find((r) => (r as Record<string, unknown>)[col] === val);
          return Promise.resolve({ data: hit ?? null });
        },
        upsert(row: unknown) { writes.push(row); return Promise.resolve({ error: null }); },
      };
      return chain;
    },
  };
  return api;
}

console.log("── NORMALISATION: leads store bare digits, the table stores +E.164 ──");
ok(toE164("447761888753") === "+447761888753", "bare digits gain a +");
ok(toE164("+44 7761 888753") === "+447761888753", "spaces and an existing + normalise to the same value");
ok(toE164("") === null && toE164(null) === null, "empty is null, not '+'");
ok(normEmail("  Paul@Move37.FUN ") === "paul@move37.fun", "emails lowercase and trim");
ok(normEmail("") === null, "empty email is null");

console.log("\n── ⛔ A NO ON ANY IDENTIFIER SUPPRESSES ──");
const db = fakeDb([
  { phone_e164: "+447881712511", reason: "replied_no" },
  { email: "no@thanks.co.uk", reason: "replied_no" },
  { lead_id: "aaaaaaaa-0000-0000-0000-000000000001", reason: "archived" },
]);
ok((await checkSuppressed(db, { phone: "447881712511" })).suppressed, "matched on PHONE (bare digits, normalised)");
ok((await checkSuppressed(db, { email: "NO@Thanks.co.uk" })).suppressed, "matched on EMAIL (case-insensitively)");
ok((await checkSuppressed(db, { leadId: "aaaaaaaa-0000-0000-0000-000000000001" })).suppressed, "matched on LEAD ID — the archived case, no phone or email needed");
/* THE CROSS-CHANNEL CLAIM ITSELF: a no given by phone blocks an email send for the same person. */
const viaPhone = await checkSuppressed(db, { phone: "447881712511", email: "someone@example.com" });
ok(viaPhone.suppressed && viaPhone.matchedOn === "phone",
  "A PHONE NO BLOCKS AN EMAIL SEND — one no anywhere, suppressed everywhere");

console.log("\n── AND A CLEAN CONTACT IS NOT BLOCKED ──");
ok(!(await isSuppressed(db, { phone: "447000000000", email: "fine@example.com", leadId: "bbbbbbbb-0000-0000-0000-000000000002" })),
  "no identifier matches -> not suppressed");
ok(!(await isSuppressed(db, {})), "no identifiers at all -> nothing to match, not suppressed");

console.log("\n── ⛔ IT FAILS CLOSED, UNLIKE EVERY OTHER GUARD HERE ──");
/* serveGate flags rather than blocks; offTradeMark marks nothing on a missing type; the search gate
   passes an unknown pool count. This one inverts that on purpose: a failed lookup is not evidence
   that someone may be contacted, and the three inline copies it replaced all returned false. */
const broken = fakeDb([], { throwOn: true });
const hit = await checkSuppressed(broken, { phone: "447761888753" });
ok(hit.suppressed, "a THROWN lookup returns SUPPRESSED (the old inline copies returned 'not suppressed')");
ok(hit.matchedOn === "lookup_failed", "  and says why, so a refusal is never mistaken for a real no");

console.log("\n── WRITING A NO ──");
const w = fakeDb([]);
await suppress(w, { phone: "447900123456", leadId: "cccccccc-0000-0000-0000-000000000003", email: null },
  { reason: "replied_no", source: "whatsapp_decline" });
const row = w.writes[0] as Record<string, unknown>;
ok(w.writes.length === 1, "one row written");
ok(row.phone_e164 === "+447900123456", "  phone normalised on write");
ok(row.lead_id === "cccccccc-0000-0000-0000-000000000003",
  "  THE LEAD ID RIDES ALONG — which is what makes a WhatsApp no cover the email channel for a lead whose address we have not crawled yet");
ok(row.reason === "replied_no" && row.source === "whatsapp_decline", "  reason and source recorded");
ok(!(await suppress(w, {}, { reason: "x", source: "y" })), "suppressing nobody writes nothing");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
