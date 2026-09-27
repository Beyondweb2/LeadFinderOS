/* Edge functions are pinned to the database's region (2026-09-27, src/lib/edgeRegion.ts). */
import fs from "node:fs";
import path from "node:path";
import { pinFunctionRegion, regionPinnedFetch, EDGE_FUNCTION_REGION } from "../src/lib/edgeRegion.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const S = "https://ruusxpkkmwtljxxulhbq.supabase.co";

ok(EDGE_FUNCTION_REGION === "eu-west-1", "pinned to the database's region (eu-west-1)");
ok(pinFunctionRegion(`${S}/functions/v1/market-view`, S) === `${S}/functions/v1/market-view?forceFunctionRegion=eu-west-1`, "an edge-function URL gets forceFunctionRegion");
ok(pinFunctionRegion(`${S}/functions/v1/x?a=1`, S) === `${S}/functions/v1/x?a=1&forceFunctionRegion=eu-west-1`, "existing query parameters are kept");
ok(pinFunctionRegion(`${S}/functions/v1/x?forceFunctionRegion=us-east-1`, S) === `${S}/functions/v1/x?forceFunctionRegion=us-east-1`, "an explicit region is not overridden");
for (const other of [`${S}/rest/v1/outreach_leads?select=id`, `${S}/auth/v1/user`, `${S}/storage/v1/object/sign/x`, "https://example.com/functions/v1/x", `${S}/functionsX/v1/x`]) {
  ok(pinFunctionRegion(other, S) === other, `untouched: ${other.replace(S, "")}`);
}

// The fetch wrapper: edge calls pinned, everything else identical; no x-region header ever added.
{
  const seen: Array<{ url: string; headers: string[] }> = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    seen.push({ url, headers: [...h.keys()] });
    return new Response("{}");
  }) as typeof fetch;
  const pinned = regionPinnedFetch(S);
  await pinned(`${S}/functions/v1/coverage`, { method: "POST", headers: { authorization: "Bearer x" } });
  await pinned(new URL(`${S}/functions/v1/team`));
  await pinned(new Request(`${S}/functions/v1/page-generator`, { method: "POST", body: "{}" }));
  await pinned(`${S}/rest/v1/ai_audits?select=id`);
  globalThis.fetch = orig;
  ok(seen[0].url.endsWith("/functions/v1/coverage?forceFunctionRegion=eu-west-1"), "string URL pinned");
  ok(seen[1].url.endsWith("/functions/v1/team?forceFunctionRegion=eu-west-1"), "URL object pinned");
  ok(seen[2].url.endsWith("/functions/v1/page-generator?forceFunctionRegion=eu-west-1"), "Request object pinned");
  ok(seen[3].url === `${S}/rest/v1/ai_audits?select=id`, "a database read passes through unchanged");
  ok(seen.every((s) => !s.headers.includes("x-region")), "no x-region header (it would fail every function's CORS preflight)");
}

// Wired into the one Supabase client.
{
  const client = fs.readFileSync(path.join(import.meta.dirname, "../src/integrations/supabase/client.ts"), "utf8");
  ok(/import \{ regionPinnedFetch \} from '@\/lib\/edgeRegion';/.test(client) && /global: \{ fetch: regionPinnedFetch\(SUPABASE_URL\) \}/.test(client), "the Supabase client uses the pinned fetch");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
