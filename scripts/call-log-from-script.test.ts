/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE CALL SCRIPT ENDS IN "LOG THIS CALL" (closeout, 2026-10-02). The script (Scripts tab / the Outreach
   row's sheet) and the record of the call (Work tab: Log a contact → the ONE outcome rule → Next Action)
   were a tab apart, and the sheet could not reach the record at all. Both now end in Log this call, which
   opens Work with Log a contact open and scrolled into view. It writes nothing itself and calls nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const play = read("src/components/ColdCallPlaybook.tsx");
ok(/export function ColdCallPlaybookInline\(\{ leadId, initialScript, onLogCall, onRunCheck \}/.test(play) && /\{onLogCall && <LogCallBar onLogCall=\{onLogCall\} leadId=\{leadId\} \/>\}/.test(play), "the inline script offers Log this call when given a handler (with Quick Close beside it)");
ok(/export function ColdCallPlaybookSheet\(\{ leadId, open, onOpenChange, onLogCall \}/.test(play) && /onLogCall && leadId && <Button[^>]*onClick=\{onLogCall\}/.test(play), "the sheet offers it too");
const bar = play.slice(play.indexOf("function LogCallBar"), play.indexOf("export function ColdCallPlaybookInline"));
ok(!/leadRpc|supabase|invoke|fetch\(/.test(bar), "Log this call writes nothing and calls nothing — it only navigates");

const dlg = read("src/components/LeadDetailDialog.tsx");
ok(/const logThisCall = \(\) => \{ setLogCallRequested\(true\); setTab\('work'\); \};/.test(dlg), "the workspace switches to Work and asks for Log a contact");
ok(/logContactOpen=\{openLogContact \|\| logCallRequested\}/.test(dlg), "…the Work panel opens Log a contact for it");
ok(/<ColdCallPlaybookInline key=\{scriptTab\} leadId=\{lead\.id\} initialScript=\{scriptTab\} onLogCall=\{logThisCall\} onRunCheck=\{/.test(dlg), "the Scripts tab passes it (and the way to the AI check)");
ok(/key=\{fullLead\.id\}/.test(dlg), "the body is keyed per lead, so the request never carries to the next lead");

const crm = read("src/components/LeadCrmPanel.tsx");
const lc = crm.slice(crm.indexOf("function LogContact"), crm.indexOf("function LogContact") + 6000);
ok(/useEffect\(\(\) => \{ if \(defaultOpen\) rootRef\.current\?\.scrollIntoView/.test(lc) && /<div ref=\{rootRef\} data-testid="log-contact">/.test(lc), "Log a contact opened for a call is brought into view");

const out = read("src/components/OutreachTable.tsx");
const sheet = out.slice(out.indexOf("<ColdCallPlaybookSheet"), out.indexOf("<ColdCallPlaybookSheet") + 700);
ok(/onLogCall=\{\(\) => \{[\s\S]*setDetailTab\('work'\); setDetailLogContact\(true\); setDetailLead\(l\);/.test(sheet), "the Outreach row's sheet opens the lead on Work with Log a contact — the same as the Call button");
if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall log-this-call checks passed");
