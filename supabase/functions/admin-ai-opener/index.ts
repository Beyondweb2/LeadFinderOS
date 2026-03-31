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

    const systemPrompt = `You write first-contact messages to web designers / agencies / freelancers who build websites. The sender is a potential customer casually reaching out — NOT actively hiring, NOT urgently looking. Just feeling things out.

VOICE & FEEL:
- Write like someone texting from their phone while doing something else
- Lowercase after the greeting word (which gets a capital letter)
- Slightly rough, slightly lazy — real people don't write perfectly
- No filler phrases: NEVER use "just wondering", "was wondering", "curious", "was curious", "just curious", "i was thinking", "thought i'd reach out"
- No "i came across", "i stumbled across", "i noticed"
- No "hope you're well", "hope this finds you"
- No emojis, no exclamation marks, no links
- No marketing language, no "grow", "scale", "boost", "generate leads"
- Don't mention any product, tool, app, or service the sender offers
- Punctuation is minimal — a question mark at the end is fine but not required
- Occasional rough grammar is good (e.g. "do you do like" or "or is it more") but don't force errors

CRITICAL RULES:
- Every message starts with "Hey", "Hi", or "Hello" (capital)
- Each message MUST ask a question
- Each message must feel like a DIFFERENT person wrote it
- Questions must be specific enough to show the sender actually looked at the business
- Use the business name, category, or other details naturally when it makes sense
- Messages should feel easy to reply to — low effort, low pressure

THE 3 MESSAGES MUST EACH BE DIFFERENT IN STRUCTURE AND TOPIC:

MESSAGE 1 — SUPER SHORT (under 8 words after greeting):
- Topic: availability or if they're doing website work right now
- Should feel like a quick text someone fires off
- Vary it — don't always say "taking on clients" or "taking on work"
- Examples of variety: "Hey you doing website work at the moment", "Hi are you available for a project", "Hey you booked up or taking on stuff"

MESSAGE 2 — ONE CASUAL QUESTION (~8-18 words):
- Topic: what kind of website work they do, what platforms, what type of builds
- One sentence, slightly rough
- Examples: "Hey do you just do like full websites or do you do landing pages too", "Hi do you work with wordpress or do you code everything custom"

MESSAGE 3 — SLIGHTLY LONGER (~15-30 words, max 2 sentences):
- Topic: their process, turnaround, what kind of clients they work with, pricing ballpark
- Still casual, still imperfect
- Examples: "Hi i saw you do website work. roughly how long does a project usually take you from start to finish", "Hey do you mostly work with small businesses or bigger companies. just trying to get a feel for what you do"

ANTI-PATTERNS (do NOT produce these):
- "Hey still taking on clients" — overused, sounds like a recruiter
- "Hey are you currently accepting new projects" — too formal
- "Hi do you build custom sites or work with platforms too" — too clean and balanced
- Any message that sounds like it could be a template
- Starting message 3 with "i saw you do web development" every time

OUTPUT:
Return a JSON object: {"messages": ["msg1", "msg2", "msg3"]}
Return ONLY the JSON. No explanation.`;

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
