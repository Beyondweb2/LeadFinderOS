/**
 * Shared content contract for a generated business microsite.
 *
 * This is the single typed payload the AI generator produces per business and a
 * template renders. It is intentionally PRESENTATION-AGNOSTIC: no styling, no
 * asset bundling, no template choice — just the words and numbers for one
 * business. Both the barber and salon templates consume this exact shape, which
 * is why it lives here (shared) rather than inside one template's folder.
 *
 * The barber template re-exports these under its historical `Barber*` names
 * (see ../barber/types.ts) so existing imports keep working unchanged.
 */

export interface SiteService {
  /** Service name, e.g. "Skin Fade" or "Balayage". */
  name: string;
  /** Optional one-line description shown beneath the name. */
  description?: string;
  /** Pre-formatted price string, e.g. "£25" or "from £18". Rendered verbatim. */
  price?: string;
  /**
   * Optional appointment length in minutes, used to size booking slots and shown
   * on the service. When omitted, the booking flow infers a sensible default
   * from the service name.
   */
  durationMins?: number;
  /**
   * Optional icon key for templates that render a per-service icon (e.g. the
   * plumber service cards). Maps to a template-local icon set; ignored by
   * templates that don't use icons (barber/salon). Never fabricated facts.
   */
  icon?: string;
  /**
   * Optional per-service image URL for templates whose service cards show a photo
   * (plumber). When omitted, the template falls back to a bundled stock image.
   * Image-picking is a separate build — this is just the slot.
   */
  imageUrl?: string;
}

/** One FAQ entry (generic Q&A — not a business-specific factual claim). */
export interface SiteFaq {
  question: string;
  answer: string;
}

/** One "how it works" step. Rendered numbered by array order. */
export interface SiteProcessStep {
  /** Optional icon key (template-local icon set). */
  icon?: string;
  title: string;
  description: string;
}

/**
 * One real customer review. Populated by the review-enrichment build (Apify →
 * real Google reviews). NEVER fabricated: when no real reviews exist the array is
 * empty/undefined and templates show no testimonial cards (honesty rule).
 */
export interface SiteReview {
  /** Reviewer's display name (real). */
  author: string;
  /** Review body text (real, verbatim from the source). */
  text: string;
  /** Optional 0–5 star rating for this review. */
  rating?: number;
  /** Optional real avatar photo URL; templates fall back to initials, never a
   *  stock-photo face. */
  avatarUrl?: string;
  /** Optional human date label, e.g. "2 weeks ago". */
  date?: string;
}

export interface SiteOpeningHours {
  /** Day label, e.g. "Monday" or "Mon". */
  day: string;
  /** Hours for that day, e.g. "9:00 – 18:00" or "Closed". Rendered verbatim. */
  open: string;
}

export interface SiteStat {
  /** The figure, rendered verbatim, e.g. "2009". Must be a real value. */
  value: string;
  /** Caption beneath it, e.g. "Trading since". */
  label: string;
}

export interface SiteContent {
  /** Business name — rendered as the wordmark and throughout. */
  businessName: string;
  /**
   * Optional real business category (e.g. "Barber shop", "Hair salon"), shown in
   * the hero eyebrow. Omitted → eyebrow shows only the business name. Never a
   * placeholder.
   */
  category?: string;
  /** Short hero subheading beneath the headline. */
  tagline: string;
  /** Large hero headline. */
  heroHeadline: string;
  /** 2–3 sentence "about" paragraph. */
  about: string;
  /** Services offered, with optional descriptions and prices. */
  services: SiteService[];
  /** Weekly opening hours, one row per day. */
  hours: SiteOpeningHours[];
  /** Contact phone number, e.g. "020 7946 0123". */
  phone: string;
  /** Postal address — also used to build the embedded map. */
  address: string;
  /** Optional Google rating, 0–5 (e.g. 4.8). Renders as stars when present. */
  googleRating?: number;
  /** Optional number of reviews backing the rating. */
  reviewCount?: number;
  /**
   * Optional about-section stat tiles (e.g. trading-since year). Each tile
   * renders ONLY from a real value here — there are no hardcoded defaults, so a
   * business with no real stats shows no tiles (never a fabricated placeholder).
   */
  stats?: SiteStat[];
  /**
   * When true, services without a confirmed `price` show an illustrative
   * EXAMPLE price (clearly labelled, under a disclaimer) instead of "Price on
   * request". Confirmed prices are always shown as-is, never labelled example.
   * Default/false preserves the "Price on request" behaviour.
   */
  showExamplePrices?: boolean;
  /**
   * Optional Google Maps / Google Business reviews URL. When set, the site shows
   * a "Read our Google reviews" link to the real reviews at the source. Hidden
   * entirely when empty. We never republish review text — only link out.
   */
  googleReviewsUrl?: string;
  /**
   * Optional hero image URL. When omitted, a bundled stock image is used. May be
   * any same-origin or absolute URL the host app provides.
   */
  heroImageUrl?: string;
  /**
   * Optional "about / our story" image URL, shown beside the about copy. When
   * omitted, the bundled stock image is used.
   */
  aboutImageUrl?: string;
  /**
   * Optional logo image URL (admin-uploaded). When present, it replaces the
   * text wordmark in the header/footer. When omitted, the text wordmark is used.
   * Logos are never generated — upload only.
   */
  logoUrl?: string;
  /**
   * Optional gallery image URLs. When omitted (or empty), a curated set of
   * bundled stock images is used instead.
   */
  galleryImageUrls?: string[];
  /**
   * Optional "Why choose us / our work" image (trade templates, e.g. plumber).
   * When omitted the template uses its bundled stock. Barber/salon ignore it.
   */
  whyUsImageUrl?: string;
  /**
   * Optional pool of candidate image URLs (Maps/Facebook/Instagram), gathered by
   * enrichment, for the editor's per-slot picker to choose from. Presentation
   * templates do NOT render this — it's editor-only data.
   */
  imagePool?: string[];
  /**
   * Optional accent (highlight) colour as a hex string, e.g. "#E6A24B". When
   * unset the template uses its own default accent. Only the accent hue changes —
   * the theme stays — via a CSS variable the template sets on its root. (The
   * barber template honours this; the salon template uses its fixed rose palette.)
   */
  accentColor?: string;

  // ── Optional sections used by trade-style templates (e.g. plumber). All
  // optional, so barber/salon payloads are unaffected and no migration is needed
  // (these live inside the existing generated_sites.content JSONB). The reviews
  // section deliberately has NO quoted-testimonial field: per the system-wide
  // honesty rule we never republish review text — templates show the real
  // googleRating/reviewCount and link out via googleReviewsUrl instead.

  /** Optional "why choose us" bullet points. */
  whyUsPoints?: string[];
  /** Optional numbered "how it works" steps. */
  processSteps?: SiteProcessStep[];
  /** Optional FAQ entries (generic Q&A, operator-editable; not factual claims). */
  faqs?: SiteFaq[];
  /** Optional service-area / coverage line, e.g. "Wigan & surrounding areas". */
  serviceArea?: string;
  /**
   * Optional REAL customer reviews (Apify → Google reviews). Empty/undefined when
   * we have none — templates then show no testimonial cards (never fabricated).
   */
  reviews?: SiteReview[];
}
