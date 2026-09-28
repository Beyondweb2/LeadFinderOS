/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEMPLATE PREVIEW + "REQUEST A TEMPLATE" (2026-09-28, Paul).
   The wording under each picker is the app's one copy of the approved bodies; a request reaches Paul
   exactly as typed, is saved before the email is tried, and never goes to Meta. The database half
   (Sales cannot write the table or read another person's request) is supabase/tests/template-requests.sql.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  META_TEMPLATE_GUIDELINES_URL, TEMPLATE_REQUEST_LIMITS, checkTemplateRequest, replyToAddress, templateRequestEmail,
} from "../src/lib/templateRequest.ts";
import { SAMPLE_PREVIEW_VALUES, templatePreviewText } from "../src/lib/templatePreview.ts";
import { READABLE_TEMPLATE_BODIES } from "../src/lib/templateBodies.ts";
import { WHATSAPP_TEMPLATES } from "../src/types/outreach.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the preview is the approved wording ──");
{
  for (const t of WHATSAPP_TEMPLATES) {
    const p = templatePreviewText(t.value);
    ok(!!p && p === READABLE_TEMPLATE_BODIES[t.value]!(SAMPLE_PREVIEW_VALUES.businessName, SAMPLE_PREVIEW_VALUES.url, SAMPLE_PREVIEW_VALUES.trade,
      SAMPLE_PREVIEW_VALUES.competitors, SAMPLE_PREVIEW_VALUES.firstName, SAMPLE_PREVIEW_VALUES.town, SAMPLE_PREVIEW_VALUES.siteFault, SAMPLE_PREVIEW_VALUES.siteFindings),
      `${t.value}: previewed from the one copy of its body`);
  }
  const v1 = templatePreviewText("initial_contact", { businessName: "Acme Locks" }) ?? "";
  ok(v1.includes("Acme Locks"), "a single-lead picker shows that lead's business name");
  ok(templatePreviewText("not_a_template") === null && templatePreviewText(null) === null, "no body → null (the box says it can't be previewed, never blank)");
  for (const [file, src] of [["src/components/OutreachTable.tsx", "queue"], ["src/components/WhatsAppLeadControls.tsx", "lead"], ["src/pages/Inbox.tsx", "inbox"]] as const) {
    const s = read(file);
    ok(/<TemplateWordingInList hovered=\{\w+\.hovered\}/.test(s) && /\.itemProps\(t\.value\)/.test(s) && /onOpenChange=\{\w+\.onOpenChange\}/.test(s),
      `${file}: hovering an option shows its wording INSIDE the open list (the list covers anything drawn under it)`);
    ok(/<TemplateWordingPreview [^>]*hovered=\{null\}/.test(s), `${file}: …and the chosen one shows under the picker once it closes`);
    ok(new RegExp(`<RequestTemplateButton source="${src}" />`).test(s), `${file}: has Request a template`);
  }
}

console.log("\n── the request, exactly as typed ──");
{
  const typed = "  Hi [name] 👋\n\nThanks for the chat earlier — here are our prices:\n[link]\n\n  (No pressure!)  ";
  const c = checkTemplateRequest({ message: typed, useCase: "after a call", whyNotExisting: "every template is a cold opener", name: "  prices after call  ", source: "queue" });
  ok(c.ok && c.value.message === typed, "the wording is kept byte for byte (spaces, blank lines, emoji)");
  ok(c.ok && c.value.name === "prices after call" && c.value.source === "queue", "the name alone is trimmed; the source kept");
  ok(checkTemplateRequest({ message: "   ", useCase: "x", whyNotExisting: "y" }).ok === false, "an empty message is refused");
  ok((checkTemplateRequest({ message: "m", useCase: "", whyNotExisting: "y" }) as { error?: string }).error === "use_case_required", "'when would you use it' is required");
  ok((checkTemplateRequest({ message: "m", useCase: "u", whyNotExisting: " " }) as { error?: string }).error === "why_required", "'why doesn't an existing template cover this' is required");
  ok((checkTemplateRequest({ message: "x".repeat(TEMPLATE_REQUEST_LIMITS.message + 1), useCase: "u", whyNotExisting: "y" }) as { error?: string }).error === "too_long", "Meta's 1,024-character body limit");
  ok(checkTemplateRequest({ message: "m", useCase: "u", whyNotExisting: "y", source: "nonsense" }).ok && (checkTemplateRequest({ message: "m", useCase: "u", whyNotExisting: "y", source: "nonsense" }) as { value: { source: unknown } }).value.source === null, "an unknown source is dropped, not trusted");

  const mail = templateRequestEmail({ id: "req-1", createdAt: "2026-09-28T09:15:00Z", requesterName: "Sam", requesterEmail: "sam@realco.co.uk", requesterRole: "sales",
    message: typed, useCase: "after a call", whyNotExisting: "every template is a cold opener", name: "prices after call", source: "queue" });
  ok(mail.text.includes(`----------------------------------------\n${typed}\n----------------------------------------`), "the email carries the wording exactly, between two lines");
  ok(mail.text.includes("From: Sam (sales) <sam@realco.co.uk>") && mail.text.includes("Sent: 28 Sept 2026, 10:15 (UK time)") || mail.text.includes("Sent: 28 Sep 2026, 10:15 (UK time)"), `who and when (UK time): ${mail.text.split("\n").find((l) => l.startsWith("Sent:"))}`);
  ok(mail.text.includes("When they would use it:\nafter a call") && mail.text.includes("Why an existing template doesn't cover it:\nevery template is a cold opener"), "use case and 'why not existing' included");
  ok(/Nothing has been sent to Meta/.test(mail.text) && mail.subject === "Template request from Sam: prices after call", `subject: ${mail.subject}`);
  ok(!/previous|history|request count|\b\d+(st|nd|rd|th) request/i.test(mail.text), "this request only — no count or history");

  ok(replyToAddress("sam@realco.co.uk") === "sam@realco.co.uk", "reply-to a real address");
  for (const e of ["sales-test@leadfinder.invalid", "a@example.com", "x@y.test", "nope", "", null]) ok(replyToAddress(e as string | null) === null, `no reply-to for ${JSON.stringify(e)}`);
  ok(/^https:\/\/developers\.facebook\.com\//.test(META_TEMPLATE_GUIDELINES_URL), "the rules link is Meta's own documentation");
}

console.log("\n── the server ──");
{
  const fn = read("supabase/functions/template-request/index.ts");
  ok(/resolveActor\(req, service\)/.test(fn), "a signed-in team role is required (admin or sales)");
  ok(/checkTemplateRequest\(body\)/.test(fn), "the server validates again (the browser never decides)");
  ok(fn.indexOf('.from("template_requests").insert(') > 0 && fn.indexOf('.from("template_requests").insert(') < fn.indexOf("api.resend.com"), "the request is SAVED before the email is tried");
  ok(/email_status: emailStatus, email_error: emailError/.test(fn), "…and the email's outcome is written back onto it");
  ok(/message_text: v\.message,/.test(fn) && !/v\.message\.trim\(\)/.test(fn), "the stored wording is the raw text");
  ok(/to: \[ADMIN_EMAIL\]/.test(fn) && /reply_to: replyTo/.test(fn), "to Paul, reply-to the requester when real");
  ok(!/graph\.facebook|message_templates|WHATSAPP_ACCESS_TOKEN/.test(fn), "nothing is sent to Meta");
  ok(/\[functions\.template-request\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml lists the function");
  const mig = read("supabase/migrations/20260928220000_template_requests.sql");
  ok(/enable row level security/.test(mig) && !/for (insert|update|delete)/.test(mig), "RLS on, and no write policy for any signed-in role");
  ok(/requested_by = \(select auth\.uid\(\)\) or \(select public\.my_role\(\)\) = 'admin'/.test(mig), "a person reads their own requests; the admin reads all");
  ok(/length\(message_text\) between 1 and 1024/.test(mig), "the table holds Meta's limit too");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
