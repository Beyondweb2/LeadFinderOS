/**
 * Site-template registry — the SINGLE source of truth for the verticals we offer.
 *
 * Every generated site has a `generated_sites.template` text discriminator. The
 * render routes (/p/:slug, /s/:token), the per-route browser branding, and the
 * admin "generate site" menu all resolve that string through this registry
 * instead of scattering `template === "salon" ? … : …` ternaries across the app.
 *
 * Adding a NEW vertical (e.g. plumber) is therefore a one-place change: add its
 * row to SITE_TEMPLATES below (Component, demo content, label, favicon, loading
 * theme). `normaliseTemplate()` accepts it automatically because it validates
 * against the registry keys. Nothing else needs editing.
 *
 * This is presentation-routing only — claim/tracking/booking remain fully
 * template-agnostic.
 */
import type { ComponentType } from "react";
import { BarberSiteTemplate } from "@/templates/barber/BarberSiteTemplate";
import { SalonSiteTemplate } from "@/templates/salon/SalonSiteTemplate";
import { PlumberSiteTemplate } from "@/templates/plumber/PlumberSiteTemplate";
import { demoContent as barberDemo } from "@/templates/barber/demoContent";
import { demoContent as salonDemo } from "@/templates/salon/demoContent";
import { demoContent as plumberDemo } from "@/templates/plumber/demoContent";
import type { SiteContent } from "@/templates/shared/content";

/** Props every site template accepts (superset across all callers). */
export interface SiteTemplateProps {
  content: SiteContent;
  bookingEnabled?: boolean;
  bookingSlug?: string;
  onClaim?: () => void;
  showClaimBar?: boolean;
  /**
   * Pre-sign-in photo swap on /s/:token (barber template only): tap the hero/about
   * photo to drop in your own before claiming. Other templates ignore it.
   */
  onEditImage?: (slot: "hero" | "about") => void;
}

export interface TemplateDef {
  /** The discriminator stored in generated_sites.template. */
  key: string;
  /** Operator-facing label (admin "generate site" menu). */
  label: string;
  /** The React component that renders this vertical. */
  Component: ComponentType<SiteTemplateProps>;
  /** Bundled demo content, used as the /p/ fallback when no row matches. */
  demoContent: SiteContent;
  /** Data-URI favicon swapped in for this vertical's public pages. */
  favicon: string;
  /** Static OG fallback image filename (served from /public, used by the
   *  Cloudflare /s/ head-rewriter — kept here so the name lives in one place). */
  ogImage: string;
  /** Loading-screen background class for this vertical's public pages. */
  loadingBgClass: string;
  /** Loading-screen spinner colour class. */
  loadingSpinnerClass: string;
  /** Document-title fallback when a site has no business name yet. */
  brandFallbackLabel: string;
}

// ── Favicons (data URIs). Kept here so a new vertical's mark is added alongside
// its registry row. Barber/salon strings are byte-identical to the originals
// that previously lived in useSiteBranding. ──

// Amber scissors on a dark tile — the barber mark.
const BARBER_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(4 4)" fill="none" stroke="#E6A24B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>`,
)}`;

// Rose bloom on a warm off-white tile — the salon mark.
const SALON_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#FAF6F3"/><g transform="translate(16 16)" fill="none" stroke="#C08497" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="2.6"/><path d="M0 -2.6V-8M0 2.6V8M2.6 0H8M-2.6 0H-8M1.84 -1.84 5.66 -5.66M-1.84 1.84 -5.66 5.66M1.84 1.84 5.66 5.66M-1.84 -1.84 -5.66 -5.66"/></g></svg>`,
)}`;

// Cyan water-drop on a deep-navy tile — the plumber mark.
const PLUMBER_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0F2233"/><path d="M16 6s7 7.8 7 13a7 7 0 0 1-14 0c0-5.2 7-13 7-13z" fill="#06B6D4"/></svg>`,
)}`;

export const SITE_TEMPLATES: Record<string, TemplateDef> = {
  barber: {
    key: "barber",
    label: "Barber site",
    Component: BarberSiteTemplate,
    demoContent: barberDemo,
    favicon: BARBER_FAVICON,
    ogImage: "og-default-barber.jpg",
    loadingBgClass: "bg-ink",
    loadingSpinnerClass: "text-amber",
    brandFallbackLabel: "Barber website",
  },
  salon: {
    key: "salon",
    label: "Salon site",
    Component: SalonSiteTemplate,
    demoContent: salonDemo,
    favicon: SALON_FAVICON,
    ogImage: "og-default-salon.jpg",
    loadingBgClass: "bg-salon-bg",
    loadingSpinnerClass: "text-salon-rose",
    brandFallbackLabel: "Salon website",
  },
  plumber: {
    key: "plumber",
    label: "Plumber site",
    Component: PlumberSiteTemplate,
    demoContent: plumberDemo,
    favicon: PLUMBER_FAVICON,
    // Phase 3: drop og-default-plumber.jpg into /public + teach the Cloudflare
    // /s/ head-rewriter about it. Until then plumber shares fall back to the
    // barber OG image (the rewriter defaults non-salon → barber).
    ogImage: "og-default-plumber.jpg",
    loadingBgClass: "bg-plumber-bg",
    loadingSpinnerClass: "text-plumber-primary",
    brandFallbackLabel: "Plumbing website",
  },
};

/** The default vertical when a row has no/unknown template (historical: barber). */
export const DEFAULT_TEMPLATE_KEY = "barber";

/** Coerce any stored value to a known registry key (unknown → default). Accepts
 *  a new vertical automatically once its row exists in SITE_TEMPLATES. */
export function normaliseTemplate(value: unknown): string {
  return typeof value === "string" && value in SITE_TEMPLATES
    ? value
    : DEFAULT_TEMPLATE_KEY;
}

/** Resolve a stored value to its full template definition (never null). */
export function getTemplateDef(value: unknown): TemplateDef {
  return SITE_TEMPLATES[normaliseTemplate(value)];
}

/** Ordered list for menus (admin "generate site"). */
export const TEMPLATE_LIST: TemplateDef[] = Object.values(SITE_TEMPLATES);
