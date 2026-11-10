/* CLAUDE.md stays a short index (2026-10-22 perf audit; cut again 2026-11-10). It is read at the start of every session, so it has a
   size budget. The rules it used to carry moved WORD FOR WORD to docs/rules/*.md; this suite proves none was dropped on the way:
     · every marked (⛔/🔴) rule line of the 2026-11-10 snapshot is present in some docs/rules file,
     · CLAUDE.md points at every docs/rules file, and every file it points at exists,
     · the older archive + ledger (2026-10-22) stay intact and indexed. */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const BUDGET_BYTES = 10 * 1024;
const live = read("CLAUDE.md");
const bytes = Buffer.byteLength(live);
ok(bytes <= BUDGET_BYTES, `CLAUDE.md is ${(bytes / 1024).toFixed(1)} KB (budget ${BUDGET_BYTES / 1024} KB) — move detail to docs/rules/, never drop a rule to fit`);
ok(/docs\/archive\/claude-md-2026-11-10\.md/.test(live) && /docs\/archive\/claude-md-full-2026-10-22\.md/.test(live) && /docs\/rules-ledger\.md/.test(live),
  "CLAUDE.md points at both archives and the ledger");

/* every docs/rules file is named in CLAUDE.md, and every docs/rules path CLAUDE.md names exists */
const rulesDir = path.join(root, "docs", "rules");
const rulesFiles = fs.readdirSync(rulesDir).filter((n) => n.endsWith(".md")).sort();
ok(rulesFiles.length >= 6, `docs/rules holds the rules files (${rulesFiles.length})`);
for (const n of rulesFiles) ok(live.includes(`docs/rules/${n}`), `CLAUDE.md points at docs/rules/${n}`);
for (const m of live.matchAll(/docs\/[\w./-]+\.md/g)) ok(fs.existsSync(path.join(root, m[0])), `${m[0]} (named in CLAUDE.md) exists`);

/* no rule lost in the 2026-11-10 move: every marked line of the snapshot lives on in docs/rules (the only edits allowed in the move
   were the two "§3" cross-references, normalised here) */
const snapshot = read("docs/archive/claude-md-2026-11-10.md");
const rulesText = rulesFiles.map((n) => read(`docs/rules/${n}`)).join("\n");
const norm = (s: string) => s.replace(/\(§3\)|\(see "The deploy check" below\)|\(docs\/rules\/engineering\.md, "Constants"\)/g, "(§)").trim();
const rulesNorm = norm(rulesText);
/* from "## 0." on: the lines above it were the old file's preamble about itself, replaced by the new CLAUDE.md's preamble */
const ruleSections = snapshot.slice(snapshot.indexOf("\n## 0."));
const marked = ruleSections.split("\n").filter((l) => /[⛔🔴]/.test(l) && !/^#/.test(l));
const lost = marked.filter((l) => !rulesNorm.includes(norm(l)));
ok(marked.length > 30, `the snapshot's marked rule lines were found (${marked.length})`);
ok(lost.length === 0, lost.length ? `rule lines missing from docs/rules: ${lost.slice(0, 3).map((l) => l.slice(0, 70)).join(" | ")}` : `all ${marked.length} marked rule lines of the snapshot are in docs/rules`);

/* the 2026-10-22 archive + ledger (older full wording) */
const archive = read("docs/archive/claude-md-full-2026-10-22.md");
const ledger = read("docs/rules-ledger.md");
const markedOld = archive.split("\n").filter((l) => /[⛔🔴]/.test(l)).length;
const rows = ledger.split("\n").filter((l) => /^\| R\d{3} \|/.test(l));
ok(rows.length === markedOld, `the ledger lists every marked rule line of the archive (${rows.length} of ${markedOld})`);
ok(rows.every((r, i) => r.startsWith(`| R${String(i + 1).padStart(3, "0")} |`)), "ledger ids run R001… without a gap");
const lines = archive.split("\n");
const bad = rows.filter((r) => { const n = Number(r.split("|")[3]); return !/[⛔🔴]/.test(lines[n - 1] ?? ""); });
ok(bad.length === 0, bad.length ? `ledger rows point at the wrong archive line: ${bad.slice(0, 3).map((r) => r.split("|")[1].trim()).join(", ")}` : "every ledger row points at its rule's line in the archive");

/* the every-session safety rules stay in CLAUDE.md itself, not only in docs/rules */
for (const [re, label] of [
  [/whatsapp-status[^\n]*HELD|HELD[^\n]*whatsapp-status/i, "the held whatsapp-status webhook"],
  [/Never send real messages/i, "no real messages"],
  [/Never print[^\n]*secrets/i, "no secrets printed"],
  [/Move37's Meta app and number/, "the V1 WhatsApp number"],
  [/RLS is the only barrier/, "tenancy: RLS is the only barrier"],
  [/user_roles/, "role from user_roles only"],
  [/supabase db push/, "migrations one at a time"],
  [/Sign out is GLOBAL/, "global sign-out"],
] as const) ok(re.test(live), `CLAUDE.md itself keeps: ${label}`);

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
