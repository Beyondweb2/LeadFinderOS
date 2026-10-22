/* CLAUDE.md stays a short rulebook (2026-10-22, perf audit): it is read at the start of every session, so it has a size budget, and the
   full old wording of every rule stays findable (docs/archive/claude-md-full-2026-10-22.md, indexed by docs/rules-ledger.md). */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const BUDGET_BYTES = 36 * 1024;
const live = read("CLAUDE.md");
const bytes = Buffer.byteLength(live);
ok(bytes <= BUDGET_BYTES, `CLAUDE.md is ${(bytes / 1024).toFixed(1)} KB (budget ${BUDGET_BYTES / 1024} KB) — move detail to docs/, never trim a rule to fit`);
ok(/docs\/archive\/claude-md-full-2026-10-22\.md/.test(live) && /docs\/rules-ledger\.md/.test(live), "CLAUDE.md points at the archive and the ledger");

const archive = read("docs/archive/claude-md-full-2026-10-22.md").replace(/\r\n/g, "\n");
const ledger = read("docs/rules-ledger.md").replace(/\r\n/g, "\n");
const marked = archive.split("\n").filter((l) => /[⛔🔴]/.test(l)).length;
const rows = ledger.split("\n").filter((l) => /^\| R\d{3} \|/.test(l));
ok(rows.length === marked, `the ledger lists every marked rule line of the archive (${rows.length} of ${marked})`);
ok(rows.every((r, i) => r.startsWith(`| R${String(i + 1).padStart(3, "0")} |`)), "ledger ids run R001… without a gap");
// each row's archive line really holds a marked rule
const lines = archive.split("\n");
const bad = rows.filter((r) => { const n = Number(r.split("|")[3]); return !/[⛔🔴]/.test(lines[n - 1] ?? ""); });
ok(bad.length === 0, bad.length ? `ledger rows point at the wrong archive line: ${bad.slice(0, 3).map((r) => r.split("|")[1].trim()).join(", ")}` : "every ledger row points at its rule's line in the archive");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
