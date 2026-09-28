/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EVERY EDGE FUNCTION HAS ITS config.toml ENTRY (2026-09-28).

   ⛔ The failure this guards: a function deployed with no [functions.<name>] entry takes the platform
   default verify_jwt = TRUE on its next plain redeploy. Twelve were missing on 2026-09-28, two of them
   (send-whatsapp-message, enrich-business) FALSE in production — a redeploy would have locked out their
   callers. The values were recorded from the live `supabase functions list`; this test keeps the file
   complete, and pins the two that must stay open.
   Plus the paid-client write rule (migration 20260928240000): restrictive admin-only policies.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = new URL("../", import.meta.url);
const cfg = readFileSync(new URL("supabase/config.toml", root), "utf8").replace(/\r\n/g, "\n").replace(/#.*$/gm, "");
const entries = new Map<string, string | undefined>();
for (const m of cfg.matchAll(/\[functions\.([\w-]+)\]([^[]*)/g)) {
  ok(!entries.has(m[1]), `${m[1]} has ONE entry`);
  entries.set(m[1], m[2].match(/verify_jwt\s*=\s*(true|false)/)?.[1]);
}
const fnDir = new URL("supabase/functions/", root);
const fns = readdirSync(fnDir).filter((d) => !d.startsWith("_") && existsSync(new URL(`${d}/index.ts`, fnDir)));
for (const d of fns) ok(entries.get(d) === "true" || entries.get(d) === "false", `${d} has an explicit verify_jwt`);
ok(entries.get("send-whatsapp-message") === "false", "send-whatsapp-message stays verify_jwt = false (its handler authenticates)");
ok(entries.get("enrich-business") === "false", "enrich-business stays verify_jwt = false (bulk-jobs calls it with CRON_SECRET)");
ok(entries.get("resend-webhook") === "false" && entries.get("stripe-webhook") === "false", "the two webhooks stay public (signature-gated)");

const mig = readFileSync(new URL("supabase/migrations/20260928240000_client_tables_admin_only.sql", root), "utf8");
for (const t of ["client_pages", "client_page_questions", "client_listings"]) {
  for (const c of ["insert", "update", "delete"]) {
    ok(new RegExp(`on public\\.${t} as restrictive for ${c} to authenticated[\\s\\S]*?my_role\\(\\)\\) = 'admin'`).test(mig), `${t}: ${c} is admin-only (restrictive)`);
  }
}
ok(!/\bdrop\b|\bdelete from\b/i.test(mig), "the migration only adds policies");

console.log(f ? `\n${f} FAILURE(S)` : "\nall passed");
if (f) process.exit(1);
