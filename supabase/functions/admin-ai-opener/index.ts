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

CRITICAL CONTEXT: The user (me) is NOT trying to sell them a website. I am NOT a client looking for web design. I am reaching out to start a natural conversation that could eventually lead to discussing my lead generation tool — but the FIRST message must NOT mention any tool, app, product, or service I offer.

The goal of the first message is simply to get a reply. That's it.

TARGET AUDIENCE: web designers, agencies, freelancers who build websites for businesses.

TONE AND STYLE RULES (strictly enforced):
- all lowercase
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
- no mention of any app, tool, product, or service
- no emojis
- no exclamation marks
- avoid every message being a direct question
- some messages can be statements or soft observations
- allow slight grammar roughness occasionally but don't overdo it
- do NOT make spelling mistakes on purpose
- keep punctuation minimal and casual

MESSAGE VARIETY REQUIREMENTS:
You must generate exactly 3 messages. Each must be distinctly different in:
- length (one short ~5-15 words, one medium ~15-30 words, one can be ~25-45 words)
- structure (not all should start with "hey" or "hi")
- approach type — pick 3 DIFFERENT approaches from this list:
  * identity check ("hi is this [business]")
  * role check ("you still doing websites yeah")  
  * light observation about their site/work
  * casual question about their client type
  * checking if they're still active
  * soft neutral opener
  * slightly ambiguous opener that could be from a potential referral or peer

SPAM MINIMISATION:
- messages must NOT all follow the same pattern
- vary sentence structure
- some should start with a greeting, some should not
- not every message should contain a question
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
