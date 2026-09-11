/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE IMAGE POOL FOR ONE MOCKUP — gather, then SCORE TO SORT.

   Paul's strategy, and deliberately the whole of it:
     · GOOGLE MAPS IS THE PRIMARY POOL (~8.6 photos per business, measured). Own-site images are a
       bonus. Maps first in the grid; do not design around own-site supply.
     · Stock is a curated repo set, below the fold only, never the hero (src/lib/mockupStock.ts).

   🔴 SCORE TO SORT. NEVER AUTO-PLACE. Paul's call, and the reason is evidential rather than
   aesthetic: the deleted auto-assign (commit c76b78b0) lived on main for 185 MINUTES before being
   replaced (8bc1b08a), its own commit said "Branch only — not deployed", `scorePool` appears in
   exactly two commits ever, and NO reason was ever recorded for removing it. So nothing shows it
   was proven bad — and equally nothing shows it was proven good. It does not get to make
   decisions. It orders the grid; the operator places every photo.
   ⛔ THERE IS NO assignSlots() HERE, AND THERE MUST NOT BE ONE. If a future session adds "just a
   default assignment", re-read this paragraph: the scores are advisory by construction, and that
   is the whole safety property.

   ⛔ THE SCORING PROMPT'S SLOT INTENTS ARE THE SLOT NAMES THEMSELVES. Paul's decision
   (name-as-intent): slots are free-form and scanned from HIS template, so the model is handed
   "van", "lock-closeup", "work-in-progress" and asked how well each photo fits that phrase. The
   deleted version hardcoded plumber intents in prose, which would have made a new slot name
   invisible to the scorer and broken the contract's promise that a niche is a template file plus a
   registry row.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { mapsEnrich } from "./enrichment/sources.ts";
import { imageVariant, GRID_WIDTH, PLACE_WIDTH, looksLikePlaceholder } from "./image-variant.ts";

/** One candidate photo. `source` is recorded at gather time and never inferred later. */
export interface PoolImage {
  /** ~PLACE_WIDTH — the copy that is re-hosted and rendered. */
  url: string;
  /** ~GRID_WIDTH — what the picker's grid loads, and what the vision pass is shown.
   *  ⛔ THE GRID MUST NEVER LOAD `url`. Measured on real Wix originals: 2-7.5 MB EACH, so twelve
   *  of them is ~50MB in one screen — which is exactly why Paul reported the picker as slow. */
  thumb: string;
  /** ⛔ RECORDED AT GATHER, NOT DERIVED. After re-hosting into our bucket a Maps photo and an
   *  own-site photo are both just bucket URLs — indistinguishable. That is exactly how the old
   *  picker lost provenance, and it matters because a saved mockup may become a real build, at
   *  which point the Places-sourced images have to be swapped FIRST. */
  source: "maps" | "own_site" | "stock";
  /** Where within that source: og tag, img tag, Maps listing. Display only. */
  from?: string;
  alt?: string;
  /** 0-100 overall photo quality, from the vision pass. Absent = not scored. */
  quality?: number;
  /** slot name → 0-100 fit, from the vision pass. Absent = not scored. */
  fit?: Record<string, number>;
  /** Vision flags: logo, screenshot, text, blurry, stock, person, exterior, interior, detail, work. */
  flags?: string[];
  /** Deterministic demotion, applied WITHOUT the model — see demoteReason. */
  demoted?: string;
}

/* ── Deterministic demotion: no model, no cost, no judgement ─────────────────────────────────
   ⚠️ DEMOTED, NOT DELETED. Every one of these is a guess about a URL, and a guess that removes a
   photo the operator wanted is worse than one that ranks it last — Google's own categories are
   imperfect and so are filename conventions. The picker shows demoted items at the end, greyed,
   still placeable. Same reasoning as the market view's "Excluded: N (wrong trade) · Add anyway". */

/** Street View is a photo of the road outside, not of the business. 21 were measured in the
 *  cached pool, and one as a hero would be actively misleading. */
const STREET_VIEW_HOST = /(?:^|\.)streetviewpixels-pa\.googleapis\.com$/i;

/* Filename/path markers that are furniture rather than photography.
   🔴 `logo` AND `badge` DELIBERATELY ABSENT — see scan-site-details' IMG_SKIP for the reasoning.
   They are the most valuable non-photograph in the pool, not junk, and they are separated by
   classification rather than removed by a regex. */
const FURNITURE = /(?:sprite|favicon|pixel|spacer|placeholder|1x1|blank|loader|spinner|avatar|flag|arrow|chevron|cookie|watermark)/i;

export function demoteReason(url: string): string | null {
  let host = "", path = "";
  try { const u = new URL(url); host = u.hostname; path = u.pathname; } catch { return "unparseable url"; }
  if (STREET_VIEW_HOST.test(host)) return "Street View — the road, not the business";
  if (FURNITURE.test(path)) return "looks like site furniture, not a photo";
  /* 🔴 A PLACEHOLDER MUST NEVER BE SCORED, AND THIS IS THE SECOND HALF OF THAT GUARANTEE.
     The harvester already drops one it could not upgrade — but the harvester is not the only way
     into this pool (Maps photos, a cached _v8 row, a hand-added URL), and scorePoolForSort's
     candidate list is exactly `!p.demoted`. So demoting here is what makes "cannot be scored"
     true for every path rather than for one of them.
     ⚠️ WHY IT MATTERS MORE THAN A WASTED SCORE: the vision pass graded nine of Starr Keys'
     perfectly good photos as "blurry" when it was shown their blurred 73x49 placeholders. That is
     not a wasted penny, it is a measurement of the wrong thing that reads exactly like a
     measurement of the right thing — and it went into the sort order.
     ⚠️ Demoted, not deleted, like everything else here: if this URL guess is wrong, the photo
     ranks last and stays placeable. */
  if (looksLikePlaceholder(url)) return "a low-quality placeholder, not the real photo";
  return null;
}

/* ── Gather: Maps first ─────────────────────────────────────────────────────────────────── */

/**
 * Google Maps listing photos for one business.
 *
 * ⚠️ maxImages 16 rather than the default 10: the measured average is 8.6, so 16 asks for
 * everything a typical listing has without paying for a second call. Cost is per PLACE
 * ($0.003, compass/crawler-google-places), not per image, so asking for more is free.
 * ⚠️ photosOnly drops the heavy add-ons (contacts, web results) — the mockup wants pictures, and
 * this call sits in an operator's wait.
 */
export async function fetchMapsPool(
  args: { googleMapsUrl?: string | null; placeId?: string | null; apifyToken: string },
): Promise<{ images: PoolImage[]; ms: number; costUsd: number | null; error?: string }> {
  if (!args.apifyToken) return { images: [], ms: 0, costUsd: null, error: "no APIFY_TOKEN" };
  const url = (args.googleMapsUrl ?? "").trim();
  const pid = (args.placeId ?? "").trim();
  if (!url && !pid) return { images: [], ms: 0, costUsd: null, error: "no google_maps_url or place_id" };
  try {
    const { place, ms, usageTotalUsd } = await mapsEnrich({
      googleMapsUrl: url || undefined,
      placeId: pid || undefined,
      token: args.apifyToken,
      maxImages: 16,
      maxReviews: 0,          // ⛔ reviews are never republished (see mockupStock's honesty note)
      photosOnly: true,
      /* ⛔ 75s IS THE DOCUMENTED FIGURE AND 60 WAS MEASURED TO BE TOO LOW. Commit ab107886 ("Fix
         Maps photos regression: raise maps-enrich timeout (enrich 25->75s)") exists because a
         photo-heavy scrape does not finish inside a shorter budget — and the first real run of
         this function reproduced it exactly: "maps enrich failed: The signal has been aborted",
         zero Maps images, on the pool Paul designated PRIMARY. The history had the answer and a
         lower number was used anyway.
         ⚠️ retry is on429 ONLY, deliberately. onAbort would double a 75s wait on the one path an
         operator is sitting in front of, and a timeout here is already reported and re-pressable —
         a rate-limit is not. */
      timeoutMs: 75_000,
      retry: { on429: true },
    });
    const urls = Array.isArray(place?.imageUrls) ? place!.imageUrls! : [];
    const images: PoolImage[] = urls
      .filter((u): u is string => typeof u === "string" && !!u)
      .map((u) => {
        const d = demoteReason(u);
        /* Google encodes the size in a `=w1920-h1080-k-no` suffix, so a grid-sized copy costs
           nothing extra and a placed copy is asked for at full width. */
        return {
          url: imageVariant(u, PLACE_WIDTH),
          thumb: imageVariant(u, GRID_WIDTH),
          source: "maps" as const,
          from: "maps listing",
          ...(d ? { demoted: d } : {}),
        };
      });
    return { images, ms, costUsd: typeof usageTotalUsd === "number" ? usageTotalUsd : null };
  } catch (e) {
    return { images: [], ms: 0, costUsd: null, error: `maps enrich failed: ${String((e as Error).message ?? "").slice(0, 140)}` };
  }
}

/**
 * Merge pools with MAPS FIRST, de-duplicated on URL.
 *
 * ⚠️ MAPS FIRST IS PAUL'S ORDERING, NOT A QUALITY JUDGEMENT — and the measurement supports it
 * rather than contradicting it: own-site images load far more reliably (93 of 96 alive, against
 * 12 of 12 DEAD in the cached Maps/FB/IG pool) but they are not RELIABLY PRESENT — three of six
 * measured locksmiths had no hero-capable own-site photo and one had none at all. Maps is the
 * source that is usually there.
 */
export function mergePool(maps: PoolImage[], ownSite: PoolImage[]): PoolImage[] {
  const seen = new Set<string>();
  const out: PoolImage[] = [];
  for (const im of [...maps, ...ownSite]) {
    const key = im.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(im);
  }
  return out;
}

/* ── Score to sort ──────────────────────────────────────────────────────────────────────── */

/** Vision flags that mean "not a usable marketing photo" — demoted, never deleted. */
const JUNK_FLAGS = new Set(["logo", "screenshot", "text"]);

/** Bounds the vision call's cost and latency. The recovered version used the same figure. */
const MAX_SCORED = 16;

/**
 * Build the vision instruction from the TEMPLATE'S OWN SLOT NAMES.
 *
 * ⛔ NAME-AS-INTENT, Paul's decision. The slot name is handed to the model as the description of
 * what the slot wants, so a template that invents `van` or `work-in-progress` is scored correctly
 * with no registry entry and no code change. Hyphens and underscores become spaces so
 * `lock_closeup` reads as "lock closeup".
 */
function visionPrompt(niche: string, slots: string[]): string {
  const readable = slots.map((s) => `- ${s}: how well this photo suits a website section called "${s.replace(/[-_]+/g, " ")}"`);
  return `You are scoring candidate photographs for a ${niche || "trade"} business's marketing website. You will be shown images in order (index 0, 1, 2, ...). Score EVERY image.

QUALITY (0-100): reward sharp, well-lit, real photographs OF THIS BUSINESS OR ITS WORK. Score below 30 and add the matching flag for: company logos or wordmarks (logo), screenshots of apps/websites/reviews (screenshot), graphics that are mostly text or promotional banners (text), blurry/dark/low-resolution shots (blurry), and generic stock-looking imagery (stock). A real photo of the actual business or its work always beats a graphic.

⚠️ These are ${niche || "trade"} photos, not studio shots. A slightly rough but genuine photo of a real van, a real lock, or real work in progress is MORE useful than a polished generic image — do not punish honest, workmanlike photography for being unglamorous. Punish only what is unusable: out of focus, too dark to read, or not a photograph at all.

FIT (0-100 per slot) — score how well each image suits each of these website slots:
${readable.join("\n")}

FLAGS: list every tag that applies per image, from: logo, screenshot, text, blurry, stock, person, exterior, interior, detail, work, vehicle, signage.

Return ONLY JSON in exactly this shape, one entry per image, every index included exactly once:
{"images":[{"i":0,"quality":0,"fit":{${slots.map((s) => `"${s}":0`).join(",")}},"flags":[]}]}`;
}

const clamp = (n: unknown): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
};

/**
 * One gpt-4o-mini vision call over the whole pool. Returns the pool with `quality`, `fit` and
 * `flags` filled in, plus the measured cost. On ANY failure the pool comes back UNSCORED rather
 * than not at all — an unsorted grid is usable, a missing grid is not.
 */
export async function scorePoolForSort(
  pool: PoolImage[],
  args: { niche: string; slots: string[]; openAiKey: string; timeoutMs?: number },
): Promise<{ images: PoolImage[]; costUsd: number | null; scored: number; error?: string }> {
  const candidates = pool.filter((p) => !p.demoted).slice(0, MAX_SCORED);
  if (!candidates.length || !args.openAiKey || !args.slots.length) {
    return { images: pool, costUsd: null, scored: 0, error: !args.slots.length ? "template declares no image slots" : "nothing to score" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);
  try {
    const content: unknown[] = [{ type: "text", text: visionPrompt(args.niche, args.slots) }];
    // detail:"low" — one cheap tile per image. The grid needs a ranking, not a critique.
    /* ⛔ THE VISION PASS IS SHOWN THE THUMB, NOT THE ORIGINAL. detail:"low" downsamples anyway, so
       sending a 7MB original buys nothing and costs latency — and, before the LQIP fix, sending the
       PLACEHOLDER is what made nine of Starr Keys' good photos score as "blurry". */
    for (const c of candidates) content.push({ type: "image_url", image_url: { url: c.thumb || c.url, detail: "low" } });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${args.openAiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 2000,
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { images: pool, costUsd: null, scored: 0, error: `vision http ${res.status}: ${t.slice(0, 120)}` };
    }
    const data = await res.json();
    const usage = data?.usage ?? {};
    // MEASURED from the response, never estimated — Paul asked for the real number.
    const costUsd = ((Number(usage.prompt_tokens) || 0) / 1_000_000) * 0.15 +
      ((Number(usage.completion_tokens) || 0) / 1_000_000) * 0.60;

    let parsed: { images?: Array<Record<string, unknown>> } = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}"); } catch { /* fall through */ }
    const rows = Array.isArray(parsed.images) ? parsed.images : [];
    if (!rows.length) return { images: pool, costUsd, scored: 0, error: "vision returned no rows" };

    const byIndex = new Map<number, Record<string, unknown>>();
    for (const r of rows) {
      const i = Number(r?.i);
      if (Number.isInteger(i) && i >= 0 && i < candidates.length) byIndex.set(i, r);
    }
    const scoredUrls = new Map<string, PoolImage>();
    candidates.forEach((c, i) => {
      const r = byIndex.get(i);
      if (!r) { scoredUrls.set(c.url, c); return; }  // model omitted it → left unscored, not zeroed
      const fitRaw = (r.fit ?? {}) as Record<string, unknown>;
      const fit: Record<string, number> = {};
      for (const s of args.slots) fit[s] = clamp(fitRaw[s]);
      const flags = Array.isArray(r.flags) ? (r.flags as unknown[]).map(String).filter((f) => f.length < 24) : [];
      const junk = flags.find((f) => JUNK_FLAGS.has(f));
      scoredUrls.set(c.url, {
        ...c,
        quality: clamp(r.quality),
        fit,
        flags,
        ...(junk ? { demoted: `vision flagged: ${junk}` } : {}),
      });
    });
    return {
      images: pool.map((p) => scoredUrls.get(p.url) ?? p),
      costUsd,
      scored: byIndex.size,
    };
  } catch (e) {
    return { images: pool, costUsd: null, scored: 0, error: `vision failed: ${String((e as Error).message ?? "").slice(0, 140)}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Grid order: best first, demoted last.
 *
 * ⛔ SORTS. DOES NOT SELECT, AND DOES NOT ASSIGN. Every image stays in the list, including the
 * demoted ones — they go to the end, greyed, still placeable, because a guess that hides a photo
 * the operator wanted is worse than one that ranks it last.
 * ⚠️ Unscored images sort between scored and demoted rather than last: the vision pass caps at 16
 * and can fail entirely, and a pool that came back unscored must not look like a pool of rejects.
 */
export function sortPool(pool: PoolImage[]): PoolImage[] {
  const rank = (p: PoolImage): number => {
    if (p.demoted) return 3;
    if (typeof p.quality !== "number") return 2;
    return 1;
  };
  return [...pool].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return (b.quality ?? 0) - (a.quality ?? 0);
    return 0;                                   // stable within a band: Maps stays before own-site
  });
}
