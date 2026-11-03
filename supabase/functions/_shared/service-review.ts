// WHICH NAMES ARE SERVICES, AND WHICH PAGE IS ABOUT EACH (2026-11-03, src/lib/salesInsights.ts ServiceReview).
//
// One cheap model call per deep crawl, only when the site names enough services for a claim to be possible. The model reads
// names and page titles; the code still decides every claim. Any failure = not_reviewed = no claim about service pages.
import { logOpenAiUsage } from "./openai-usage.ts";
import type { ServiceReview } from "../../../src/lib/salesInsights.ts";

const MODEL = "gpt-4o-mini";
const REVIEW_TIMEOUT_MS = 20_000;
const MAX_NAMES = 60;
const MAX_PAGES = 60;

export interface ServiceReviewPage { url: string; title: string; heading: string }

/** The model's reply, checked: only names we asked about, only pages we showed it. Pure. */
export function cleanServiceReview(reply: unknown, names: readonly string[], pages: readonly ServiceReviewPage[]): ServiceReview {
  const r = (reply && typeof reply === "object" ? reply : {}) as { services?: unknown };
  if (!Array.isArray(r.services)) return { kind: "not_reviewed" };
  const asked = new Map(names.map((n) => [n.trim().toLowerCase(), n]));
  const urls = new Set(pages.map((p) => p.url));
  const real: string[] = [];
  const pageFor: Record<string, string> = {};
  for (const item of r.services as Array<{ name?: unknown; page?: unknown }>) {
    const name = asked.get(String(item?.name ?? "").trim().toLowerCase());
    if (!name) continue;
    real.push(name);
    if (typeof item.page === "string" && urls.has(item.page)) pageFor[name] = item.page;
  }
  return { kind: "reviewed", real, pageFor };
}

// deno-lint-ignore no-explicit-any
export async function reviewServices(service: any, input: {
  business: string | null; trade: string | null; names: readonly string[]; pages: readonly ServiceReviewPage[];
}): Promise<ServiceReview> {
  const key = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!key || !input.names.length) return { kind: "not_reviewed" };
  const names = input.names.slice(0, MAX_NAMES);
  const pages = input.pages.slice(0, MAX_PAGES);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You read headings taken from a small UK business's website. Decide which are services a customer could buy from this business. " +
              "NOT services: towns or areas, slogans, sentences, reasons to choose them, company policies such as health and safety, tools such as calculators, and product names in a shop. " +
              "For each real service, give the address of the page that is mainly about that service, from the pages listed, or null if none is. A page about a wider topic or several services is not its page. " +
              'Reply as JSON: {"services":[{"name":"<the heading exactly as given>","page":"<address or null>"}]}. Leave out anything that is not a service.',
          },
          { role: "user", content: JSON.stringify({ business: input.business, trade: input.trade, headings: names, pages }) },
        ],
      }),
    });
    if (!res.ok) { console.error(`[service-review] HTTP ${res.status}`); return { kind: "not_reviewed" }; }
    const j = await res.json();
    await logOpenAiUsage(service, {
      functionName: "crawl-worker", apiType: "openai_service_review", model: MODEL, triggerSource: "internal",
      promptTokens: Number(j?.usage?.prompt_tokens ?? 0), completionTokens: Number(j?.usage?.completion_tokens ?? 0),
    });
    return cleanServiceReview(JSON.parse(String(j?.choices?.[0]?.message?.content ?? "{}")), names, pages);
  } catch (e) {
    console.error("[service-review] failed:", (e as Error).message);
    return { kind: "not_reviewed" };
  } finally { clearTimeout(t); }
}
