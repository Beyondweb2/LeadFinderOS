/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FEEDBACK + WHAT'S NEW (Sales Experience release 5, docs/sales-experience.md §7). The live proof is
   supabase/tests/feedback.sql (rolled back: own / other / admin reads, no forged insert, only the admin
   moves a status, "Your suggestion was added" on fixed, nothing on reviewing).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
import { checkFeedback, feedbackEmail, FEEDBACK_KINDS, FEEDBACK_STATUSES, FEEDBACK_ERROR_TEXT } from "../src/lib/feedback.ts";
import { WHATS_NEW, whatsNewFor } from "../src/lib/whatsNew.ts";
import { canOpenRoute } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

console.log("\n── the form's rules ──");
ok(FEEDBACK_KINDS.map((k) => k.value).join() === "feature,bug,confusing,other", "Suggest feature / Report bug / Confusing / Other");
ok(FEEDBACK_STATUSES.map((k) => k.label).join() === "New,Reviewing,Planned,Fixed,Won't do", "New / Reviewing / Planned / Fixed / Won't do");
const good = checkFeedback({ kind: "bug", message: "  The button does nothing  ", context: { path: "/inbox", viewport: "390x844", token: "SECRET", leadPhone: "07700" } });
ok(good.ok && good.value.message === "The button does nothing", "a message is trimmed and accepted");
ok(good.ok && good.value.context.path === "/inbox" && !("token" in good.value.context) && !("leadPhone" in good.value.context), "context is a positive allowlist — a stray token or lead field never rides along");
ok(!checkFeedback({ kind: "rant", message: "hello there" }).ok && !checkFeedback({ kind: "bug", message: "hi" }).ok && !checkFeedback({ kind: "bug", message: "x".repeat(4001) }).ok, "bad kind / too short / too long refused");
ok(Object.keys(FEEDBACK_ERROR_TEXT).every((k) => FEEDBACK_ERROR_TEXT[k].length > 10), "every refusal has words");
const mail = feedbackEmail({ id: "abc", kind: "feature", message: "Add a thing", context: { path: "/focus" }, authorName: "Test", authorEmail: "t@example.invalid", role: "sales" });
ok(/Suggest a feature/.test(mail.subject) && /path: \/focus/.test(mail.text) && /Add a thing/.test(mail.text), "the admin's email carries the kind, the words and the context");

console.log("\n── saved first, then emailed ──");
const fn = read("supabase/functions/feedback-submit/index.ts");
const ins = fn.indexOf('from("feedback_items").insert('), send = fn.indexOf("api.resend.com");
ok(ins > 0 && send > ins, "the row is saved BEFORE the email is attempted");
ok(/email_status: emailStatus/.test(fn) && /return json\(\{ ok: true, id, emailed: emailStatus === "sent" \}\)/.test(fn), "the email's outcome is recorded and reported honestly");
ok(/MAX_PER_HOUR/.test(fn) && /status: 429|, 429\)/.test(fn), "a stuck button cannot flood the inbox");
ok(/\[functions\.feedback-submit\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml entry");
const mig = read("supabase/migrations/20260929150000_feedback.sql");
ok(/using \(user_id = \(select auth\.uid\(\)\) or \(select public\.my_role\(\)\) = 'admin'\)/.test(mig) && /revoke insert, update, delete on public\.feedback_items from authenticated/.test(mig), "a person reads only their own; the admin all; nobody writes from the browser");
ok(!/drop table/i.test(mig), "the old team_feedback table is left in place (Paul: remove it once this is proven)");
ok(/when 'fixed' then case when r\.kind = 'feature' then 'Your suggestion was added'/.test(mig), "the feedback loop: 'Your suggestion was added' when a feature is marked fixed");

console.log("\n── entry points and the admin inbox ──");
ok(/<FeedbackAndNews \/>/.test(read("src/components/AppLayout.tsx")) && /<FeedbackNewsButtons \/>/.test(read("src/components/AppSidebar.tsx")) && /OPEN_FEEDBACK_EVENT/.test(read("src/components/MobileBottomNav.tsx")), "Feedback + What's New: in the shell, the sidebar footer and the phone's More menu");
ok(/open-feedback/.test(read("src/components/CommandPalette.tsx")), "…and in the command palette");
ok(!canOpenRoute("sales", "/feedback") && canOpenRoute("admin", "/feedback"), "the Feedback inbox is the admin's only");
ok(/set_template_request_status/.test(read("src/pages/AdminFeedback.tsx")), "the admin decides template requests there (the requester is told)");

console.log("\n── What's New ──");
ok(WHATS_NEW.length > 0 && new Set(WHATS_NEW.map((e) => e.id)).size === WHATS_NEW.length, "entries have unique ids");
ok(WHATS_NEW.every((e, i, a) => i === 0 || a[i - 1].date >= e.date), "newest first");
ok(!whatsNewFor("admin").some((e) => e.audience === "sales") && whatsNewFor("sales").some((e) => e.id === "2026-09-28-earnings"), "each role sees its own entries");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
