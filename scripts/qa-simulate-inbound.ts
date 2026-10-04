/* ════════════════════════════════════════════════════════════════════════════════════════════════
   QA INBOUND SIMULATION — "the prospect WhatsApped us" for the pre-sales certification (2026-10-04,
   docs/pre-sales-certification/fixes-01-security-inbound.md). NOT run by `npm test`.

   It replaces the old way QA simulated an inbound reply — an UNSIGNED post to whatsapp-status, which
   only worked because the webhook failed open (M-003) and no longer exists. This sends ONE Meta-shaped
   inbound message from a reserved 07700 900xxx number with the CRON_SECRET in x-qa-simulate-inbound.
   whatsapp-status re-checks everything (src/lib/metaWebhookGate.ts): reserved senders only, messages
   only, ids wamid.QA_…; a real number is refused 403 whatever this script does. The message then runs
   the SAME inbound path a real reply runs (matching, unread, notification, status, first-reply guard).

   Usage (from the repo root):
     SUPABASE_MGMT_TOKEN_FILE=<path to a file holding the Management API token> \
       npx tsx scripts/qa-simulate-inbound.ts --from "07700 900611" --text "send me the link" [--id <suffix>] [--times 2]
     --times 2   delivers the IDENTICAL message twice (the duplicate-id proof: the second stores nothing)
     --id        the wamid.QA_<suffix> to use (default: derived from the number and the time)
   The CRON_SECRET is read from the vault and never printed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { isReservedTestNumber } from "../src/lib/qaSafety.ts";
import { QA_INBOUND_HEADER, QA_INBOUND_ID_PREFIX, qaInboundBodyRefusal } from "../src/lib/metaWebhookGate.ts";

const REF = "ruusxpkkmwtljxxulhbq";
const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fromRaw = arg("--from") ?? "";
const text = arg("--text") ?? "QA simulated inbound";
const times = Math.max(1, Math.min(3, Number(arg("--times") ?? 1)));
if (!isReservedTestNumber(fromRaw)) { console.error("--from must be a reserved 07700 900xxx number"); process.exit(2); }
const digits = fromRaw.replace(/\D/g, "");
const from = digits.startsWith("44") ? digits : `44${digits.replace(/^0/, "")}`;
const suffix = (arg("--id") ?? `${from}_${Date.now()}`).replace(/[^A-Za-z0-9_]/g, "");
const tokenFile = process.env.SUPABASE_MGMT_TOKEN_FILE;
if (!tokenFile) { console.error("SUPABASE_MGMT_TOKEN_FILE is required (a file holding the Management API token)"); process.exit(2); }
const token = readFileSync(tokenFile, "utf8").trim();

async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t) as T[];
}

const wamid = `${QA_INBOUND_ID_PREFIX}${suffix}`;
const body = {
  object: "whatsapp_business_account",
  entry: [{ id: "QA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp",
    contacts: [{ wa_id: from, profile: { name: "QA certification" } }],
    messages: [{ from, id: wamid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  } }] }],
};
const refusal = qaInboundBodyRefusal(body);
if (refusal) { console.error("REFUSED (local pre-check):", refusal); process.exit(1); }

const [{ secret }] = await sql<{ secret: string }>(`select decrypted_secret as secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1`);
for (let i = 1; i <= times; i++) {
  const r = await fetch(`https://${REF}.supabase.co/functions/v1/whatsapp-status`, {
    method: "POST", headers: { "Content-Type": "application/json", [QA_INBOUND_HEADER]: secret }, body: JSON.stringify(body),
  });
  console.log(`delivery ${i}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}
const rows = await sql(`select m.id, m.lead_id, m.user_id, m.status, l.business_name, l.assigned_to_user_id, l.status as lead_status,
  (select count(*) from notifications n where n.dedupe_key = 'reply:' || m.id or n.dedupe_key = 'reply-ambiguous:' || m.id) as notifications
  from whatsapp_messages m left join outreach_leads l on l.id = m.lead_id where m.wa_message_id = '${wamid}'`);
console.log("\nREAD-BACK", JSON.stringify(rows, null, 1));
