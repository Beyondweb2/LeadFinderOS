/* ============================================================
   IS THIS A SEND? — the predicate every dashboard counting surface shares.

   ⛔ THE BUG THIS PINS (2026-08-19): whatsapp_messages rows with status 'failed' (Meta refused the
   send — the number is not on WhatsApp) and 'simulated' (old test mode) counted as "Reached" on the
   audit funnel, the channel card and every campaign card. 38 unarchived leads — 37 of them status
   no_whatsapp — inflated every denominator: the funnel read 52% reply rate when the truth was 56%.

   ⛔ AND IT MUST STAY A POSITIVE TEST. Written as `!== 'failed'`, a future 'pending' status, a null,
   or the next test mode would count as sent — the absent-value shape CLAUDE.md records repeatedly.
   The cases below drive every absent value explicitly.
   ============================================================ */
import { isRealSend } from "../src/lib/realSend.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE THREE REAL SEND STATES ──");
ok(isRealSend("sent"), "'sent' is a send");
ok(isRealSend("delivered"), "'delivered' is a send");
ok(isRealSend("read"), "'read' is a send");

console.log("\n── ⛔ THE POLLUTERS, MEASURED IN PRODUCTION ──");
ok(!isRealSend("failed"), "'failed' (Meta refused — e.g. not on WhatsApp) is NOT a send");
ok(!isRealSend("simulated"), "'simulated' (old test mode) is NOT a send");

console.log("\n── ⛔ ABSENT AND UNKNOWN VALUES NEVER COUNT ──");
ok(!isRealSend(null), "null is not a send");
ok(!isRealSend(undefined), "undefined is not a send");
ok(!isRealSend(""), "empty string is not a send");
ok(!isRealSend("pending"), "a future 'pending' does not slip in");
ok(!isRealSend("queued"), "a future 'queued' does not slip in");
ok(!isRealSend("received"), "'received' (an INBOUND status) is not an outbound send");
ok(!isRealSend("SENT"), "case matters — an unexpected casing is unknown, not a send");

console.log("\n── THE FOLD THE HOOKS APPLY: a failed-only lead is not Reached ──");
{
  /* The exact shape both hooks compute: outbound + template_name + isRealSend. */
  const msgs = [
    { direction: "outbound", template_name: "initial_contact", status: "failed" },
    { direction: "outbound", template_name: "initial_contact", status: "simulated" },
    { direction: "inbound", template_name: null, status: "received" },
  ];
  const out = msgs.filter((m) => m.direction === "outbound" && m.template_name && isRealSend(m.status));
  ok(out.length === 0, "a lead whose every send failed/simulated has NO real sends -> not Reached");
  const mixed = [...msgs, { direction: "outbound", template_name: "initial_contact", status: "sent" }];
  const out2 = mixed.filter((m) => m.direction === "outbound" && m.template_name && isRealSend(m.status));
  ok(out2.length === 1, "one real send among failures -> Reached exactly once");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
