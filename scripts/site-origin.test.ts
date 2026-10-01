/* ============================================================
   WHERE DOES THE SITE LIVE? — the origin every server-built onboarding link is joined to.

   Runs under tsx (a Deno.env stand-in, below) or under Deno:
      npx deno run --allow-env --allow-read --sloppy-imports scripts/site-origin.test.ts

   🔴 THE BUG THIS PINS (measured 2026-09-03): resolveSiteOrigin fell back to the FIRST entry of
   FINDABLE_ALLOWED_ORIGINS, which is findable-checkout's CORS ALLOWLIST and legitimately contains
   preview hosts. 27 of the 47 onboarding links ever sent went out on findable-site.pages.dev, and
   every one of those was server-built - including a re_engage to a real prospect on 2026-08-31.
   The 20 that read findable.live were all typed by the operator by hand.

   The third case below is that exact shape and is the reason the file exists.
   ============================================================ */
import { resolveSiteOrigin } from "../supabase/functions/_shared/onboarding-followup.ts";

/* 🔴 RUNS UNDER NODE TOO (2026-10-02). Deno is not installed on Paul's machine, so this suite was a
   permanent "known failure" there and guarded nothing. resolveSiteOrigin reads Deno.env.get only when
   CALLED (no module-level Deno), so a three-method stand-in for Deno.env exercises the SAME function
   with the same inputs. Under real Deno the stand-in is never installed. */
type EnvShim = { get(k: string): string | undefined; set(k: string, v: string): void; delete(k: string): void };
if (typeof (globalThis as { Deno?: unknown }).Deno === "undefined") {
  const store = new Map<string, string>();
  const env: EnvShim = { get: (k) => store.get(k), set: (k, v) => { store.set(k, v); }, delete: (k) => { store.delete(k); } };
  (globalThis as unknown as { Deno: { env: EnvShim } }).Deno = { env };
}

const CASES: Array<[string, string | undefined, string | undefined, string | null]> = [
  ["primary set correctly",           "https://findable.live", undefined, "https://findable.live"],
  ["primary with trailing slash",     "https://findable.live/", undefined, "https://findable.live"],
  ["THE BUG: preview first in CORS",  undefined, "https://findable-site.pages.dev,https://findable.live", "https://findable.live"],
  ["preview first, spaces in list",   undefined, " https://findable-site.pages.dev , https://findable.live ", "https://findable.live"],
  ["ONLY a preview in the list",      undefined, "https://findable-site.pages.dev", null],
  ["only localhost in the list",      undefined, "http://localhost:4321", null],
  ["only a workers.dev preview",      undefined, "https://x.workers.dev", null],
  ["nothing set at all",              undefined, undefined, null],
  ["primary wins over the list",      "https://findable.live", "https://other.example", "https://findable.live"],
  ["primary deliberately a preview",  "https://findable-site.pages.dev", undefined, "https://findable-site.pages.dev"],
  ["primary not an absolute origin",  "findable.live", undefined, null],
];
let f = 0;
for (const [label, prim, list, want] of CASES) {
  if (prim === undefined) Deno.env.delete("FINDABLE_SITE_ORIGIN"); else Deno.env.set("FINDABLE_SITE_ORIGIN", prim);
  if (list === undefined) Deno.env.delete("FINDABLE_ALLOWED_ORIGINS"); else Deno.env.set("FINDABLE_ALLOWED_ORIGINS", list);
  const got = resolveSiteOrigin();
  const ok = got === want;
  if (!ok) f++;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label.padEnd(32)} -> ${String(got)}${ok ? "" : `   WANTED ${String(want)}`}`);
}
console.log(f === 0 ? "\n  ALL PASS" : `\n  ${f} FAILURES`);
