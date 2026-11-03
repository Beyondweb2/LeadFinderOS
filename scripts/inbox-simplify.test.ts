/* THE SIMPLER INBOX (Paul, 2026-11-03; docs/inbox-simplify.md). Layout only: no server rule changes.
   Assign is admin-only on screen; Quick reply, the big Preview, the grey wording line and the top-right Send now are gone from the Inbox;
   the wording lives behind an eye on every template row and beside the chosen template. Run: npx tsx scripts/inbox-simplify.test.ts */
import { readFileSync } from "node:fs";
import { leadPermissions } from "../src/lib/access.ts";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const inbox = read("src/pages/Inbox.tsx");
const owner = read("src/components/LeadOwnerControl.tsx");
const eye = read("src/components/TemplateWordingPreview.tsx");

console.log("1. Assign is the admin's");
ok(leadPermissions("admin").assignOwner === true && leadPermissions("sales").assignOwner === false && leadPermissions(null).assignOwner === false, "only an admin may assign");
const salesBranch = owner.slice(owner.indexOf("if (!canAssign) {"), owner.indexOf('<SelectTrigger className="h-7 w-36 text-xs"'));
const earlyReturn = salesBranch.indexOf("return (");
ok(earlyReturn > 0 && !salesBranch.slice(0, salesBranch.indexOf("\n  }\n")).includes("Assign:"), "a salesperson returns before the Assign picker is drawn");
ok(/<LeadOwnerControl leadId=\{active\.leadId\} \/>/.test(inbox) && /<LeadOwnerControl leadId=\{leadId\} \/>/.test(read("src/components/LeadStateStrip.tsx")), "the Inbox header and the prospect popup both use that one control");

console.log("2. what was removed stays removed");
ok(!/Quick reply|quickReplyMenu|useTemplates/.test(inbox), "no Quick reply in the Inbox");
ok(!/handleSendNow|aria-label="Send now"|process-sms-queue/.test(inbox), "no top-right Send now");
ok(!/>\s*Preview\s*<\/Button>|<TemplateSnippet/.test(inbox), "no big Preview button and no grey wording line");

console.log("3. what must stay");
ok(/<RequestTemplateButton source="inbox" \/>/.test(inbox), "Request a template stays");
ok(/\{sendVerb\(replyOpen\)\} template/.test(inbox), "Queue / Send template stays");
ok(/data-testid="picker-fill-composer"/.test(inbox) && /await preview\(\{ phone: active\.phone/.test(inbox), "Put in message box stays, on the sender's own dry run");
ok(/data-testid="picker-free-text-note"/.test(inbox) && /Outside the 24h window/.test(inbox), "the 24-hour wording stays");

console.log("4. the eye");
ok((inbox.match(/trailing=\{<TemplateEye /g) ?? []).length === 2, "every row of both template groups has one");
ok(/\{!!template && <TemplateEye selected /.test(inbox), "and one beside the chosen template");
ok(/\{trailing != null && /.test(read("src/components/ui/select.tsx")) && read("src/components/ui/select.tsx").indexOf("ItemText>{children}") < read("src/components/ui/select.tsx").indexOf("trailing != null"), "it sits outside ItemText, so it is not copied into the closed picker");
ok(/onPointerUp=\{stop\}/.test(eye) && /stop\(e\);\s*e\.preventDefault\(\);\s*const touch/.test(eye), "pressing it never selects the row");
ok(/pointerType === 'touch'/.test(eye) && /tabIndex=\{selected \? 0 : -1\}/.test(eye), "a tap opens it, and the chosen template's eye takes keyboard focus");
ok(/if \(lastInputWasKey\) setOpen\(true\)/.test(eye) && !/onPointerEnter/.test(eye), "passing the pointer over a row opens nothing");
ok(/pointer-events-auto/.test(eye), "it still answers on a greyed-out row");

if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log("all passed");
