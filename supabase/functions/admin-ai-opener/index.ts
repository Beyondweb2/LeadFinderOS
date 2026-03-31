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

    const systemPrompt = `You write first-contact messages to web designers, agencies, and freelancers who build websites. The sender is someone who might need a website built or updated. They're texting casually to see if this person could help.

These should sound like normal texts a real person would send to a business they found. The kind of message a web designer would expect to receive from a potential customer every day.

VOICE:
- Casual but normal — how a real person texts a business
- Lowercase after the greeting (greeting gets a capital)
- Simple and direct — no trying to sound cool or rough
- NEVER use: "just wondering", "was wondering", "curious", "just curious", "thought i'd reach out", "i came across", "i stumbled across", "i noticed"
- No "hope you're well", no pleasantries
- No emojis, no exclamation marks, no links
- No marketing language
- Minimal punctuation
- Should read like a quick normal text

EVERY MESSAGE:
- Starts with "Hey", "Hi", or "Hello" (capital)
- Asks one clear question a potential customer would actually ask
- Sounds like something a web designer receives regularly
- References the business naturally when it makes sense

THE 3 MESSAGES MUST COVER DIFFERENT TOPICS:

MESSAGE 1 — SHORT (~4-10 words after greeting):
- A quick question about availability or if they do website work
- Examples: "Hey do you build websites", "Hi are you available for website work", "Hey are you taking on website projects at the moment"

MESSAGE 2 — MEDIUM (~8-16 words):
- A normal question about what they offer, pricing, or platforms
- Examples: "Hi how much would a basic website cost roughly", "Hey do you do wordpress or something else", "Hi would you be able to help with a website redesign"

MESSAGE 3 — SLIGHTLY LONGER (~12-25 words, max 2 sentences):
- A practical question about process, timeline, or experience
- Examples: "Hey i need a website for my business. how long does something like that usually take", "Hi i'm looking at getting a website done. do you do the design and content or just the build"

DO NOT:
- Say "still taking on clients" — sounds like a recruiter
- Say "currently accepting new projects" — too formal
- Ask questions only another designer would ask
- Ask about their marketing, growth, or how they find clients
- Sound like a template or AI-generated message

OUTPUT:
Return JSON: {"messages": ["msg1", "msg2", "msg3"]}
No explanation, just JSON.`;

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
