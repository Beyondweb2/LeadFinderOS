import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// enrich-directory-business — admin-triggered. Writes a factual, AI-written 2-3 sentence description
// onto directory_businesses rows (used by the category + business pages). For each business it gathers
// the scraped data and, if the business has a website, BEST-EFFORT fetches it (short timeout; failures
// are expected and ignored) to give the model real content. OpenAI is called DIRECTLY (gpt-4o,
// tool-calling — mirrors generate-report). Auth + service client mirror scrape-directory.
//
// Body: { businessId } → enrich that one row. { niche, area } → enrich up to MAX_PER_CALL rows in that
// niche+area that still lack a description. HONESTY: the prompt binds the model to the supplied data +
// website text only — no invented services/reviews/awards.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gpt-4o";
const MAX_PER_CALL = 15;           // cap batch size so the function doesn't time out
const SITE_FETCH_TIMEOUT_MS = 8_000;
const SITE_TEXT_CAP = 3_000;       // chars of visible site text fed to the model

// deno-lint-ignore no-explicit-any
type Row = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const DESCRIBE_TOOL = {
  type: "function",
  function: {
    name: "return_description",
    description: "Return a factual directory-listing description for this one business.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "A factual 2-3 sentence description of the business for a directory listing. British English, no marketing fluff.",
        },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT =
`You are writing a short, FACTUAL description of ONE business for a UK business-directory listing.

RULES (follow exactly):
- Write 2-3 plain sentences. Factual and useful — no marketing fluff, no superlatives, no calls to action.
- Use ONLY the information provided (the business data + any website content given). NEVER invent services, reviews, ratings, awards, years in business, client numbers, or any claim not present in the input.
- British English. Keep proper names, place names and professional bodies in their normal form.
- If the input is thin, write a SHORTER, honest description from just the data (e.g. type + location). A short accurate description beats a padded one.
- Describe what the business is and does, who it serves, and where — grounded strictly in the input.

Return the description via the return_description tool — output nothing else.`;

/** Strip a fetched HTML page down to visible text: drop script/style/head, remove tags, collapse
 *  whitespace, cap length. Best-effort — good enough to give the model real content to summarise. */
function htmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = noScript
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, SITE_TEXT_CAP);
}

/** Best-effort fetch of a business website → visible text. Any failure (timeout, block, non-200,
 *  non-HTML) returns "" — the caller just proceeds with the scraped data only. */
async function fetchSiteText(website: string): Promise<string> {
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SITE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FindableDirectoryBot/1.0)", "Accept": "text/html" },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return "";
    const html = await res.text();
    return htmlToText(html);
  } catch {
    return ""; // timeout / DNS / block / abort — expected for many sites
  } finally {
    clearTimeout(timer);
  }
}

/** Compose the model's user message from a business row + optional site text. */
function composeInput(b: Row, siteText: string): string {
  const lines: string[] = ["BUSINESS DATA (use ONLY these facts — invent nothing not listed here):"];
  const push = (label: string, val: unknown) => { const s = str(val); if (s) lines.push(`${label}: ${s}`); };
  push("Name", b.name);
  push("Type / category", b.category);
  push("Niche", b.niche);
  push("City / area", b.city || b.area);
  push("Address", b.address);
  push("Website", b.website);
  if (typeof b.rating === "number" && isFinite(b.rating)) {
    const rc = typeof b.review_count === "number" && b.review_count > 0 ? ` from ${b.review_count} reviews` : "";
    lines.push(`Rating: ${b.rating.toFixed(1)} out of 5${rc}`);
  }
  if (siteText) {
    lines.push("");
    lines.push("WEBSITE CONTENT (visible text from the business's own site — use for accuracy, do not copy verbatim):");
    lines.push(siteText);
  }
  lines.push("");
  lines.push("Write the factual 2-3 sentence directory description from ONLY the above.");
  return lines.join("\n");
}

/** Generate one description via OpenAI (direct, tool-calling). Returns "" on any failure. */
async function generateDescription(b: Row, siteText: string, openaiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: composeInput(b, siteText) },
        ],
        tools: [DESCRIBE_TOOL],
        tool_choice: { type: "function", function: { name: "return_description" } },
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (typeof raw !== "string") return "";
    const parsed = JSON.parse(raw);
    return str(parsed.description);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: require an authenticated ADMIN user (mirrors scrape-directory). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const { data: roleRow } = await service
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);

    // --- Body: one business (businessId) OR a whole niche+area batch. ---
    const body = await req.json().catch(() => ({}));
    const businessId: string = typeof body.businessId === "string" ? body.businessId.trim() : "";
    const niche: string = typeof body.niche === "string" ? body.niche.trim().toLowerCase() : "";
    const area: string = typeof body.area === "string" ? body.area.trim().toLowerCase() : "";

    const cols = "id, niche, area, name, category, city, address, website, rating, review_count, description";
    let targets: Row[] = [];
    if (businessId) {
      const { data } = await service.from("directory_businesses").select(cols).eq("id", businessId).maybeSingle();
      if (!data) return json({ ok: false, error: "business_not_found" }, 404);
      targets = [data];
    } else if (niche && area) {
      // Only rows still lacking a description; capped so the call can't time out.
      const { data } = await service
        .from("directory_businesses").select(cols)
        .eq("niche", niche).eq("area", area).is("description", null)
        .limit(MAX_PER_CALL);
      targets = Array.isArray(data) ? data : [];
    } else {
      return json({ ok: false, error: "businessId or (niche and area) required" }, 400);
    }

    if (targets.length === 0) return json({ ok: true, enriched: 0, message: "nothing to enrich" });

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    let enriched = 0;
    for (const b of targets) {
      const website = str(b.website);
      const siteText = website ? await fetchSiteText(website) : "";
      const description = await generateDescription(b, siteText, OPENAI_API_KEY);
      if (!description) continue; // model/parse failure → leave this one for a later retry
      const { error } = await service
        .from("directory_businesses")
        .update({ description, description_generated_at: new Date().toISOString() })
        .eq("id", b.id);
      if (!error) enriched++;
    }

    return json({ ok: true, enriched, considered: targets.length });
  } catch (e) {
    console.error("enrich-directory-business error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
