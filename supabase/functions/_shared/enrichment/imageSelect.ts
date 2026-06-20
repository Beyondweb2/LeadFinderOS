/**
 * AI image selection for generated trade sites (sub-phase 2B).
 *
 * ONE gpt-4o-mini vision call scores the whole candidate pool at once (cheaper +
 * more consistent than per-slot calls): each image gets a quality score and a
 * per-slot fit score. Code then does a DETERMINISTIC assignment from those scores
 * — best-fit per slot, no image reused, quality breaks ties, junk never assigned.
 *
 * Honesty: only real pooled photos are ever chosen; a slot with no image above
 * threshold is left UNSET so the template falls back to stock (a real photo is
 * used only when it's actually good — never forced junk to fill a slot).
 *
 * Graceful: scorePool returns null on any error / no key so the caller falls back
 * to its existing assignment and generate never breaks.
 *
 * Currently wired for the PLUMBER template only (slot intents below are plumber-
 * specific). Barber/salon keep their existing assignment untouched.
 */

export type Slot = "hero" | "about" | "whyUs" | "gallery";

export interface SlotFit {
  hero: number;
  about: number;
  whyUs: number;
  gallery: number;
}

export interface ScoredImage {
  i: number;
  url: string;
  quality: number; // 0-100
  fit: SlotFit; // 0-100 per slot
  flags: string[];
}

export interface SlotAssignment {
  hero?: string;
  about?: string;
  whyUs?: string;
  gallery: string[];
}

// Max images sent to the vision model — bounds cost + latency. Pool order is
// Maps → Facebook → Instagram (the enrich-business imagePool), so the first N are
// the most likely to be the business's own/strongest shots.
const MAX_POOL = 16;

// Thresholds (tunable). A real photo must clear QUALITY_MIN to be usable at all;
// about/whyUs additionally require a real slot fit. Hero has a relaxed fallback
// (see assignSlots) so the single best decent photo always fills the most
// important slot rather than leaving it on stock.
const QUALITY_MIN = 50;
const FIT_MIN = 55;

// Flags that mean "not a usable marketing photo" — never assigned to any slot.
const JUNK_FLAGS = new Set(["logo", "screenshot", "text"]);

/**
 * The vision instruction — this IS the feature. Slot intents are written for a
 * plumbing/heating company so the model rewards on-brand trade shots, not just
 * "professional photos". Edit here to tune selection behaviour.
 */
const VISION_PROMPT = `You are selecting photographs for a professional plumbing & heating company's marketing website. You will be shown candidate images in order (index 0, 1, 2, ...). Score EVERY image.

QUALITY (0-100): reward sharp, well-lit, professional-looking REAL photographs. Score below 30 and add the matching flag for: company logos or wordmarks (logo), screenshots of apps/websites/reviews (screenshot), graphics that are mostly text or promotional banners (text), blurry/dark/low-resolution shots (blurry), and generic stock-looking imagery (stock). A real photo of the actual business or its work always beats a graphic.

For each image, score how well it fits each website SLOT (0-100):
- hero: a WIDE, inviting establishing shot. Best = a clean exterior (shopfront, signage, or a branded work van) OR a strong wide interior. It sets the scene and must look welcoming at large size. A tight close-up is a poor hero.
- about: PEOPLE / TEAM / human atmosphere. Best = the team or a worker (faces, or people on the job), or a warm interior that conveys who they are.
- whyUs: a CLOSE-UP TRADE / CRAFTSMANSHIP detail — the on-brand "our work" shot. Best = a boiler or heating install, pipework, a bathroom fit-out, a radiator/valve/tap close-up, or work-in-progress on a job. Reward images that clearly show plumbing/heating work or a finished install.
- gallery: any other good-quality real photo of the business or its work.

FLAGS: list every tag that applies per image, from: logo, screenshot, text, blurry, stock, person, exterior, interior, detail, work.

Return ONLY JSON in exactly this shape, with one entry per image, every index included exactly once:
{"images":[{"i":0,"quality":0,"fit":{"hero":0,"about":0,"whyUs":0,"gallery":0},"flags":[]}]}`;

function clamp01_100(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Score a pool of image URLs in a single gpt-4o-mini vision call.
 * Returns one ScoredImage per (capped) input URL, or null on any failure.
 */
export async function scorePool(
  urls: string[],
  opts: { openAiKey: string; max?: number; timeoutMs?: number },
): Promise<ScoredImage[] | null> {
  const pool = urls.filter((u) => typeof u === "string" && u).slice(0, opts.max ?? MAX_POOL);
  if (!pool.length || !opts.openAiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  try {
    const content: unknown[] = [{ type: "text", text: VISION_PROMPT }];
    pool.forEach((url) => content.push({ type: "image_url", image_url: { url, detail: "low" } }));

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[imageSelect] vision HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;

    const parsed = JSON.parse(raw) as { images?: unknown[] };
    const rows = Array.isArray(parsed.images) ? parsed.images : [];
    const byIndex = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      const o = (r ?? {}) as Record<string, unknown>;
      if (typeof o.i === "number" && o.i >= 0 && o.i < pool.length) byIndex.set(o.i, o);
    }

    // Map every pooled URL → a ScoredImage (missing rows score 0 = unusable).
    return pool.map((url, i) => {
      const o = byIndex.get(i) ?? {};
      const fitRaw = (o.fit ?? {}) as Record<string, unknown>;
      const flags = Array.isArray(o.flags)
        ? (o.flags.filter((f) => typeof f === "string") as string[]).map((f) => f.toLowerCase())
        : [];
      return {
        i,
        url,
        quality: clamp01_100(o.quality),
        fit: {
          hero: clamp01_100(fitRaw.hero),
          about: clamp01_100(fitRaw.about),
          whyUs: clamp01_100(fitRaw.whyUs),
          gallery: clamp01_100(fitRaw.gallery),
        },
        flags,
      };
    });
  } catch (e) {
    console.error(`[imageSelect] vision error: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const isJunk = (s: ScoredImage) => s.flags.some((f) => JUNK_FLAGS.has(f));
const combined = (s: ScoredImage, slot: Slot) => s.fit[slot] * 0.6 + s.quality * 0.4;

/**
 * Deterministic slot assignment from the vision scores.
 *
 * - hero is filled FIRST and never left empty when any decent photo exists: it
 *   takes the best hero-fitting usable image, or — if none clears the fit gate —
 *   the highest-quality usable image (the single best photo → the most important
 *   slot). Tight close-ups etc. still beat stock here.
 * - about / whyUs are STRICT: a usable image must also clear the slot-fit gate, or
 *   the slot is left unset (→ template stock). Weak slots fall to stock rather
 *   than getting forced junk.
 * - junk (logo/screenshot/text) or below-QUALITY_MIN images are never assigned.
 * - no image is used in two slots; quality breaks ties.
 */
export function assignSlots(scored: ScoredImage[], opts?: { maxGallery?: number }): SlotAssignment {
  const usable = scored.filter((s) => s.quality >= QUALITY_MIN && !isJunk(s));
  const used = new Set<number>();

  const pickFit = (slot: Slot): ScoredImage | null => {
    const cands = usable
      .filter((s) => !used.has(s.i) && s.fit[slot] >= FIT_MIN)
      .sort((a, b) => combined(b, slot) - combined(a, slot));
    if (cands.length) { used.add(cands[0].i); return cands[0]; }
    return null;
  };

  // hero: fit-gated best, else best-quality decent photo (never empty if any exist).
  let hero = pickFit("hero");
  if (!hero) {
    const cands = usable
      .filter((s) => !used.has(s.i))
      .sort((a, b) => (b.quality - a.quality) || (b.fit.hero - a.fit.hero));
    if (cands.length) { hero = cands[0]; used.add(cands[0].i); }
  }

  const about = pickFit("about");
  const whyUs = pickFit("whyUs");

  const gallery = usable
    .filter((s) => !used.has(s.i))
    .sort((a, b) => b.quality - a.quality)
    .slice(0, opts?.maxGallery ?? 10)
    .map((s) => s.url);

  return {
    ...(hero ? { hero: hero.url } : {}),
    ...(about ? { about: about.url } : {}),
    ...(whyUs ? { whyUs: whyUs.url } : {}),
    gallery,
  };
}
