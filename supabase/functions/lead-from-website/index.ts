import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { userTeamRole } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { SITE_CHECK_HEADERS } from "../../../src/lib/siteReadIdentity.ts";
import {
  FACTS_SYSTEM_PROMPT, combineFacts, htmlToText, isBlockedResponse, isSocialOrDirectory, keepStatedFacts, pagesWorthReading,
  readMarkup, websiteToRead, type FillResult,
} from "../../../src/lib/leadFromWebsite.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   lead-from-website (2026-11-14, v1/add-lead-from-website) — "Fill from website" on "Add a lead you found".

   Reads the pasted business website and returns the facts it STATES (name, trade, phone, email, address / town,
   services, areas). Saves NOTHING: the form fills its blank fields and the person still presses Add lead, which
   goes through sales_add_lead as before. Every rule is src/lib/leadFromWebsite.ts (tested there).

   ⛔ Both roles (admin + sales) — a team role is required; the cost guard ("enrich") runs before any fetch.
   ⛔ The HOMEPAGE is always read first, whatever path was pasted (the trade is the business, not one page), plus up
      to 3 same-site contact / about / services pages. Our one honest site-check identity (siteReadIdentity.ts).
   ⛔ SSRF: http(s) only, ports 80/443, private / internal hosts refused, redirects followed by hand (4 hops) and
      every hop re-checked.
   ⛔ A blocked reader (401 / 403 / 429 / a bot-check page) is returned as `blocked` and the model is never called.
      The form records it on the lead (its normal website check, crawl-check) once the lead is added.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_HOPS = 4;
const MAX_TEXT = 14_000;
const PER_PAGE_TEXT = 4_000;
const EST_COST_USD = 0.003;

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "0.0.0.0", "::1", "::", "metadata.google.internal"].includes(h)) return true;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(h)) return true;
  if (/^(127|10|0)\./.test(h) || h.startsWith("169.254.") || h.startsWith("192.168.")) return true;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  const m100 = h.match(/^100\.(\d+)\./);
  if (m100 && Number(m100[1]) >= 64 && Number(m100[1]) <= 127) return true;
  const first = Number(h.split(".")[0]);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && first >= 224) return true;
  if (/^(fc|fd|fe8|fe9|fea|feb|::ffff:)/.test(h)) return true;
  return false;
}

const hopAllowed = (u: URL) => /^https?:$/.test(u.protocol) && (!u.port || u.port === "80" || u.port === "443") && !isPrivateHostname(u.hostname);

interface Page { status: number; html: string; url: URL }

/** One page, redirects by hand (each hop re-checked), html / text only, size-capped. null = could not be read. */
async function fetchPage(start: URL): Promise<Page | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!hopAllowed(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url.href, { redirect: "manual", signal: controller.signal, headers: { ...SITE_CHECK_HEADERS } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel();
        if (!loc) return null;
        url = new URL(loc, url);
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (type && !/html|text\/plain|xml/i.test(type)) { await res.body?.cancel(); return { status: res.status, html: "", url }; }
      let html = "";
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let total = 0;
        while (total < MAX_HTML_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          html += decoder.decode(value, { stream: true });
        }
        reader.cancel().catch(() => {});
      }
      return { status: res.status, html, url };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;
    const role = await userTeamRole(userId);
    if (!role) return json({ ok: false, error: "no_role" }, 403);

    const body = await req.json().catch(() => ({}));
    const pasted = websiteToRead(typeof body?.website === "string" ? body.website : "");
    if (!pasted || isPrivateHostname(pasted.hostname)) return json({ ok: false, error: "bad_website", facts: {} } satisfies FillResult);
    if (isSocialOrDirectory(pasted)) return json({ ok: false, error: "not_own_website", facts: {} } satisfies FillResult);

    /* The cost guard before any fetch (suspension, pause modes, per-hour limit). */
    const guardService = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const guard = await guardAction(guardService, userId, "enrich", { fn: "lead-from-website", role, estCostUsd: EST_COST_USD });
    if (!guard.ok) return json(guard.body, guard.status);

    /* 1) The homepage, whatever path was pasted. */
    const homeUrl = new URL("/", pasted.origin);
    const home = await fetchPage(homeUrl);
    if (!home) return json({ ok: true, unreadable: true, facts: {} } satisfies FillResult);
    if (isBlockedResponse(home.status, home.html)) {
      console.log(`[lead-from-website] ${homeUrl.hostname}: blocked (HTTP ${home.status})`);
      return json({ ok: true, blocked: true, facts: {}, readUrl: home.url.href } satisfies FillResult);
    }
    if (home.status >= 400 || !home.html.trim()) return json({ ok: true, unreadable: true, facts: {}, readUrl: home.url.href } satisfies FillResult);

    /* 2) Up to 3 same-site contact / about / services pages (the pasted page counts, if it is not the homepage). */
    const others: string[] = [];
    const extra = pagesWorthReading(home.html, home.url, 3);
    if (pasted.pathname !== "/" && !extra.includes(pasted.href)) extra.unshift(pasted.href);
    for (const u of extra.slice(0, 3)) {
      let url: URL;
      try { url = new URL(u); } catch { continue; }
      if (url.hostname !== home.url.hostname) continue;
      const p = await fetchPage(url);
      if (p && p.status < 400 && p.html && !isBlockedResponse(p.status, p.html)) others.push(p.html);
    }

    const markup = readMarkup(home.html, others, home.url.hostname);
    const text = [htmlToText(home.html).slice(0, PER_PAGE_TEXT * 2), ...others.map((h) => htmlToText(h).slice(0, PER_PAGE_TEXT))].join("\n\n").slice(0, MAX_TEXT);

    /* 3) The model, literal only; every value it returns is checked against the same text (keepStatedFacts). A
          model failure costs only the model's fields — the markup facts still come back. */
    let model = {};
    const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (openAiKey && text.trim()) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini", temperature: 0, response_format: { type: "json_object" }, max_tokens: 1200,
            messages: [
              { role: "system", content: FACTS_SYSTEM_PROMPT },
              { role: "user", content: `Business name (if known): ${markup.name ?? "(unknown)"}\n\nWebsite text:\n${text}` },
            ],
          }),
        });
        clearTimeout(timer);
        if (r.ok) {
          const c = await r.json();
          model = keepStatedFacts(JSON.parse(c?.choices?.[0]?.message?.content ?? "{}"), text);
        } else {
          console.error(`[lead-from-website] OpenAI ${r.status}`);
        }
      } catch (e) {
        console.error(`[lead-from-website] model failed: ${String(e).slice(0, 200)}`);
      }
    }

    const facts = combineFacts(home.html, markup, model);
    return json({ ok: true, facts, readUrl: home.url.href, pagesRead: 1 + others.length } satisfies FillResult);
  } catch (e) {
    console.error("[lead-from-website] error:", e);
    return json({ ok: false, error: "internal", facts: {} }, 500);
  }
});
