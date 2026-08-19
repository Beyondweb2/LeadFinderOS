import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// review-reply — the stateless Review Reply Generator (2026-08-19, Paul's spec).
// Paste in a Google review -> ONE gpt-4o-mini call -> either a suggested reply to copy-paste into
// Google BY HAND, or a first-class DON'T-REPLY verdict with the reason (abusive / legal-safety /
// needs the client's own words / a canned reply would make it worse).
//
// ⛔ DELIBERATELY STATELESS AND GOOGLE-FREE. No review is stored, nothing reads or posts to any
// Google API — that is the later phase, gated on the GBP API access application. The verdict logic
// here carries straight over to that version.
//
// ⚠️ THE OPENAI ACCOUNT CAN BE OUT OF CREDITS (it is, at build time). That state returns the typed
// error "no_credits" so the page can say "top up" in a friendly banner instead of erroring ugly —
// and the moment credits exist this works again with NO redeploy.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = "gpt-4o-mini";
const MAX_REVIEW_CHARS = 4_000;

const SYSTEM_PROMPT =
`You help a UK local-business agency answer Google reviews for its clients. For each review you
either DRAFT a reply the operator will copy-paste into Google, or you say DO NOT REPLY and why.
You return ONLY structured data via the return_verdict tool — no prose outside it.

WHEN TO SAY DON'T REPLY (verdict "dont_reply") — this is a real, useful answer, not a failure:
- the review is abusive, threatening, or bait that any reply would feed;
- it raises legal or safety territory: an injury, property damage, an accusation of illegal or
  discriminatory conduct, a threat of court/press/regulator — the owner must handle it personally;
- it disputes specific facts only the business owner can know (what was quoted, what was said,
  what happened on the job) — a drafted reply would be guessing;
- it contains personal data that a public reply would amplify;
- it looks like spam or a fake review — the right move is reporting it, not replying;
- it is the kind of hostile negative where any templated reply reads as corporate and makes it
  worse. When genuinely unsure whether replying helps, choose dont_reply.
Give the reason in one or two plain sentences addressed to the operator.

WHEN YOU DRAFT (verdict "reply"), the rules:
- British English. Warm and human, never corporate.
- 2 to 4 sentences. Reference something SPECIFIC the reviewer said.
- NEVER promise outcomes or results. NEVER offer discounts, refunds or incentives (Google policy).
- Sign-off style: none needed; no placeholders like [Name]; write it ready to paste.
- Address the reviewer by first name only when their name is given and looks like a real name.
- POSITIVE reviews: thank them, echo the specific detail, welcome them back.
- NEGATIVE reviews you do draft for: acknowledge how it felt WITHOUT arguing, making excuses, or
  admitting/denying disputed specifics; invite them to continue the conversation directly
  (phone/email wording generic — invent no contact details). If that cannot be done safely,
  use dont_reply instead.
- Invent NOTHING: no details about the business or the job that are not in what you were given.`;

const VERDICT_TOOL = {
  type: "function",
  function: {
    name: "return_verdict",
    description: "Return either a drafted reply, or a don't-reply verdict with the reason.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["reply", "dont_reply"] },
        reply: { type: "string", description: "The drafted reply, ready to paste. Empty when verdict is dont_reply." },
        reason: { type: "string", description: "For dont_reply: why the operator should handle this personally. For reply: one short line on the approach taken." },
      },
      required: ["verdict", "reason"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Operator only — the page runs behind login and this endpoint spends OpenAI money.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const reviewText = typeof body.review_text === "string" ? body.review_text.trim() : "";
    if (!reviewText) return json({ ok: false, error: "review_text required" }, 400);
    const rating = Number.isInteger(body.star_rating) && body.star_rating >= 1 && body.star_rating <= 5
      ? (body.star_rating as number) : null;
    const businessName = typeof body.business_name === "string" ? body.business_name.trim().slice(0, 120) : "";

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    const userPrompt =
`${businessName ? `Business the review is about: ${businessName}\n` : ""}${rating ? `Star rating: ${rating} of 5\n` : "Star rating: not given\n"}
Google review (pasted verbatim):
"""
${reviewText.slice(0, MAX_REVIEW_CHARS)}
"""

Decide: draft a reply, or don't-reply. Return via return_verdict.`;

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [VERDICT_TOOL],
          tool_choice: { type: "function", function: { name: "return_verdict" } },
        }),
      });
    } catch (e) {
      return json({ ok: false, error: "openai_request_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      /* ⛔ THE NO-CREDITS STATE IS A TYPED ANSWER, NOT AN UGLY ERROR. The account is out of credit
         at build time (extract-competitors hit the same wall); the page renders this as a friendly
         "top up" banner, and the tool springs back to life the moment credits land — no redeploy. */
      const quota = res.status === 429 || /insufficient_quota|credit_balance_exhausted|no credits/i.test(txt);
      if (quota) return json({ ok: false, error: "no_credits" }, 200);
      return json({ ok: false, error: `openai_http_${res.status}`, detail: txt.slice(0, 200) }, 502);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (typeof raw !== "string") return json({ ok: false, error: "model_no_tool_output" }, 422);
    let parsed: { verdict?: unknown; reply?: unknown; reason?: unknown };
    try { parsed = JSON.parse(raw); } catch { return json({ ok: false, error: "model_bad_json" }, 422); }

    const verdict = parsed.verdict === "dont_reply" ? "dont_reply" : parsed.verdict === "reply" ? "reply" : null;
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    /* An absent/unknown verdict is never coerced into a reply (the absent-value rule): refuse. */
    if (!verdict) return json({ ok: false, error: "model_bad_verdict" }, 422);
    if (verdict === "reply" && !reply) return json({ ok: false, error: "model_empty_reply" }, 422);

    return json({ ok: true, verdict, reply: verdict === "reply" ? reply : null, reason: reason || null });
  } catch (e) {
    console.error("[review-reply] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
