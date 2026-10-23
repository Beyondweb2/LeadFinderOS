/* ══ THE GOOGLE LISTING'S LINK, FOR THE WEBSITE CHECK (2026-10-23, src/lib/listingLink.ts) ═══════════════════════════
   Google's own record of the business is the phone_cache row google-place-details wrote for the lead's place id: no paid
   call here. Which rows may be judged is listingRecordUsable (src/lib/listingLink.ts). When the listing links to a different domain, its link is followed once (a plain fetch, no provider)
   so an old domain that forwards to this site is not called a wrong link. Never throws: null = not judged. */
import { listingLinkVerdict, listingNeedsFollow, listingRecordUsable } from "../../../src/lib/listingLink.ts";

const FOLLOW_TIMEOUT_MS = 8_000;

async function landedUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(/^https?:\/\//i.test(url) ? url : `https://${url}`, {
      redirect: "follow", signal: AbortSignal.timeout(FOLLOW_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FindableSiteCheck/1.0; +https://findable.live)" },
    });
    try { await res.body?.cancel(); } catch { /* nothing to cancel */ }
    return res.url || null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any -- loose-typed to avoid supabase-js generic 'never' friction
export async function listingForCheck(service: any, placeId: string | null | undefined, checkedUrl: string):
  Promise<{ verdict: "links" | "no_link" | "other_site"; website: string | null } | null> {
  if (!placeId || !checkedUrl) return null;
  try {
    const { data } = await service.from("phone_cache").select("website, details_version, created_at").eq("place_id", placeId).maybeSingle();
    if (!listingRecordUsable(data, Date.now())) return null;
    const website = typeof data.website === "string" && data.website.trim() ? data.website.trim() : null;
    const landed = website && listingNeedsFollow(website, checkedUrl) ? await landedUrl(website) : undefined;
    const verdict = listingLinkVerdict({ known: true, listingWebsite: website, checkedUrl, landedUrl: landed });
    return verdict ? { verdict, website } : null;
  } catch (e) {
    console.error("[listing-website] not judged:", (e as Error).message);
    return null;
  }
}
