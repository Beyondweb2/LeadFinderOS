/* Per-campaign "Run audit when they reply" (Paul, 2026-11-15).
 * Run: npx tsx scripts/campaign-reply-audit.test.ts */
import { readFileSync } from "node:fs";
import { campaignSkipsReplyAudit, replyAuditSkippedReason, skippedForLine } from "../src/lib/campaignReplyAudit.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

ok(!campaignSkipsReplyAudit(null) && !campaignSkipsReplyAudit({}) && !campaignSkipsReplyAudit({ audit_on_reply: null }) && !campaignSkipsReplyAudit({ audit_on_reply: true }), "default ON: no campaign, no value or true runs the audit");
ok(campaignSkipsReplyAudit({ audit_on_reply: false }), "only an explicit OFF skips");
ok(replyAuditSkippedReason("Web devs/agencies · WhatsApp").includes('"Web devs/agencies · WhatsApp"'), "the skip names the campaign");
ok(skippedForLine([{ name: "A", audit_on_reply: false }, { name: "B" }, { name: "C", audit_on_reply: false, archived_at: "2026-11-01" }]) === "Skipped for: A", "Inbox line lists live skipped campaigns only");
ok(skippedForLine([{ name: "A", audit_on_reply: true }]) === null, "nothing skipped -> no line");

const fra = read("supabase/functions/_shared/first-reply-audit.ts");
const at = fra.indexOf("export async function reconcileFirstReplyAuditIntents");
const body = fra.slice(at);
ok(at > 0 && body.indexOf("campaignSkipsReplyAudit(") > 0 && body.indexOf("campaignSkipsReplyAudit(") < body.indexOf("/functions/v1/create-ai-audit"), "the check sits where the reply audit is CREATED, before create-ai-audit");
ok(/audit_status: "not_required", audit_last_error: replyAuditSkippedReason/.test(body), "a skipped intent closes as not_required with the reason");
ok(fra.slice(0, at).indexOf("campaignSkipsReplyAudit(") < 0, "arming (shared with the held whatsapp-status) is unchanged");
const mig = read("supabase/migrations/20261211090000_campaign_audit_on_reply.sql");
ok(/add column if not exists audit_on_reply boolean not null default true/.test(mig), "additive column, default ON");
ok(/my_role\(\) is distinct from 'admin'/.test(mig) && /revoke all on function public\.campaign_set_audit_on_reply\(uuid, boolean\) from public, anon/.test(mig), "the setter is admin only");
ok(read("src/components/InboxReplyModeControl.tsx").includes('data-testid="reply-audit-skipped"'), "Inbox settings shows Skipped for");
ok(read("src/components/campaigns/CampaignEditDialog.tsx").includes("campaign_set_audit_on_reply"), "the campaign form has the switch");

console.log(f ? `\n${f} FAILED` : "\nall passed");
process.exit(f ? 1 : 0);
