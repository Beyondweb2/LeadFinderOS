/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD-SYNC GAPS (closeout audit, 2026-10-02). Every screen must show the same lead state, so:
     1. a "Not interested" set by STATUS (Inbox pill, Outreach status menu) clears the Next Action the
        way a logged "Not interested" outcome does — through the one write, before the status/archive;
     2. every lead writer notifies through notifyLeadChanged (never a hand-fired event, which reaches
        this tab only), including the Inbox's "Remove from inbox";
     3. the Sales dashboard's numbers are invalidated by a lead change (debounced, once per burst);
     4. the Inbox's first-reply control reads the ONE effective-mode rule the server arms by.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("── 1. a status no clears the Next Action, first ──");
{
  const quick = strip(read("src/lib/leadQuickActions.ts"));
  const fn = quick.slice(quick.indexOf("export async function setLeadPipelineStatus"));
  const clear = fn.indexOf("clearNextActionOnNo(leadId)");
  const write = fn.indexOf("updateLeadStatus(leadId");
  ok(clear > 0 && write > clear, "Inbox pill: clearNextActionOnNo runs before the status write");
  ok(/status === 'not_interested'\) await clearNextActionOnNo/.test(fn), "Inbox pill: only on not_interested");

  const out = strip(read("src/hooks/useOutreach.ts"));
  const us = out.slice(out.indexOf("const updateStatus = useCallback"));
  const c2 = us.indexOf("clearNextActionOnNo(leadId)");
  ok(c2 > 0 && c2 < us.indexOf("isSales()") && c2 < us.indexOf("updateLead(leadId"), "Outreach status menu: clears before the sales patch and the admin write, both roles");

  const w = read("src/lib/nextActionWrite.ts");
  ok(/export async function clearNextActionOnNo[\s\S]{0,200}saveNextAction\(leadId, \{ nextAction: 'none'/.test(w), "the clear is the one Next Action write (saveNextAction → lead_set_follow_up), 'none' only");
}

console.log("\n── 2. every writer notifies every screen ──");
{
  const inbox = strip(read("src/pages/Inbox.tsx"));
  const rm = inbox.slice(inbox.indexOf("const handleRemoveFromInbox"), inbox.indexOf("const handleRemoveFromInbox") + 1200);
  ok(/updateLeadStatus\(c\.leadId, 'closed'\)[\s\S]*notifyLeadChanged\(c\.leadId\)/.test(rm), "Remove from inbox notifies after the Closed write");

  const walk = (dir: string, out: string[] = []) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const handFired = walk("src").filter((p) => p !== "src/lib/leadSync.ts" && /dispatchEvent\(new CustomEvent\(\s*['"]lead-row-changed['"]/.test(strip(read(p))));
  ok(handFired.length === 0, `no hand-fired lead-row-changed outside leadSync (${handFired.join(", ") || "none"})`);
}

console.log("\n── 3. the Sales dashboard re-reads after a lead change (debounced) ──");
{
  const sync = read("src/lib/leadSync.ts");
  ok(/BOOK_WIDE_LEAD_KEYS[^=]*= \[\['sales-performance'\](, \['[a-z-]+'\])*\]/.test(sync), "sales-performance is a book-wide key (with the salesperson's queue panel, 2026-10-03)");
  const dash = read("src/pages/SalesDashboard.tsx");
  ok(/queryKey: \['sales-performance'/.test(dash), "the dashboard's query key starts with 'sales-performance' (prefix match)");

  /* Behaviour: a fake window + query client. Three notices in a burst → one book-wide invalidation. */
  const target = new EventTarget();
  (globalThis as unknown as { window: unknown }).window = target;
  (globalThis as unknown as { CustomEvent: unknown }).CustomEvent ??= class extends Event { detail: unknown; constructor(t: string, i?: { detail?: unknown }) { super(t); this.detail = i?.detail; } };
  /* No real BroadcastChannel in the test: Node has one, and an open channel keeps the process alive. */
  (globalThis as unknown as { BroadcastChannel: unknown }).BroadcastChannel = undefined;
  const calls: string[] = [];
  const qc = { invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => { calls.push(JSON.stringify(queryKey)); return Promise.resolve(); } };
  const { installLeadSync, notifyLeadChanged } = await import("../src/lib/leadSync.ts");
  const off = installLeadSync(qc as never);
  notifyLeadChanged("a"); notifyLeadChanged("b"); notifyLeadChanged("c");
  notifyLeadChanged("d", undefined, { status: "x" }, true); // optimistic: no re-read
  ok(calls.filter((c) => c === '["lead-crm","a"]').length === 1, "the per-lead keys are invalidated at once");
  ok(!calls.some((c) => c.includes("sales-performance")), "the book-wide key waits for the burst to end");
  await new Promise((r) => setTimeout(r, 1700));
  ok(calls.filter((c) => c === '["sales-performance"]').length === 1, "one sales-performance invalidation for the burst");
  ok(!calls.some((c) => c.includes('"d"')), "an optimistic notice re-reads nothing");
  off();
}

console.log("\n── 4. the first-reply control reads the server's rule ──");
{
  const inbox = strip(read("src/pages/Inbox.tsx"));
  ok(/setMode\(effectiveFirstReplyMode\(data\.autoReplyEnabled, data\.firstReplyMode\)\)/.test(inbox), "Inbox uses effectiveFirstReplyMode");
  ok(!/autoReplyEnabled === true \?/.test(inbox), "no hand-written copy of the rule in the Inbox");
}

if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall lead-sync-gap checks passed");
