/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NO BROWSER CODE READS contact_suppressions DIRECTLY (2026-10-20).
   The table has RLS on and NO policies (service-role only since 20260714120000): a browser read returns
   200 and [] for everyone, so a screen that reads it looks like a guard and finds nothing. That is how the
   Outreach bulk-audit dialog and the bulk follow-up count never saw a suppressed lead. The screen asks the
   role-checked SQL function leads_suppressed (src/lib/leadSuppression.ts) — lead ids in, suppressed lead
   ids out, never a reason or a phone, a salesperson only for leads they work.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

// 1. No src/ file names the table as code (comments are fine; the generated types file only describes it).
const offenders: string[] = [];
for (const file of walk("src")) {
  if (file === "src/integrations/supabase/types.ts") continue;
  if (/['"`]contact_suppressions['"`]/.test(strip(read(file)))) offenders.push(file);
}
ok(offenders.length === 0, `no src/ file reads contact_suppressions directly${offenders.length ? ` — found in ${offenders.join(", ")}` : ""}`);

// 2. The sweep can see a read (so a pass above is not a blind regex).
ok(/['"`]contact_suppressions['"`]/.test(strip("sb.from('contact_suppressions').select('lead_id')")), "the sweep catches a .from('contact_suppressions') read");

// 3. The Outreach screen asks the role-checked function, for both the audit dialog and the follow-up count.
const table = strip(read("src/components/OutreachTable.tsx"));
ok((table.match(/fetchSuppressedLeadIds\(/g) ?? []).length >= 2, "OutreachTable checks suppression through fetchSuppressedLeadIds in both places");
ok(/suppressed\.has\(l\.id\)/.test(table), "the follow-up count keys suppression on the lead id the function returns");

const lib = strip(read("src/lib/leadSuppression.ts"));
ok(/rpc\('leads_suppressed'/.test(lib), "the helper calls leads_suppressed");
ok(!/from\(/.test(lib), "the helper reads no table");

// 4. The SQL function is role-checked, lead-ids-only, returns ids only, and is not for anon.
const sql = read("supabase/migrations/20261113090000_leads_suppressed.sql");
const body = sql.slice(sql.indexOf("create or replace function public.leads_suppressed"));
ok(/public\.leads_suppressed\(_lead_ids uuid\[\]\)\s*\n\s*returns uuid\[\]/.test(body), "lead ids in, lead ids out (no phone argument, no reason returned)");
ok(/security definer/.test(body) && /set search_path to 'public'/.test(body), "security definer with a fixed search_path");
ok(/public\.can_work_lead\(l\.id\)/.test(body) && /public\.my_role\(\) is not null/.test(body), "scoped to leads the caller may work");
ok(/cardinality\(coalesce\(_lead_ids, '\{\}'\)\) <= 500/.test(body), "capped at 500 ids a call (the helper's chunk)");
ok(!/s\.reason|s\.source/.test(body.replace(/^--.*$/gm, "")), "never reads the reason or the source");
ok(/s\.lead_id = l\.id/.test(body) && /phone_e164_key\(l\.phone\)/.test(body), "as strict as before: any row, on the lead OR its number");
ok(/revoke all on function public\.leads_suppressed\(uuid\[\]\) from public, anon/.test(sql)
  && /grant execute on function public\.leads_suppressed\(uuid\[\]\) to authenticated/.test(sql), "not for anon; signed-in only");

if (f) { console.log(`\n${f} FAILURE(S)`); process.exit(1); }
console.log("\nALL PASS");
