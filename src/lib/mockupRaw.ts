/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE STORED ROW + ITS LEAD  →  THE DERIVATION'S INPUT.

   One place, because both the picker's live preview and (later) the edge function that renders the
   real asset must build the SAME input. Two builders would mean the preview showing something the
   prospect never receives, which is the whole reason the derivation moved into this repo.

   ⛔ NOTHING IS INVENTED HERE EITHER, and this is the layer where it would be tempting. Every
   field is copied from the lead row or the scrape, or it is LEFT OUT. In particular:
     · owner_bio, area_times, no_callout_fee, dbs_checked, mla_member are NEVER set from scraped
       text. They are typed facts about a business, and three of them are credentials or
       commercial promises. There is no source for them before the questionnaire, so a prospect
       mockup renders without the owner section, the response times and the fee claim — Paul's
       explicit acceptance, 2026-09-11: "honest and thin beats populated and invented".
     · The TRADE comes from the niche REGISTRY, never from the row. The row does not store one,
       and the registry's value is title case ("Locksmith") because it is rendered in a heading.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { MockupRaw, RawService } from "./mockupDerive.ts";
import { nicheByKey } from "./mockupNiche.ts";

/** A UK postcode sitting at the end of a Google-formatted address. */
const POSTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i;

export interface MockupRowLead {
  business_name?: string | null;
  rating?: string | number | null;
  review_count?: string | number | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  google_maps_url?: string | null;
  derived_town?: string | null;
  search_location?: string | null;
}

/** `generated_sites.content` for a mockup row, as much of it as this builder reads. */
export interface MockupRowContent {
  niche?: string | null;
  business?: { name?: string; town?: string; phone?: string; address?: string; email?: string; hours?: string } | null;
  scrape?: { services?: RawService[]; areas?: string[] } | null;
  services?: RawService[] | null;
  pool?: Array<{ url?: string; thumb?: string; demoted?: string }> | null;
  slots?: Record<string, { kind?: string }> | null;
}

/**
 * Build the derivation's input.
 *
 * `slotUrls` are the signed, time-limited URLs minted by the `get` action — the placed photos.
 */
export function rawFromMockupRow(
  content: MockupRowContent,
  lead: MockupRowLead | null,
  slotUrls: Record<string, string> = {},
): MockupRaw {
  const b = content.business ?? {};
  const niche = nicheByKey(content.niche);

  /* ⚠️ THE PHONE IS NORMALISED FOR DISPLAY ONLY. `+44 7920 684400` is how it is stored and
     `07920 684400` is how a customer reads it; the tel: link is rebuilt from digits downstream,
     so this cannot break the link. */
  const phone = String(b.phone ?? lead?.phone ?? "").replace(/^\+44\s*/, "0").replace(/\s+/g, " ").trim();

  const town = b.town ?? lead?.derived_town ?? lead?.search_location ?? "";
  const address = b.address ?? lead?.address ?? "";

  /* ⛔ THE OPERATOR'S CONFIRMED SERVICE LIST BEATS THE SCRAPE. He edits it in the picker
     precisely because a scrape gets things wrong, so a later re-scrape must not overwrite him. */
  const services = (content.services?.length ? content.services : content.scrape?.services) ?? [];

  /* The pool, minus anything the pool itself demoted, in its existing order — this builder never
     re-ranks. Placed photos are removed downstream so a hero is not also a gallery tile. */
  const images = (content.pool ?? [])
    .filter((p) => p && typeof p.url === "string" && !p.demoted)
    .map((p) => ({ url: p.url as string }));

  return {
    business: {
      name: b.name ?? lead?.business_name ?? "",
      trade: niche?.trade ?? "",          // ⛔ registry, title case, never the row
      town,
      phone,
      address,
      email: b.email ?? "",
      hours: b.hours ?? "",
      postcode: address.match(POSTCODE_RE)?.[1] ?? "",
      /* A rating without a count is not evidence; the derivation pairs them itself. */
      rating: lead?.rating != null ? String(lead.rating) : "",
      review_count: lead?.review_count != null ? String(lead.review_count) : "",
      google_reviews_url: lead?.google_maps_url ?? "",
    },
    services,
    areas: content.scrape?.areas ?? [],
    prices: [],        // ⛔ nothing scrapes a reliable price list; absent beats guessed
    images,
    img: slotUrls,
    /* ⛔ DELIBERATELY UNSET, ALL FIVE. See the header — there is no source for them yet, and
       three of them are claims about the business. */
  };
}
