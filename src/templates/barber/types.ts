/**
 * Content contract for the barbershop site template.
 *
 * This is the single typed payload the AI generator produces per business and
 * the template renders. It is intentionally presentation-agnostic: no styling,
 * no asset bundling decisions — just the words and numbers for one shop.
 */

export interface BarberService {
  /** Service name, e.g. "Skin Fade". */
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
}

export interface BarberOpeningHours {
  /** Day label, e.g. "Monday" or "Mon". */
  day: string;
  /** Hours for that day, e.g. "9:00 – 18:00" or "Closed". Rendered verbatim. */
  open: string;
}

export interface BarberStat {
  /** The figure, rendered verbatim, e.g. "2009". Must be a real value. */
  value: string;
  /** Caption beneath it, e.g. "Trading since". */
  label: string;
}

export interface BarberSiteContent {
  /** Shop name — rendered as the wordmark and throughout. */
  businessName: string;
  /**
   * Optional real business category (e.g. "Barber shop"), shown in the hero
   * eyebrow. Omitted → eyebrow shows only the business name. Never a placeholder.
   */
  category?: string;
  /** Short hero subheading beneath the headline. */
  tagline: string;
  /** Large hero headline. */
  heroHeadline: string;
  /** 2–3 sentence "about" paragraph. */
  about: string;
  /** Services offered, with optional descriptions and prices. */
  services: BarberService[];
  /** Weekly opening hours, one row per day. */
  hours: BarberOpeningHours[];
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
   * shop with no real stats shows no tiles (never a fabricated placeholder).
   */
  stats?: BarberStat[];
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
   * Optional hero image URL. When omitted, a bundled stock barbershop image is
   * used. May be any same-origin or absolute URL the host app provides.
   */
  heroImageUrl?: string;
  /**
   * Optional "about / our story" image URL, shown beside the about copy. When
   * omitted, the bundled stock interior image is used.
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
   * bundled stock barbershop images is used instead.
   */
  galleryImageUrls?: string[];
  /**
   * Optional accent (highlight) colour as a hex string, e.g. "#E6A24B". When
   * unset the template uses its default amber. Only the accent hue changes — the
   * dark theme stays — via a CSS variable the template sets on its root.
   */
  accentColor?: string;
}
