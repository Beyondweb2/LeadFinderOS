import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const inbound = readFileSync(resolve(root, "supabase/functions/_shared/whatsapp-inbound.ts"), "utf8");
const automationStart = inbound.indexOf("// Automation A: a reply auto-triggers");
const autoReplyStart = inbound.indexOf("// Auto audit_reply rule", automationStart);
const auditBlock = inbound.slice(automationStart, autoReplyStart);

const checks: Array<[string, boolean]> = [
  ["webhook dedupes inbound wamid before automation", inbound.includes("wa_messages_wa_id_uq") && inbound.includes("code === \"23505\"")],
  ["first inbound is persisted and ordered deterministically", inbound.includes("firstInboundForLead") && inbound.includes('.order("created_at", { ascending: true })') && inbound.includes('.order("id", { ascending: true })')],
  ["audit automation accepts the current and legacy explicit enable switches", auditBlock.includes('AUTO_REPLY_FLOW_ENABLED') && auditBlock.includes("autoReplyEnvOn()")],
  ["audit automation requires a prior outbound conversation", auditBlock.includes('eq("direction", "outbound")') && auditBlock.includes("priorOutbound")],
  ["audit automation does not classify the inbound content", !/isSubstantiveText|isDecline\(|looksAutomated\(|body\.length/.test(auditBlock)],
  ["media and emoji are stored before the audit decision", inbound.includes("const body = bodyFor(msg)") && inbound.includes("inserted++")],
  ["no website is passed as an explicit false website state", auditBlock.includes("has_website: !!ownWebsite(lead.website)")],
  ["an already active audit is not started a second time by the reply chain", inbound.includes("hasActiveAudit") && inbound.includes("audit already queued/running")],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
}
if (failures) throw new Error(`${failures} failures`);
