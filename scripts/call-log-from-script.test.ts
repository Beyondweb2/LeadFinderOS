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
// onRunCheck removed 2026-10-06 (sales-team-today, Paul): the AI result sits above the script, not inside it.
ok(/export function ColdCallPlaybookInline\(\{ leadId, initialScript, onLogCall, onShowCheck \}/.test(play) && !/onRunCheck/.test(play) && /\{onLogCall && <LogCallBar onLogCall=\{onLogCall\} \/>\}/.test(play), "the inline script offers Log this call when given a handler, and no onRunCheck");
{
  const barSrc = play.slice(play.indexOf("function LogCallBar"), play.indexOf("export function ColdCallPlaybookInline"));
  ok(/data-testid="log-this-call"/.test(barSrc) && !/QuickCloseButton/.test(barSrc) && /sticky bottom-0/.test(barSrc), "the bar is sticky: Log this call, and no Quick Close");
}
ok(/export function ColdCallPlaybookSheet\(\{ leadId, open, onOpenChange, onLogCall \}/.test(play) && /onLogCall && leadId && <Button[^>]*onClick=\{onLogCall\}/.test(play), "the sheet offers it too");
const bar = play.slice(play.indexOf("function LogCallBar"), play.indexOf("export function ColdCallPlaybookInline"));
ok(!/leadRpc|supabase|invoke|fetch\(/.test(bar), "Log this call writes nothing and calls nothing — it only navigates");

const dlg = read("src/components/LeadDetailDialog.tsx");
ok(/const logThisCall = \(\) => setWindows\(afterLogCall\(\)\);/.test(dlg), "2026-10-06: Log outcome opens the Log window (no scrolling to a card at the bottom)");
ok(/<LeadCallFlow leadId=\{lead\.id\}[^>]*logOpen=\{logOpen\} onLogOpenChange=\{setLogOpen\}/.test(dlg) && /const \[windows, setWindows\] = useState\(\(\) => arrivalWindows\(callArrivalOf\(openNumberPopup, openLogContact\)/.test(dlg) && /const logOpen = windows\.logOpen;/.test(dlg), "…the one window, mounted once for the popup; it opens on arrival only for the script sheet's Log this call (2026-10-07: Outreach's Call arrives on the number window)");
// openAiTools / onRunCheck removed 2026-10-06 (sales-team-today, Paul): the AI check tools are at the TOP of the Call tab.
ok(/<SimpleCallTab leadId=\{lead\.id\} contactName=\{lead\.contact_name\}[^>]*onLogCall=\{logThisCall\}/.test(dlg) && !/openAiTools|onRunCheck/.test(dlg), "the Call tab passes it (no openAiTools — the AI check tools sit above the script)");
{
  const tabSrc = read('src/components/SimpleCallTab.tsx').replace(/\r\n/g, '\n'); const ai = tabSrc.indexOf('data-testid="found-ai-tools"'), inline = tabSrc.indexOf("<Script p=");
  ok(ai > 0 && inline > ai && /data-testid="found-ai-tools"[\s\S]{0,400}<LeadHookPanel leadId=\{leadId\} variant="call" \/>/.test(tabSrc), "the AI check tools (LeadHookPanel 'call') come BEFORE the script on the Call tab");
}
ok(/key=\{fullLead\.id\}/.test(dlg), "the body is keyed per lead, so the request never carries to the next lead");

const flow = read("src/components/LeadCallFlow.tsx");
ok(/<Dialog open=\{logOpen\} onOpenChange=\{setLogOpen\}>/.test(flow) && /data-testid="log-outcome"/.test(flow), "the Log window is a dialog — always in view, never below the fold");

const out = read("src/components/OutreachTable.tsx");
const sheet = out.slice(out.indexOf("<ColdCallPlaybookSheet"), out.indexOf("<ColdCallPlaybookSheet") + 700);
ok(/onLogCall=\{\(\) => \{[\s\S]*setDetailTab\('call'\); setDetailLogContact\(true\); setDetailNumberPopup\(false\); setDetailLead\(l\);/.test(sheet), "the Outreach row's sheet's Log this call opens the lead on Call with the Log window (2026-10-07: Outreach's Call itself opens the number window instead)");
if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall log-this-call checks passed");
