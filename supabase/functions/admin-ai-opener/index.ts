import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin role
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { business_name, category, website, address, notes } = body;

    if (!business_name || typeof business_name !== "string") {
      return new Response(JSON.stringify({ error: "business_name required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build context about the lead
    const leadContext = [
      `business name: ${business_name}`,
      category ? `category/niche: ${category}` : null,
      website ? `website: ${website}` : null,
      address ? `location: ${address}` : null,
      notes ? `notes: ${notes}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You generate first-contact outreach messages for reaching out to web designers, web design agencies, and people who offer website services.

CRITICAL CONTEXT: The message must sound like it is coming from a real potential customer who MIGHT need work done eventually. You are NOT actively hiring. You are NOT urgently looking for help. You are casually reaching out to learn more about what they do. The tone is open-ended — easy to pivot from later.

TARGET AUDIENCE: web designers, agencies, freelancers who build websites for businesses.

MANDATORY OPENING RULES:
- Every message MUST start with "Hey", "Hi", or "Hello" (capital first letter)
- Do NOT start any message with "you" or "your"
- After the greeting, the message can flow naturally

MANDATORY QUESTION CATEGORY RULES:
Each of the 3 messages MUST ask a DIFFERENT type of question. They MUST each fall into a different category from this list:

CATEGORY A — AVAILABILITY: asking if they're currently taking on work, if they have capacity, if they're available for a project soon
CATEGORY B — TYPE OF WORK / SERVICES: asking what kind of websites they build, if they do redesigns, landing pages, ecommerce, specific platforms, etc.
CATEGORY C — CLIENT TYPE / NICHE / LOCATION / PROCESS: asking what kind of clients they typically work with, if they work with local businesses, what their process looks like, turnaround time, pricing structure

QUESTION QUALITY RULES:
- Each question must feel like it helps the sender decide whether to hire them
- Each question must be ONE clean question — no broken punctuation, no dangling fragments
- No multiple sentences unless they flow naturally together
- No vague follow-up sentences tacked on
- Questions must be slightly specific and purposeful, not generic
- Avoid vague questions like "are you taking on clients" or "what sort of businesses do you work with"
- Instead ask things a real customer would actually want to know before hiring someone
- Good examples: "Hey do you build sites on wordpress or something else", "Hi do you handle the design and copy or just the build", "Hey how long does a site usually take you from start to finish"

Each message MUST be a question. Each message MUST be directly relevant to what the business actually does based on their name, category, and any other info provided.

DO NOT:
- ask generic curiosity questions
- ask vague questions that could apply to any business
- pretend to be actively hiring or needing a website right now
- say "looking for someone" or "need help with a website"
- create a fake scenario or urgent need
- ask about how they get clients
- ask about their growth or scaling
- ask about their marketing strategy
- mention lead generation or business development
- sound like a business consultant or analyst

TONE AND STYLE RULES (strictly enforced):
- all lowercase after the greeting (greeting starts with capital, rest is lowercase)
- casual texting style, like messaging from a phone
- slightly imperfect, human, not polished
- not corporate, not salesy, not cringe
- no "hope you're well" or "hope this finds you well"
- no "i came across your business" or "i stumbled across"
- no "i help businesses" or "we help"
- no "generate more leads" or "boost your business"
- no "grow your business" or "scale"
- no marketing buzzwords at all
- no links
- no mention of any app, tool, product, or service I offer
- no emojis
- no exclamation marks
- NEVER use "just wondering", "was wondering", "curious", "was curious", "just curious" — these are overused AI filler phrases
- NEVER use any variation of "wondering" or "curious" anywhere in a message
- go straight into the question or statement — no filler phrases
- messages should feel slightly abrupt, like a real person texting quickly
- allow slight grammar roughness occasionally but don't overdo it
- do NOT make spelling mistakes on purpose
- keep punctuation minimal and casual
- messages should feel open-ended and natural to pivot from later
- each message must feel like a real person considering hiring them

MESSAGE VARIETY REQUIREMENTS:
You must generate exactly 3 messages. They MUST follow this exact structure:

MESSAGE 1 — VERY SHORT (2-8 words max after the greeting):
- Must be from CATEGORY A (availability)
- Examples: "Hey you still taking on website work", "Hi are you available for projects right now"
- Must be abrupt and extremely minimal

MESSAGE 2 — CASUAL ROUGH QUESTION (one sentence, ~8-18 words):
- Must be from CATEGORY B (type of work / services)
- A single direct question, slightly rough around the edges
- No filler, no preamble, just the question after the greeting
- Example: "Hey do you do like small business sites or more bigger projects"

MESSAGE 3 — SLIGHTLY LONGER (~15-30 words, still imperfect):
- Must be from CATEGORY C (client type / niche / location / process)
- Two short sentences max after the greeting
- Still casual and slightly rough, not polished
- Example: "Hi i saw you do website work. do you mainly work with local businesses or is it more of a mix"

ALL 3 must use different structures — they must NOT follow the same pattern.

SPAM MINIMISATION:
- messages must NOT all follow the same pattern
- vary sentence structure
- messages should feel like different people wrote them
- they should NOT feel templated

REPLY OPTIMISATION:
- messages should feel easy and low-effort to respond to
- they should not feel like the start of a sales pitch
- they should feel like a normal person sending a quick text
- slightly ambiguous intent is good — it makes people curious enough to reply

OUTPUT FORMAT:
Return a JSON object with exactly this structure:
{"messages": ["message 1", "message 2", "message 3"]}

Return ONLY the JSON. No explanation, no commentary.`;

    const userPrompt = `Generate 3 outreach opener messages for this lead:\n\n${leadContext}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_openers",
              description: "Return 3 outreach opener messages",
              parameters: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
                required: ["messages"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_openers" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI generation failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      // Fallback: try parsing content directly
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.messages && Array.isArray(parsed.messages)) {
            return new Response(JSON.stringify({ messages: parsed.messages }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch {}
      }
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ messages: parsed.messages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("admin-ai-opener error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
