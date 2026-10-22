/* The "changed since" refresh of a remembered Outreach list (2026-10-22): the pure rules in src/lib/outreachDelta.ts
   and the memory's sync stamp, plus the wiring in useOutreach that keeps the count check in front of it. */
import fs from "node:fs";
import path from "node:path";
import { applyLeadDelta, deltaMatchesCounts, deltaSinceIso, DELTA_OVERLAP_MS, DELTA_MAX_AGE_MS } from "../src/lib/outreachDelta.ts";
import { forgetOutreachList, markOutreachListSynced, recallOutreachList, rememberOutreachList } from "../src/lib/outreachListMemory.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const hook = fs.readFileSync(path.resolve(import.meta.dirname, "../src/hooks/useOutreach.ts"), "utf8");

type R = { id: string; created_at: string; is_archived: boolean; v?: number };
const r = (id: string, created: string, archived = false, v = 0): R => ({ id, created_at: created, is_archived: archived, v });
const a = [r("c", "2026-10-03T00:00:00Z"), r("b", "2026-10-02T00:00:00Z"), r("a", "2026-10-01T00:00:00Z")];
const z = [r("z", "2026-09-01T00:00:00Z", true)];

// an edited row replaces the old one; order stays newest-created first
{
  const out = applyLeadDelta(a, z, [r("b", "2026-10-02T00:00:00Z", false, 1)]);
  ok(out.active.map((x) => x.id).join() === "c,b,a" && out.active[1].v === 1 && out.archived.length === 1, "an edited active lead replaces its old row in place");
}
// a brand-new lead goes to its place by created_at
{
  const out = applyLeadDelta(a, z, [r("n", "2026-10-04T00:00:00Z")]);
  ok(out.active.map((x) => x.id).join() === "n,c,b,a", "a new lead is placed newest first");
}
// archived / unarchived moves
{
  const out = applyLeadDelta(a, z, [r("b", "2026-10-02T00:00:00Z", true), r("z", "2026-09-01T00:00:00Z", false)]);
  ok(out.active.map((x) => x.id).join() === "c,a,z" || out.active.map((x) => x.id).join() === "c,a,z".split(",").join(), "an archived lead leaves active; an unarchived one joins it");
  ok(out.archived.length === 1 && out.archived[0].id === "b", "…and the archived list follows");
}
// the count check refuses a delta that cannot see a deletion
{
  const merged = applyLeadDelta(a, z, []);
  ok(deltaMatchesCounts(merged, { active: 3, archived: 1 }), "counts agree → accepted");
  ok(!deltaMatchesCounts(merged, { active: 2, archived: 1 }), "a lead deleted behind our back (database has fewer) → refused");
  ok(!deltaMatchesCounts(merged, { active: 4, archived: 1 }), "a lead the delta missed (database has more) → refused");
  ok(!deltaMatchesCounts(merged, { active: null, archived: 1 }), "an unreadable count → refused (absent is never a match)");
}
// since: overlap, age limit, never-synced
{
  const now = Date.UTC(2026, 9, 22, 12, 0, 0);
  ok(deltaSinceIso(null, now) === null, "never proven current → no delta");
  ok(deltaSinceIso(now - 60_000, now) === new Date(now - 60_000 - DELTA_OVERLAP_MS).toISOString(), "since = last proven time minus the overlap");
  ok(deltaSinceIso(now - DELTA_MAX_AGE_MS - 1, now) === null, "a very old list does the full load");
}
// memory carries the stamp, per person and role, and forgets it
{
  forgetOutreachList();
  rememberOutreachList("u1", "admin", [{ id: "a" }], []);
  ok(recallOutreachList("u1", "admin")?.syncedAt === null, "a remembered list never proven current has no stamp");
  markOutreachListSynced("u1", "admin", 12345);
  rememberOutreachList("u1", "admin", [{ id: "a" }, { id: "b" }], []);
  ok(recallOutreachList("u1", "admin")?.syncedAt === 12345, "remembering a changed list keeps the stamp of the last proof");
  ok(recallOutreachList("u1", "sales") === null, "another role never gets it");
  forgetOutreachList();
  ok(recallOutreachList("u1", "admin") === null, "forgotten with the list");
}
// wiring
ok(/deltaMatchesCounts\(laid,/.test(hook) && /if \(since && await refreshRememberedDelta\(since, remembered, loadStart\)\) return;/.test(hook), "the hook accepts a delta only through the count check, else falls through to the full load");
ok(/archivedP\.catch\(\(\) => \{\}\);/.test(hook) && /await loadRemainingLeads\(gen, archivedP, startedAt\)/.test(hook), "a big list paints after page 0 — the archived list loads in the background half");
ok(!/const \[p0, arc\] = await Promise\.all/.test(hook), "the table no longer waits for the archived list");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
