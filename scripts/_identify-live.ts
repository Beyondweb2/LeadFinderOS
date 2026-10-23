/* READ-ONLY. The REAL displayNameFor over the live book, identify style. Scratch tool. */
import { execSync } from "node:child_process";
import { displayNameFor } from "../src/lib/displayName.ts";
const keys = JSON.parse(execSync("npx supabase projects api-keys --project-ref ruusxpkkmwtljxxulhbq --output json",
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as Array<{ name: string; api_key: string }>;
const sr = keys.find((k) => k.name === "service_role")!.api_key;
const H = { apikey: sr, Authorization: `Bearer ${sr}` };
const REST = "https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1";
type Lead = { business_name: string | null; derived_town: string | null; search_location: string | null; is_archived: boolean | null };
const all: Lead[] = [];
for (let off = 0; ; off += 1000) {
  const page = await (await fetch(`${REST}/outreach_leads?select=id,business_name,derived_town,search_location,is_archived&order=id&offset=${off}&limit=1000`, { headers: H })).json();
  if (!Array.isArray(page)) { console.error(page); process.exit(1); }
  all.push(...page as Lead[]); if (page.length < 1000) break;
}
const leads = all.filter((l) => (l.business_name ?? "").trim() && !l.is_archived);
let changed = 0, sameAsBefore = 0;
const ex: string[] = [];
for (const l of leads) {
  const n = (l.business_name ?? "").trim().replace(/\s+/g, " ");
  const town = (l.derived_town ?? l.search_location ?? "").trim();
  const now = displayNameFor(n, { town, style: "identify" }).display;
  if (now !== n) { changed++; if (ex.length < 25) ex.push(`${n}   ->   ${now}`); } else sameAsBefore++;
}
console.log(`leads ${leads.length}  shortened ${changed} (${((changed / leads.length) * 100).toFixed(1)}%)  kept whole ${sameAsBefore}`);
ex.forEach((e) => console.log("  " + e));
