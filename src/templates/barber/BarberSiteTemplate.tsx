import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import "./fonts.css";
import { STOCK_GALLERY, STOCK_HERO, STOCK_INTERIOR } from "./assets";
import { GALLERY_LAYOUTS, GALLERY_GRID_BASE } from "../shared/galleryLayout";
import { SocialLinks } from "../shared/SocialLinks";
import { BookingFlow } from "./BookingFlow";
import type { BarberOpeningHours, BarberService, BarberSiteContent, BarberStat } from "./types";
import type { BarberImageSlot } from "@/lib/barberEdits";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** "#E6A24B" -> "230 162 75" (space-separated RGB channels for rgb(var() / a)). */
function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `${parseInt(n.slice(0, 2), 16)} ${parseInt(n.slice(2, 4), 16)} ${parseInt(n.slice(4, 6), 16)}`;
}

/** Mix a hex toward white (255) or black (0) by t; returns RGB channels. Used to
 *  derive the soft (lighter) and deep (darker) accent shades from one colour. */
function mixChannels(hex: string, toward: 0 | 255, t: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const ch = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((x) => {
    const v = parseInt(x, 16);
    return Math.round(v + (toward - v) * t);
  });
  return ch.join(" ");
}

/* -------------------------------------------------------------------------- */
/*  BarberSiteTemplate                                                         */
/*                                                                            */
/*  A single-page, mobile-first marketing site for a UK barbershop. Fully     */
/*  self-contained: fonts and stock photography are bundled locally; the only */
/*  runtime network call is the (key-less) Google Maps embed iframe, which is */
/*  explicitly part of the contact section.                                   */
/* -------------------------------------------------------------------------- */

export function BarberSiteTemplate({
  content,
  bookingEnabled = false,
  bookingSlug,
  onClaim,
  showClaimBar = true,
  onEditImage,
  editable = false,
  onEditElement,
  onAddImage,
  onEditService,
  onAddService,
  bookingOnly = false,
}: {
  content: BarberSiteContent;
  /**
   * Online booking is enabled when the shop has set up bookable staff + hours
   * (Phase 2). When true, "Book now" opens the real booking flow; when false it
   * honestly routes to the contact/call section instead.
   */
  bookingEnabled?: boolean;
  /**
   * The site's slug (site_name). Required for the REAL booking flow — the
   * create-booking / get-availability edge functions key off it. When present
   * (the public /p/:slug page), "Book now" opens <BookingFlow>; when absent
   * (admin/claim preview) it falls back to the frontend-only demo modal.
   */
  bookingSlug?: string;
  /**
   * When set, the site renders in "claim preview" mode: a fixed "Claim for free"
   * bar replaces the mobile Book bar so a barber can view their site before
   * signing up. Used by the /claim page; the public /p/:slug site never sets it.
   */
  onClaim?: () => void;
  /**
   * Hide the fixed "Claim for free" bar while it should not be tappable — e.g.
   * while the intro popup is open on /s/:token, so a tap can't land on the bar
   * behind the popup (the cause of the "double-press"). Defaults to shown.
   */
  showClaimBar?: boolean;
  /**
   * Pre-sign-in photo swap on /s/:token: when set, the hero + about + gallery
   * photos become tappable so a barber can drop in their own picture before
   * claiming (held in the browser, uploaded on claim). Absent on the public
   * /p/:slug site (view-only).
   */
  onEditImage?: (slot: BarberImageSlot) => void;
  /**
   * Live tap-to-edit mode (the barber's own editor). When `editable`, text
   * elements get a tap affordance that calls `onEditElement(key)` to open the
   * bottom-sheet editor, and the fixed book/claim bars are suppressed (the editor
   * supplies its own global bar). Absent on the public /p/ site → byte-identical.
   */
  editable?: boolean;
  onEditElement?: (key: string) => void;
  /**
   * Live editor (owner mode): append a new gallery photo. When set together with
   * `editable`, the gallery renders the owner's real photos with tap-to-replace +
   * remove and an "Add photo" tile. Absent on the public /p/ site.
   */
  onAddImage?: () => void;
  /**
   * Live editor (owner mode): edit / add a service. With `editable`, the services
   * section renders tappable rows (→ onEditService(index)) and an "Add service"
   * control (→ onAddService). Absent on the public /p/ site.
   */
  onEditService?: (index: number) => void;
  onAddService?: () => void;
  /**
   * Booking-only sites are the online-booking product, not a marketing website.
   * When true, the marketing-only sections are hidden so the owner's editor (and
   * any render) shows just the booking-relevant fields: Hero (branding/photo),
   * Services + prices, Hours, and contact phone/address — NO About, Gallery or map.
   * Defaults false → every existing render is byte-identical.
   */
  bookingOnly?: boolean;
}) {
  const {
    businessName,
    category,
    tagline,
    heroHeadline,
    about,
    aboutHeading,
    services,
    hours,
    phone,
    address,
    contactHeading,
    googleRating,
    reviewCount,
    heroImageUrl,
    aboutImageUrl,
    galleryImageUrls,
    stats,
    logoUrl,
    showExamplePrices,
    googleReviewsUrl,
    facebookUrl,
    instagramUrl,
  } = content;

  // Per-site accent: set the CSS variables the amber* tokens (and the converted
  // gradient/pinstripe/shadows) read, deriving soft/deep shades. Applied ONLY for
  // a valid hex — otherwise the template inherits the default amber from :root, so
  // existing sites (no accentColor) are unchanged.
  const accentStyle = (HEX_RE.test(content.accentColor ?? "")
    ? {
        "--barber-accent": hexToChannels(content.accentColor as string),
        "--barber-accent-soft": mixChannels(content.accentColor as string, 255, 0.3),
        "--barber-accent-deep": mixChannels(content.accentColor as string, 0, 0.15),
      }
    : {}) as CSSProperties;

  const heroSrc = heroImageUrl || STOCK_HERO;
  const gallery =
    galleryImageUrls && galleryImageUrls.length > 0
      ? galleryImageUrls
      : STOCK_GALLERY;

  const telHref = useMemo(() => `tel:${phone.replace(/[^\d+]/g, "")}`, [phone]);
  // Key-less Google Maps embed built from the address (the standard
  // ?q=<address>&output=embed pattern). Empty when there's no address — the map
  // container is then hidden rather than rendering an empty box.
  const mapSrc = useMemo(
    () =>
      address.trim()
        ? `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&output=embed`
        : "",
    [address]
  );

  const [bookingOpen, setBookingOpen] = useState(false);
  // Honest free-tier behavior: online booking is a paid feature, so instead of
  // opening a booking flow the site can't fulfil, take the visitor to the contact
  // section to call. Flips to the real flow once bookingEnabled (paid) is true.
  const openBooking = () => {
    if (bookingEnabled) {
      setBookingOpen(true);
      return;
    }
    document.getElementById("visit")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="barber-site font-body text-zinc-300 antialiased" style={accentStyle}>
      {/* Warm, scoped background so the page looks right regardless of host body
          styles. Two soft amber radials over deep ink. */}
      {/* pb on mobile clears the fixed bottom Book bar so no section sits under it */}
      <div
        className={`relative min-h-screen bg-ink ${editable ? "pb-[132px]" : onClaim ? "pb-[188px] sm:pb-[140px]" : "pb-[76px] sm:pb-0"}`}
        style={{
          backgroundImage:
            "radial-gradient(1100px 600px at 85% -8%, rgb(var(--barber-accent) / 0.10), transparent 60%)," +
            "radial-gradient(800px 500px at -10% 8%, rgb(var(--barber-accent) / 0.05), transparent 55%)",
        }}
      >
        <Header
          businessName={businessName}
          telHref={telHref}
          phone={phone}
          onBook={openBooking}
          logoUrl={logoUrl}
          facebookUrl={facebookUrl}
          instagramUrl={instagramUrl}
          editable={editable}
          onEditImage={onEditImage}
          onEditElement={onEditElement}
          bookingOnly={bookingOnly}
        />

        <main>
          <Hero
            businessName={businessName}
            category={category}
            heroHeadline={heroHeadline}
            tagline={tagline}
            heroSrc={heroSrc}
            googleRating={googleRating}
            reviewCount={reviewCount}
            googleReviewsUrl={googleReviewsUrl}
            onBook={openBooking}
            onEditImage={onEditImage}
            editable={editable}
            onEditElement={onEditElement}
          />
          {/* Booking-only sites hide the marketing-only sections (About, Gallery)
              so the owner edits just hero/services/hours/contact. */}
          {!bookingOnly && (
            <About about={about} aboutHeading={aboutHeading} businessName={businessName} stats={stats} aboutImageUrl={aboutImageUrl} onEditImage={onEditImage} editable={editable} onEditElement={onEditElement} />
          )}
          <Services services={services} showExamplePrices={showExamplePrices} editable={editable} bookingOnly={bookingOnly} onEditService={onEditService} onAddService={onAddService} />
          {!bookingOnly && (
            <Gallery
              images={gallery}
              businessName={businessName}
              onEditImage={onEditImage}
              editable={!!galleryImageUrls && galleryImageUrls.length > 0}
              ownerEditable={editable}
              ownerImages={galleryImageUrls ?? []}
              onAddImage={onAddImage}
            />
          )}
          <Hours hours={hours} editable={editable} onEditElement={onEditElement} />
          <Contact
            businessName={businessName}
            phone={phone}
            telHref={telHref}
            address={address}
            contactHeading={contactHeading}
            mapSrc={bookingOnly ? "" : mapSrc}
            googleRating={googleRating}
            reviewCount={reviewCount}
            googleReviewsUrl={googleReviewsUrl}
            onBook={openBooking}
            bookingEnabled={bookingEnabled}
            editable={editable}
            onEditElement={onEditElement}
          />
        </main>

        <Footer businessName={businessName} address={address} logoUrl={logoUrl} facebookUrl={facebookUrl} instagramUrl={instagramUrl} />
      </div>

      {/* Mobile-only sticky Book bar — owners open the link on a phone. In live
          edit mode the editor supplies its own global bar, so suppress both. */}
      {editable ? null : onClaim ? (showClaimBar ? <ClaimBar onClaim={onClaim} /> : null) : <MobileBookBar onBook={openBooking} />}

      {/* Public site → real booking flow (keyed off the slug). Admin/claim
          preview (no slug) → the frontend-only demo modal. */}
      {bookingSlug ? (
        <BookingFlow open={bookingOpen} onClose={() => setBookingOpen(false)} slug={bookingSlug} content={content} />
      ) : (
        <BookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          businessName={businessName}
          services={services}
          hours={hours}
          phone={phone}
          telHref={telHref}
        />
      )}
    </div>
  );
}

/* ------------------------------- primitives ------------------------------- */

/** Fade-and-rise on scroll-into-view. Animates once. */
function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "figure";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}

/** Image with a graceful gradient fallback if the src fails to load. */
function SmartImg({
  src,
  alt,
  className = "",
  imgClassName = "",
  zoom = false,
  loading = "lazy",
}: {
  src: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  zoom?: boolean;
  loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-ink-soft ${className}`}>
      {failed ? (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1c1509] via-ink to-black">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgb(var(--barber-accent)) 0, rgb(var(--barber-accent)) 1px, transparent 1px, transparent 22px)",
            }}
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${
            zoom ? "animate-kenburns" : ""
          } ${imgClassName}`}
        />
      )}
    </div>
  );
}

/** Uppercase tracked eyebrow label with a short amber rule. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 shrink-0 bg-amber/70" />
      <span className="min-w-0 break-words text-xs font-semibold uppercase tracking-[0.2em] text-amber-soft sm:tracking-[0.28em]">
        {children}
      </span>
    </div>
  );
}

/** Google-style star row for a 0–5 rating, with partial fill on the last star. */
function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const clamped = Math.max(0, Math.min(5, rating));
  return (
    <div
      className={`flex items-center gap-0.5 ${className}`}
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      role="img"
    >
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, clamped - i));
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-white/15" />
            <span
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${fill * 100}%` }}
            >
              <Star className="h-4 w-4 text-amber" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------- icons ---------------------------------- */

function Star({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L10 14.77l-5.2 2.73.99-5.79L1.58 7.62l5.82-.85L10 1.5z" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.6 10.8a15.5 15.5 0 006.6 6.6l2.2-2.2a1 1 0 011-.24 11.4 11.4 0 003.57.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.4 11.4 0 00.57 3.57 1 1 0 01-.25 1l-2.2 2.23z"
        fill="currentColor"
      />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScissorsIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="6" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7.5L20 18M8 16.5L20 6M8.2 7.4l5.3 4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8.5a2 2 0 0 1 2-2h1.2l.9-1.6a1 1 0 0 1 .87-.5h6.06a1 1 0 0 1 .87.5l.9 1.6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Tap-to-change overlay for an editable photo (about + gallery). Sits over the
 * image (the parent must be `relative`); shows a "Change photo" pill. `radiusClass`
 * matches the photo's corners so the hover wash doesn't spill past them.
 */
function ImageEditOverlay({ onClick, radiusClass = "rounded-2xl" }: { onClick: () => void; radiusClass?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Change this photo"
      className={`group/edit absolute inset-0 z-10 flex items-center justify-center ${radiusClass} transition-colors hover:bg-ink/30 focus-visible:bg-ink/30`}
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/65 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition-transform group-hover/edit:-translate-y-0.5 sm:text-sm">
        <CameraIcon className="h-4 w-4" /> Change photo
      </span>
    </button>
  );
}

/**
 * Tap-to-edit overlay for a whole block (live editor): hours table, contact details.
 * Sits over the block (parent must be `relative`) with a dashed amber outline and an
 * "Edit …" pill; captures the tap so inner links (e.g. tel:) don't fire. Editor-only.
 */
function EditBlockOverlay({ onClick, label, radiusClass = "rounded-2xl" }: { onClick: () => void; label: string; radiusClass?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={label}
      className={`group/edit absolute inset-0 z-20 flex items-start justify-end ${radiusClass} bg-amber/5 p-3 outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/15 hover:outline-amber focus-visible:bg-amber/15 focus-visible:outline-none focus-visible:outline-amber`}
    >
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-black/70 px-3 py-1.5 text-xs font-semibold text-amber-soft shadow-lg backdrop-blur-sm transition-transform group-hover/edit:-translate-y-0.5">
        <PencilIcon className="h-3.5 w-3.5" /> {label}
      </span>
    </button>
  );
}

/**
 * Tap-to-edit affordance for an inline text element (live editor). When `editable`
 * the text is wrapped in a subtly-outlined, clickable span that opens the bottom-
 * sheet editor via onEdit(); otherwise it renders the plain text unchanged, so the
 * public /p/ render is byte-identical.
 */
function EditableText({ editable, onEdit, children }: { editable?: boolean; onEdit?: () => void; children: ReactNode }) {
  if (!editable || !onEdit) return <>{children}</>;
  // Editor-only affordance — deliberately loud so barbers see what they can change:
  // a clear amber dashed box, a persistent tint, and a pencil icon that scales with
  // the text (em-sized). The public /p/ render returns the bare children above, so
  // none of this appears there.
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onEdit(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}
      title="Tap to edit"
      className="cursor-pointer rounded-md bg-amber/10 px-1 outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/20 hover:outline-amber focus-visible:bg-amber/20 focus-visible:outline-amber"
    >
      {children}
      <PencilIcon className="ml-[0.25em] inline-block h-[0.72em] w-[0.72em] -translate-y-[0.08em] align-middle text-amber" />
    </span>
  );
}

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------- wordmark -------------------------------- */

/** Type-only wordmark (no logo) — display face + amber dot accent. */
function Wordmark({ businessName, size = "md", logoUrl }: { businessName: string; size?: "md" | "lg"; logoUrl?: string }) {
  // Uploaded logo takes precedence over the text wordmark when present.
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={businessName}
        className={`w-auto object-contain ${size === "lg" ? "h-12" : "h-9"}`}
      />
    );
  }
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span
        className={`font-display uppercase leading-tight text-white break-words ${
          size === "lg"
            ? "text-2xl tracking-[0.06em] sm:text-3xl sm:tracking-[0.08em]"
            : "text-lg tracking-[0.04em] sm:text-2xl sm:tracking-[0.06em]"
        }`}
      >
        {businessName}
      </span>
      <span className="mb-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
    </span>
  );
}

/* --------------------------------- header --------------------------------- */

function Header({
  businessName,
  telHref,
  phone,
  onBook,
  logoUrl,
  facebookUrl,
  instagramUrl,
  editable,
  onEditImage,
  onEditElement,
  bookingOnly = false,
}: {
  businessName: string;
  telHref: string;
  phone: string;
  onBook: () => void;
  logoUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  bookingOnly?: boolean;
  editable?: boolean;
  onEditImage?: (slot: BarberImageSlot) => void;
  onEditElement?: (key: string) => void;
}) {
  const canEditLogo = editable && onEditImage;
  const canEditSocials = editable && onEditElement;
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink/70 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/55">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        {canEditLogo ? (
          <button
            type="button"
            onClick={() => onEditImage!("logo")}
            title="Edit logo"
            className="group relative min-w-0 rounded-md bg-amber/10 px-1.5 py-1 outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/20 hover:outline-amber focus-visible:outline-none focus-visible:outline-amber"
          >
            <Wordmark businessName={businessName} logoUrl={logoUrl} />
            <span className="pointer-events-none absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber text-ink shadow">
              <PencilIcon className="h-3 w-3" />
            </span>
          </button>
        ) : (
          <a href="#top" className="min-w-0" aria-label={`${businessName} — home`}>
            <Wordmark businessName={businessName} logoUrl={logoUrl} />
          </a>
        )}

        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-400 md:flex">
          <a href="#services" className="transition-colors hover:text-white">
            Services
          </a>
          {!bookingOnly && (
            <a href="#gallery" className="transition-colors hover:text-white">
              Gallery
            </a>
          )}
          <a href="#hours" className="transition-colors hover:text-white">
            Hours
          </a>
          <a href="#visit" className="transition-colors hover:text-white">
            {bookingOnly ? 'Contact' : 'Visit'}
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Real socials (verified) — renders nothing when none present. In the live
              editor it's a tap target (even with none set) to edit the social URLs. */}
          {canEditSocials ? (
            <button
              type="button"
              onClick={() => onEditElement!("socials")}
              title="Edit social links"
              className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-2.5 py-1.5 text-xs font-semibold text-amber-soft outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/20 hover:outline-amber focus-visible:outline-none focus-visible:outline-amber"
            >
              {facebookUrl || instagramUrl ? (
                <SocialLinks variant="header" facebookUrl={facebookUrl} instagramUrl={instagramUrl} className="text-zinc-200" />
              ) : (
                <span>Socials</span>
              )}
              <PencilIcon className="h-3 w-3" />
            </button>
          ) : (
            <SocialLinks variant="header" facebookUrl={facebookUrl} instagramUrl={instagramUrl} className="mr-1 text-zinc-300" />
          )}
          {/* Secondary: call */}
          <a
            href={telHref}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.03] text-zinc-200 transition-all hover:-translate-y-0.5 hover:border-amber/50 hover:text-white"
            aria-label={`Call ${businessName} on ${phone}`}
          >
            <PhoneIcon className="h-4 w-4" />
          </a>
          {/* Primary: book */}
          <button
            type="button"
            onClick={onBook}
            className="group inline-flex items-center gap-2 rounded-full bg-amber px-4 py-2 text-sm font-bold text-ink shadow-accent-sm transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
          >
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Book now</span>
            <span className="sm:hidden">Book</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({
  businessName,
  category,
  heroHeadline,
  tagline,
  heroSrc,
  googleRating,
  reviewCount,
  googleReviewsUrl,
  onBook,
  onEditImage,
  editable,
  onEditElement,
}: {
  businessName: string;
  category?: string;
  heroHeadline: string;
  tagline: string;
  heroSrc: string;
  googleRating?: number;
  reviewCount?: number;
  googleReviewsUrl?: string;
  onBook: () => void;
  onEditImage?: (slot: BarberImageSlot) => void;
  editable?: boolean;
  onEditElement?: (key: string) => void;
}) {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[80vh] flex-col justify-end overflow-hidden sm:min-h-[88vh]"
    >
      {/* Pre-sign-in photo swap (only on /s/:token): a tap target over the hero
          photo, kept above the scrim (z-10) but the headline/CTAs sit in a higher
          stacking context below so they stay clickable. */}
      {onEditImage && (
        <button
          type="button"
          onClick={() => onEditImage("hero")}
          className="group absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/55 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-black/75"
        >
          <CameraIcon className="h-4 w-4" /> Change photo
        </button>
      )}
      {/* Full-bleed background image with slow ken-burns drift.
          NOTE: SmartImg's own wrapper is `position: relative`, which (by Tailwind
          source order) beats a plain `absolute`. `!absolute` forces it out of flow
          on ALL breakpoints so the photo is a true background with the text/scrim
          overlaid on top — including mobile (was `md:!absolute`, which left mobile
          as an in-flow block with a dead gap before the text). */}
      <SmartImg
        src={heroSrc}
        alt={`Inside ${businessName}`}
        loading="eager"
        zoom
        className="!absolute inset-0 -z-10 h-full w-full"
      />
      {/* Legibility + warmth gradients — anchored dark at the bottom/left for the
          text, but kept light enough on the right that the photograph reads.
          Tuned a touch darker so white text holds over bright photos on mobile. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/90 via-ink/35 to-transparent" />

      <div className="mx-auto w-full max-w-6xl px-5 pb-14 pt-24 sm:px-8 sm:pb-24 sm:pt-28">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow>
              <EditableText editable={editable} onEdit={() => onEditElement?.("businessName")}>
                {category ? `${businessName} · ${category}` : businessName}
              </EditableText>
            </Eyebrow>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-5 font-display text-5xl uppercase leading-[0.92] tracking-[0.01em] text-white break-words drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] sm:text-7xl md:text-8xl">
              <EditableText editable={editable} onEdit={() => onEditElement?.("heroHeadline")}>
                {heroHeadline}
              </EditableText>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
              <EditableText editable={editable} onEdit={() => onEditElement?.("tagline")}>
                {tagline}
              </EditableText>
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onBook}
                className="inline-flex items-center gap-2.5 rounded-full bg-amber px-7 py-3.5 text-base font-bold text-ink shadow-accent-lg transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
              >
                <CalendarIcon className="h-5 w-5" />
                Book now
              </button>
              <a
                href="#services"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-3.5 text-base font-semibold text-zinc-100 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-amber/50 hover:text-white"
              >
                View services
              </a>
            </div>
          </Reveal>

          {typeof googleRating === "number" && (
            <Reveal delay={0.24}>
              <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2 backdrop-blur-sm">
                <Stars rating={googleRating} />
                <span className="text-sm text-zinc-300">
                  <span className="font-bold text-white">{googleRating.toFixed(1)}</span>
                  {typeof reviewCount === "number" && (
                    <span className="text-zinc-400"> · {reviewCount} Google reviews</span>
                  )}
                </span>
              </div>
            </Reveal>
          )}

          {googleReviewsUrl && (
            <Reveal delay={0.28}>
              <div className="mt-4">
                <GoogleReviewsLink url={googleReviewsUrl} />
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- about --------------------------------- */

function About({ about, aboutHeading, businessName, stats, aboutImageUrl, onEditImage, editable, onEditElement }: { about: string; aboutHeading?: string; businessName: string; stats?: BarberStat[]; aboutImageUrl?: string; onEditImage?: (slot: BarberImageSlot) => void; editable?: boolean; onEditElement?: (key: string) => void }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className="order-2 md:order-1">
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-5 font-display text-4xl uppercase leading-[0.95] tracking-wide text-white sm:text-5xl">
            {/* Custom heading (verbatim) when set; otherwise the styled default —
                byte-identical for existing sites. Editable as one tap target. */}
            <EditableText editable={editable} onEdit={() => onEditElement?.("aboutHeading")}>
              {aboutHeading ? (
                aboutHeading
              ) : (
                <>
                  A proper cut,
                  <br />
                  <span className="text-amber">every time.</span>
                </>
              )}
            </EditableText>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-zinc-400">
            <EditableText editable={editable} onEdit={() => onEditElement?.("about")}>{about}</EditableText>
          </p>

          {stats && stats.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-8">
              {stats.map((s, i) => (
                <Stat key={`${s.label}-${i}`} value={s.value} label={s.label} />
              ))}
            </div>
          )}
        </Reveal>

        <Reveal delay={0.1} className="order-1 md:order-2">
          <div className="relative">
            <SmartImg
              src={aboutImageUrl || STOCK_INTERIOR}
              alt={`Inside ${businessName}`}
              className="aspect-[4/5] w-full rounded-3xl border border-white/[0.06] shadow-card"
              imgClassName="transition-transform duration-700 hover:scale-[1.04]"
            />
            {onEditImage && <ImageEditOverlay onClick={() => onEditImage("about")} radiusClass="rounded-3xl" />}
            {/* Floating accent badge. On mobile it sits INSIDE the image's bottom-left
                (positive inset) so it never overhangs the screen edge; on desktop it
                overhangs slightly as designed. */}
            <div className="absolute -bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-card/90 px-4 py-3 shadow-card backdrop-blur-sm sm:-bottom-5 sm:-left-5 sm:px-5 sm:py-4">
              <ScissorsIcon className="h-6 w-6 shrink-0 text-amber sm:h-7 sm:w-7" />
              <div className="leading-tight">
                <div className="font-display text-xl uppercase tracking-wide text-white sm:text-2xl">
                  Master barbers
                </div>
                <div className="text-xs text-zinc-400">Skin fades · beards · classics</div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl uppercase tracking-wide text-white">{value}</div>
      <div className="text-xs uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

/* ---------------------- example prices + reviews link ---------------------- */

// Illustrative default prices (GBP) used ONLY when showExamplePrices is on and a
// service has no confirmed price. Always labelled "Example" + shown under a
// disclaimer; never presented as real. Matched by lowercased service name.
const EXAMPLE_PRICES: Record<string, string> = {
  "signature cut": "£25",
  "skin fade": "£24",
  "cut & beard": "£35",
  "beard trim & shape": "£15",
  "beard trim": "£15",
  "hot-towel wet shave": "£28",
  "wet shave": "£28",
  "under 12s": "£16",
  "kids cut": "£16",
  haircut: "£22",
  fade: "£24",
};
const EXAMPLE_PRICE_FALLBACK = "from £20";

function examplePrice(name: string): string {
  return EXAMPLE_PRICES[name.trim().toLowerCase()] ?? EXAMPLE_PRICE_FALLBACK;
}

/** Google "G" mark (4-colour) for the reviews link. */
function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

/** "Read our Google reviews" pill — links to the real reviews. Renders nothing without a URL. */
function GoogleReviewsLink({ url, className = "" }: { url?: string; className?: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2.5 rounded-full border border-amber/45 bg-amber/[0.06] px-4 py-2 text-sm font-semibold text-amber-soft transition-colors hover:bg-amber/10 ${className}`}
    >
      <GoogleG className="h-4 w-4" />
      Read our Google reviews
      <span aria-hidden="true">→</span>
    </a>
  );
}

/* -------------------------------- services -------------------------------- */

function Services({
  services,
  showExamplePrices,
  editable = false,
  bookingOnly = false,
  onEditService,
  onAddService,
}: {
  services: BarberSiteContent["services"];
  showExamplePrices?: boolean;
  // Live editor (owner): tappable rows + add/remove. Public /p/ never sets this →
  // the read-only menu below is unchanged.
  editable?: boolean;
  bookingOnly?: boolean;
  onEditService?: (index: number) => void;
  onAddService?: () => void;
}) {
  if (editable) {
    return <OwnerServices services={services} bookingOnly={bookingOnly} onEditService={onEditService} onAddService={onAddService} />;
  }

  // Any service without a confirmed price shows an example only when the toggle
  // is on — which is also what triggers the bottom-of-section disclaimer.
  const anyExamples = !!showExamplePrices && services.some((s) => !s.price);
  return (
    <section
      id="services"
      className="border-y border-white/[0.06] bg-ink-soft/40 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal className="mb-12 text-center">
          <div className="flex justify-center">
            <Eyebrow>The menu</Eyebrow>
          </div>
          <h2 className="mt-5 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
            Services &amp; prices
          </h2>
        </Reveal>

        {/* Multi-column menu flow: 1 col on mobile → 2 (sm+). Two columns on desktop
            (not three) gives each service item enough width for its title to sit on one
            line. All items stay visible (no cap/hide) — break-inside-avoid keeps each
            row intact. */}
        <ul className="columns-1 gap-x-12 sm:columns-2">
          {services.map((s, i) => (
            <Reveal as="li" className="break-inside-avoid" key={`${s.name}-${i}`} delay={Math.min(i * 0.05, 0.3)}>
              <div className="group border-b border-white/[0.06] py-5">
                <div className="flex items-baseline gap-2">
                  {/* Title takes its natural width (NOT flex-1), so the dotted leader
                      fills only the leftover slack instead of splitting the row 50/50
                      and squeezing the title. Wraps only if genuinely too long. */}
                  <h3 className="min-w-0 text-lg font-bold text-white transition-colors group-hover:text-amber-soft">
                    {s.name}
                  </h3>
                  {/* dotted leader */}
                  <span className="mx-1 hidden flex-1 translate-y-[-3px] border-b border-dotted border-white/15 sm:block" />
                  {s.price ? (
                    <span className="shrink-0 font-display text-2xl tracking-wide text-amber">
                      {s.price}
                    </span>
                  ) : showExamplePrices ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-soft">
                        Example
                      </span>
                      <span className="font-display text-xl tracking-wide text-amber/55">
                        {examplePrice(s.name)}
                      </span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm font-medium uppercase tracking-wide text-zinc-500">
                      Price on request
                    </span>
                  )}
                </div>
                {/* Description on its own full-width line (was squeezed inside the
                    half-width title column before). */}
                {s.description && (
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                    {s.description}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </ul>

        {anyExamples && (
          <div className="mt-10 flex items-center justify-center gap-2 text-amber-soft/85">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-amber/75" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.5h.01" strokeLinecap="round" />
            </svg>
            <p className="text-center text-sm">Example prices shown for illustration.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Live-editor services (owner mode). Each service is a tappable, obviously-editable
 * row (dashed amber outline + pencil) opening the edit sheet via onEditService(i),
 * plus an "Add service" control. Replace/remove/field edits happen in the sheet.
 * Public /p/ uses the read-only menu in Services() above — untouched.
 */
function OwnerServices({
  services,
  bookingOnly = false,
  onEditService,
  onAddService,
}: {
  services: BarberSiteContent["services"];
  bookingOnly?: boolean;
  onEditService?: (index: number) => void;
  onAddService?: () => void;
}) {
  return (
    <section id="services" className="border-y border-white/[0.06] bg-ink-soft/40 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="mb-10 text-center">
          <div className="flex justify-center">
            <Eyebrow>The menu</Eyebrow>
          </div>
          <h2 className="mt-5 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
            Services &amp; prices
          </h2>
          {bookingOnly ? (
            <p className="mx-auto mt-4 max-w-xl rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-semibold text-amber-soft">
              👇 These are your services &amp; prices. Tap any one to change its name, <span className="text-white">price</span> and duration — or add your own below. This is exactly what customers see and book.
            </p>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Tap a service to edit it, or add a new one.</p>
          )}
        </div>

        <ul className="space-y-2.5">
          {services.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onEditService?.(i)}
                title="Tap to edit"
                className="group flex w-full items-center gap-3 rounded-xl bg-amber/10 px-4 py-4 text-left outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/20 hover:outline-amber focus-visible:bg-amber/20 focus-visible:outline-none focus-visible:outline-amber"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold text-white">{s.name || "New service"}</h3>
                  {s.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-zinc-400">{s.description}</p>}
                  {typeof s.durationMins === "number" && s.durationMins > 0 && (
                    <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{s.durationMins} min</p>
                  )}
                </div>
                <span className="shrink-0 font-display text-2xl tracking-wide text-amber">{s.price || "—"}</span>
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber text-ink">
                  <PencilIcon className="h-4 w-4" />
                </span>
              </button>
            </li>
          ))}
        </ul>

        {onAddService && (
          <button
            type="button"
            onClick={onAddService}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-4 text-sm font-semibold text-zinc-300 transition-colors hover:border-amber/50 hover:bg-amber/5 hover:text-amber-soft"
          >
            <PlusIcon className="h-5 w-5" /> {bookingOnly ? "Add a service & set its price" : "Add service"}
          </button>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- gallery -------------------------------- */

function Gallery({
  images,
  businessName,
  onEditImage,
  editable = false,
  ownerEditable = false,
  ownerImages = [],
  onAddImage,
}: {
  images: string[];
  businessName: string;
  onEditImage?: (slot: BarberImageSlot) => void;
  // Tap-to-swap is only offered when the gallery holds REAL photos (the index maps
  // to content.galleryImageUrls). Stock-fallback galleries aren't editable.
  editable?: boolean;
  // Live editor (owner): manage the REAL gallery directly — tap to replace, remove,
  // add, with an empty state. Bypasses the stock fallback so indices map to the
  // saved array. Public /p/ never sets this → unchanged below.
  ownerEditable?: boolean;
  ownerImages?: string[];
  onAddImage?: () => void;
}) {
  if (ownerEditable) {
    return (
      <OwnerGallery images={ownerImages} businessName={businessName} onEditImage={onEditImage} onAddImage={onAddImage} />
    );
  }

  // Render 1–10 images as a varied mosaic that adapts to the count (no gaps).
  const imgs = images.slice(0, 10);
  if (imgs.length === 0) return null;
  const canEdit = !!onEditImage && editable;

  const header = (
    <Reveal className="mb-12">
      <Eyebrow>The gallery</Eyebrow>
      <h2 className="mt-5 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
        Work off the chair
      </h2>
    </Reveal>
  );

  // 1–2 images → simple centered portrait tiles (no mosaic needed).
  if (imgs.length <= 2) {
    return (
      <section id="gallery" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        {header}
        <div className={imgs.length === 1 ? "mx-auto max-w-md" : "mx-auto grid max-w-2xl grid-cols-2 gap-3 sm:gap-4"}>
          {imgs.map((src, i) => (
            <Reveal as="figure" key={`${src}-${i}`} delay={Math.min(i * 0.05, 0.3)} className="relative">
              <SmartImg
                src={src}
                alt={`${businessName} — gallery ${i + 1}`}
                className="group w-full rounded-2xl border border-white/[0.06] aspect-[4/5]"
                imgClassName="transition-transform duration-700 group-hover:scale-105"
              />
              {canEdit && <ImageEditOverlay onClick={() => onEditImage!(`gallery-${i}` as BarberImageSlot)} />}
            </Reveal>
          ))}
        </div>
      </section>
    );
  }

  const layout = GALLERY_LAYOUTS[imgs.length];
  return (
    <section id="gallery" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      {header}
      <div className={`${GALLERY_GRID_BASE} ${layout.container}`}>
        {imgs.map((src, i) => (
          <Reveal
            as="figure"
            key={`${src}-${i}`}
            delay={Math.min(i * 0.05, 0.3)}
            className={`relative ${layout.tiles[i] ?? ""} ${
              imgs.length % 2 === 1 && i === imgs.length - 1 ? "max-md:col-span-2" : ""
            } h-full`}
          >
            <SmartImg
              src={src}
              alt={`${businessName} — gallery ${i + 1}`}
              className="group h-full w-full rounded-2xl border border-white/[0.06] aspect-square md:aspect-auto"
              imgClassName="transition-transform duration-700 group-hover:scale-105"
            />
            {canEdit && <ImageEditOverlay onClick={() => onEditImage!(`gallery-${i}` as BarberImageSlot)} />}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/**
 * Live-editor gallery (owner mode). Renders the owner's REAL photos in a clean
 * uniform grid, each with a tap-to-replace overlay, plus an "Add photo" tile and
 * an empty state. Replace/remove/add are driven by the editor's bottom sheet via
 * onEditImage(`gallery-i`) / onAddImage. Capped at 10 to match the classic editor.
 */
function OwnerGallery({
  images,
  businessName,
  onEditImage,
  onAddImage,
}: {
  images: string[];
  businessName: string;
  onEditImage?: (slot: BarberImageSlot) => void;
  onAddImage?: () => void;
}) {
  const OWNER_GALLERY_MAX = 10;
  return (
    <section id="gallery" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="mb-8">
        <Eyebrow>The gallery</Eyebrow>
        <h2 className="mt-5 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
          Work off the chair
        </h2>
        <p className="mt-3 text-sm text-zinc-400">
          {images.length === 0
            ? "Add photos of your work — they appear here on your live site."
            : "Tap a photo to replace or remove it, or add more."}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {images.map((src, i) => (
          <figure key={`${src}-${i}`} className="relative aspect-square">
            <SmartImg
              src={src}
              alt={`${businessName} — gallery ${i + 1}`}
              className="h-full w-full rounded-2xl border border-white/[0.06]"
            />
            {onEditImage && <ImageEditOverlay onClick={() => onEditImage(`gallery-${i}` as BarberImageSlot)} />}
          </figure>
        ))}
        {onAddImage && images.length < OWNER_GALLERY_MAX && (
          <button
            type="button"
            onClick={onAddImage}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] text-zinc-400 transition-colors hover:border-amber/50 hover:bg-amber/5 hover:text-amber-soft"
          >
            <CameraIcon className="h-7 w-7" />
            <span className="text-xs font-semibold">Add photo</span>
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- hours --------------------------------- */

function Hours({ hours, editable, onEditElement }: { hours: BarberSiteContent["hours"]; editable?: boolean; onEditElement?: (key: string) => void }) {
  const isClosed = (open: string) => /closed/i.test(open);
  return (
    <section id="hours" className="border-t border-white/[0.06] bg-ink-soft/40 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal className="mb-10 flex items-center gap-4">
          <ClockIcon className="h-8 w-8 text-amber" />
          <div>
            <Eyebrow>Drop in</Eyebrow>
            <h2 className="mt-3 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
              Opening hours
            </h2>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent shadow-card">
            {editable && onEditElement && <EditBlockOverlay onClick={() => onEditElement("hours")} label="Edit hours" />}
            <ul>
              {hours.map((h, i) => (
                <li
                  key={`${h.day}-${i}`}
                  className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-6 py-4 last:border-b-0"
                >
                  <span className="text-base font-semibold text-zinc-200">{h.day}</span>
                  <span
                    className={`text-base tabular-nums ${
                      isClosed(h.open) ? "text-zinc-500" : "text-amber-soft"
                    }`}
                  >
                    {h.open}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- contact -------------------------------- */

function Contact({
  businessName,
  phone,
  telHref,
  address,
  contactHeading,
  mapSrc,
  googleRating,
  reviewCount,
  googleReviewsUrl,
  onBook,
  bookingEnabled,
  editable,
  onEditElement,
}: {
  businessName: string;
  phone: string;
  telHref: string;
  address: string;
  contactHeading?: string;
  mapSrc: string;
  googleRating?: number;
  reviewCount?: number;
  googleReviewsUrl?: string;
  onBook: () => void;
  bookingEnabled?: boolean;
  editable?: boolean;
  onEditElement?: (key: string) => void;
}) {
  return (
    <section id="visit" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          <Eyebrow>Find us</Eyebrow>
          <h2 className="mt-5 font-display text-4xl uppercase tracking-wide text-white sm:text-5xl">
            <EditableText editable={editable} onEdit={() => onEditElement?.("contactHeading")}>
              {contactHeading || "Come and visit"}
            </EditableText>
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-zinc-400">
            Walk in or call ahead — we&apos;ll have the chair ready.
          </p>

          {bookingEnabled && (
            <button
              type="button"
              onClick={onBook}
              className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-amber px-7 py-3.5 text-base font-bold text-ink shadow-accent-lg transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
            >
              <CalendarIcon className="h-5 w-5" />
              Book now
            </button>
          )}

          <div className="relative mt-8 space-y-3">
            {editable && onEditElement && <EditBlockOverlay onClick={() => onEditElement("contact")} label="Edit contact details" />}
            <a
              href={telHref}
              className="group flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-amber/40"
              aria-label={`Call ${businessName} on ${phone}`}
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-amber/15 text-amber">
                <PhoneIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-widest text-zinc-500">
                  Call us
                </span>
                <span className="block text-lg font-bold text-white group-hover:text-amber-soft">
                  {phone}
                </span>
              </span>
            </a>

            <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-amber/15 text-amber">
                <PinIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-widest text-zinc-500">
                  Find us
                </span>
                <span className="block text-base font-medium text-zinc-200">{address}</span>
              </span>
            </div>

            {typeof googleRating === "number" && (
              <div className="flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-amber/15 text-amber">
                  <Star className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-widest text-zinc-500">
                    Rated on Google
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">
                      {googleRating.toFixed(1)}
                    </span>
                    <Stars rating={googleRating} />
                    {typeof reviewCount === "number" && (
                      <span className="text-sm text-zinc-400">({reviewCount})</span>
                    )}
                  </span>
                </span>
              </div>
            )}
          </div>

          {editable && onEditElement ? (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => onEditElement("googleReviews")}
                title="Edit Google reviews link"
                className="inline-flex items-center gap-2.5 rounded-full border border-amber/45 bg-amber/10 px-4 py-2 text-sm font-semibold text-amber-soft outline-dashed outline-2 outline-offset-2 outline-amber/60 transition-colors hover:bg-amber/20 hover:outline-amber focus-visible:outline-none focus-visible:outline-amber"
              >
                <GoogleG className="h-4 w-4" />
                {googleReviewsUrl ? "Edit Google reviews link" : "Add Google reviews link"}
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : googleReviewsUrl ? (
            <div className="mt-5">
              <GoogleReviewsLink url={googleReviewsUrl} />
            </div>
          ) : null}
        </Reveal>

        {mapSrc && (
          <Reveal delay={0.1}>
            <div className="h-full min-h-[360px] overflow-hidden rounded-3xl border border-white/[0.06] shadow-card">
              <iframe
                title={`Map to ${businessName}`}
                src={mapSrc}
                width="100%"
                height="360"
                className="h-full min-h-[360px] w-full"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- footer -------------------------------- */

function Footer({ businessName, address, logoUrl, facebookUrl, instagramUrl }: { businessName: string; address: string; logoUrl?: string; facebookUrl?: string; instagramUrl?: string }) {
  return (
    <footer className="border-t border-white/[0.06] bg-ink">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 text-center sm:flex-row sm:justify-between sm:gap-6 sm:px-8 sm:text-left">
        <Wordmark businessName={businessName} logoUrl={logoUrl} />
        <p className="text-sm text-zinc-500">{address}</p>
        <SocialLinks variant="footer" facebookUrl={facebookUrl} instagramUrl={instagramUrl} className="text-zinc-400" />
        <p className="text-xs text-zinc-600">
          © {businessName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ----------------------------- mobile book bar ---------------------------- */

/** Compact fixed bottom bar (mobile only). Page has matching bottom padding so
 *  it never sits over section content. */
function MobileBookBar({ onBook }: { onBook: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink/85 px-4 py-1.5 backdrop-blur-xl sm:hidden">
      <button
        type="button"
        onClick={onBook}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-amber py-2 text-[15px] font-bold text-ink shadow-accent-sm active:scale-[0.98]"
      >
        <CalendarIcon className="h-[18px] w-[18px]" />
        Book now
      </button>
    </div>
  );
}

/** Claim-preview bar: shown (all viewports) when the site is rendered on the
 *  /claim page so a barber can view their website, then claim it for free.
 *  Deliberately uses FIXED neutral colours (ink bar, white button) and NEVER the
 *  per-site --barber-accent, so it reads as a distinct platform overlay on every
 *  barber site whatever accent they picked. Compact on mobile; taller on desktop. */
function ClaimBar({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t-2 border-white/15 bg-ink/95 px-4 py-3 shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:py-5">
      {/* Fixed neutral hairline (NOT the per-site accent) for contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent"
      />
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white sm:text-xl">This is your new website</div>
          <div className="text-xs text-zinc-300 sm:text-sm">It's yours to keep.</div>
        </div>
        <div className="relative shrink-0 animate-claim-float">
          {/* Soft pulsing white glow (fixed, not accent-tied). */}
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full bg-white/25 opacity-60 blur-lg animate-pulse-slow"
          />
          <button
            type="button"
            onClick={onClaim}
            className="relative inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-ink shadow-[0_6px_28px_-6px_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 hover:bg-zinc-100 active:scale-[0.98] sm:px-9 sm:py-4 sm:text-lg"
          >
            Edit your site
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Booking flow (frontend-only, demo)                                         */
/*                                                                            */
/*  Pure client-side state — nothing is stored, sent, or charged. Time slots  */
/*  are generated from the shop's opening hours, with a deterministic subset   */
/*  marked as already taken so the flow feels real.                            */
/* -------------------------------------------------------------------------- */

const SLOT_STEP_MINS = 30;
const DAYS_AHEAD = 14;

type BookingStep = "service" | "datetime" | "details" | "confirm";

/** Appointment length: explicit duration, else inferred from the service name. */
function inferDuration(s: BarberService): number {
  if (typeof s.durationMins === "number" && s.durationMins > 0) return s.durationMins;
  const n = s.name.toLowerCase();
  if (/shave/.test(n)) return 45;
  if (/child|kid|under/.test(n)) return 30;
  if (/beard|trim|line|tidy/.test(n)) return 30;
  if (/cut|fade|skin|crop|style|colour|color/.test(n)) return 45;
  return 30;
}

function parseMinutes(t: string): number | null {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatMinutes(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
}

/** Open/close minutes for a given calendar date, or null if closed. */
function hoursForDate(
  hours: BarberOpeningHours[],
  date: Date
): { open: number; close: number } | null {
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" }).toLowerCase();
  const row = hours.find((h) => weekday.slice(0, 3) === h.day.trim().toLowerCase().slice(0, 3));
  if (!row || /closed/i.test(row.open)) return null;
  const parts = row.open.split(/[–—-]/);
  if (parts.length < 2) return null;
  const open = parseMinutes(parts[0]);
  const close = parseMinutes(parts[1]);
  if (open == null || close == null || close <= open) return null;
  return { open, close };
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Deterministic "already taken" flag so slots don't reshuffle between renders. */
function slotTaken(key: string, mins: number): boolean {
  let h = 2166136261;
  const s = `${key}@${mins}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100 < 38; // ~38% booked
}

/** Bookable slots for a date: open→close stepped by SLOT_STEP_MINS, with past
 *  (today only) and a deterministic ~38% marked as taken. */
function buildSlots(
  hours: BarberOpeningHours[],
  date: Date,
  duration: number,
  now: Date
): { mins: number; taken: boolean }[] {
  const dh = hoursForDate(hours, date);
  if (!dh) return [];
  const isToday = dateKey(date) === dateKey(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const key = dateKey(date);
  const out: { mins: number; taken: boolean }[] = [];
  for (let t = dh.open; t + duration <= dh.close; t += SLOT_STEP_MINS) {
    const past = isToday && t <= nowMins + 15;
    out.push({ mins: t, taken: past || slotTaken(key, t) });
  }
  return out;
}

function BookingModal({
  open,
  onClose,
  businessName,
  services,
  hours,
  phone,
  telHref,
}: {
  open: boolean;
  onClose: () => void;
  businessName: string;
  services: BarberService[];
  hours: BarberOpeningHours[];
  phone: string;
  telHref: string;
}) {
  const [step, setStep] = useState<BookingStep>("service");
  const [service, setService] = useState<BarberService | null>(null);
  const [dateIdx, setDateIdx] = useState<number | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phoneInput, setPhoneInput] = useState("");

  const reset = () => {
    setStep("service");
    setService(null);
    setDateIdx(null);
    setSlot(null);
    setName("");
    setPhoneInput("");
  };

  // Fresh start each time it opens.
  useEffect(() => {
    if (open) reset();
  }, [open]);

  // Lock background scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Next N days, flagged open/closed from the opening hours.
  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const arr: { date: Date; open: boolean }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push({ date: d, open: hoursForDate(hours, d) != null });
    }
    return arr;
  }, [hours]);

  const duration = service ? inferDuration(service) : SLOT_STEP_MINS;

  const slots = useMemo(() => {
    if (dateIdx == null || !days[dateIdx]) return [];
    return buildSlots(hours, days[dateIdx].date, duration, new Date());
  }, [dateIdx, days, hours, duration]);

  const chooseService = (s: BarberService) => {
    setService(s);
    setSlot(null);
    // Land on the first day that actually has an open slot (skip today if it's
    // already past closing / fully booked, and skip closed days).
    const dur = inferDuration(s);
    const now = new Date();
    let idx = days.findIndex(
      (d) => d.open && buildSlots(hours, d.date, dur, now).some((sl) => !sl.taken)
    );
    if (idx < 0) idx = days.findIndex((d) => d.open);
    setDateIdx(idx >= 0 ? idx : null);
    setStep("datetime");
  };

  const selectedDate = dateIdx != null && days[dateIdx] ? days[dateIdx].date : null;
  const nameValid = name.trim().length >= 2;
  const phoneValid = phoneInput.replace(/\D/g, "").length >= 7;
  const detailsValid = nameValid && phoneValid;

  const ghostBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-zinc-200 transition-all hover:border-amber/40 hover:text-white";
  const amberBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-amber px-5 py-3 text-sm font-bold text-ink transition-all hover:bg-amber-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-amber";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="barber-site fixed inset-0 z-[60] flex font-body sm:items-center sm:justify-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Book at ${businessName}`}
            className="relative flex h-full w-full flex-col overflow-hidden bg-ink-soft text-zinc-300 sm:h-auto sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl sm:border sm:border-white/10 sm:shadow-card"
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="truncate font-display text-xl uppercase tracking-wide text-white">
                  {businessName}
                </span>
                <span className="shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-soft">
                  Demo preview
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close booking"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300 transition-colors hover:border-amber/40 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Step progress (hidden on confirmation) */}
            {step !== "confirm" && <StepProgress step={step} />}

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {step === "service" && (
                <div className="space-y-2.5">
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-zinc-500">
                    Choose a service
                  </h3>
                  {services.map((s, i) => {
                    const dur = inferDuration(s);
                    return (
                      <button
                        key={`${s.name}-${i}`}
                        type="button"
                        onClick={() => chooseService(s)}
                        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-amber/40 hover:bg-white/[0.04]"
                      >
                        <span className="min-w-0">
                          <span className="block font-bold text-white group-hover:text-amber-soft">
                            {s.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-400">
                            {dur} min{s.description ? ` · ${s.description}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          {s.price ? (
                            <span className="font-display text-xl tracking-wide text-amber">
                              {s.price}
                            </span>
                          ) : (
                            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Price on request
                            </span>
                          )}
                          <ChevronLeftIcon className="h-4 w-4 rotate-180 text-zinc-600 transition-colors group-hover:text-amber" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === "datetime" && (
                <div>
                  {service && (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                      <span className="text-sm text-zinc-300">
                        <span className="font-bold text-white">{service.name}</span>
                        <span className="text-zinc-500"> · {duration} min</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setStep("service")}
                        className="text-xs font-semibold uppercase tracking-widest text-amber-soft hover:text-amber"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-500">
                    Pick a day
                  </h3>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                    {days.map((d, i) => {
                      const active = i === dateIdx;
                      const wd = d.date.toLocaleDateString("en-GB", { weekday: "short" });
                      const mo = d.date.toLocaleDateString("en-GB", { month: "short" });
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!d.open}
                          onClick={() => {
                            setDateIdx(i);
                            setSlot(null);
                          }}
                          className={`flex min-w-[60px] shrink-0 flex-col items-center rounded-2xl border px-3 py-2.5 text-center transition-all ${
                            active
                              ? "border-amber bg-amber/15 text-white"
                              : d.open
                                ? "border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:border-amber/40"
                                : "border-white/[0.04] text-zinc-600"
                          }`}
                        >
                          <span className="text-[11px] uppercase tracking-wide">{wd}</span>
                          <span className="text-lg font-bold leading-tight">{d.date.getDate()}</span>
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                            {d.open ? mo : "Closed"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-widest text-zinc-500">
                    Choose a time
                  </h3>
                  {slots.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-400">
                      No slots on this day — try another date.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((sl) => (
                        <button
                          key={sl.mins}
                          type="button"
                          disabled={sl.taken}
                          onClick={() => {
                            setSlot(sl.mins);
                            setStep("details");
                          }}
                          className={`rounded-xl border px-2 py-2.5 text-sm font-semibold tabular-nums transition-all ${
                            sl.taken
                              ? "cursor-not-allowed border-white/[0.04] text-zinc-600 line-through"
                              : slot === sl.mins
                                ? "border-amber bg-amber/20 text-white"
                                : "border-white/[0.08] bg-white/[0.02] text-zinc-200 hover:border-amber/50 hover:text-white"
                          }`}
                        >
                          {formatMinutes(sl.mins)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "details" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
                    Your details
                  </h3>
                  <div>
                    <label htmlFor="bk-name" className="mb-1.5 block text-xs uppercase tracking-widest text-zinc-500">
                      Your name
                    </label>
                    <input
                      id="bk-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. James Carter"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-amber/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="bk-phone" className="mb-1.5 block text-xs uppercase tracking-widest text-zinc-500">
                      Mobile number
                    </label>
                    <input
                      id="bk-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="e.g. 07700 900123"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-amber/60"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    This is a demo — your details stay in your browser and aren&apos;t saved, sent,
                    or charged anywhere.
                  </p>
                </div>
              )}

              {step === "confirm" && (
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber/15 text-amber">
                    <CheckIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-5 font-display text-3xl uppercase tracking-wide text-white">
                    You&apos;re booked in
                  </h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    {name.trim().split(/\s+/)[0]}, here&apos;s your appointment:
                  </p>
                  <div className="mt-6 space-y-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left">
                    <BookingRow
                      label="Service"
                      value={`${service?.name ?? ""}${service?.price ? ` · ${service.price}` : ""}`}
                    />
                    <BookingRow label="Length" value={`${duration} min`} />
                    <BookingRow
                      label="When"
                      value={
                        selectedDate
                          ? `${selectedDate.toLocaleDateString("en-GB", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}${slot != null ? ` · ${formatMinutes(slot)}` : ""}`
                          : ""
                      }
                    />
                    <BookingRow label="Name" value={name.trim()} />
                    <BookingRow label="Mobile" value={phoneInput.trim()} />
                  </div>
                  <div className="mt-5 rounded-xl border border-amber/25 bg-amber/[0.07] px-4 py-3 text-xs leading-relaxed text-amber-soft">
                    Demo preview — no appointment was actually booked and nothing was sent.
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-white/[0.06] px-5 py-4">
              {step === "service" && (
                <a
                  href={telHref}
                  className="flex items-center justify-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-amber-soft"
                >
                  <PhoneIcon className="h-4 w-4" />
                  Prefer to call? {phone}
                </a>
              )}
              {step === "datetime" && (
                <button type="button" onClick={() => setStep("service")} className={ghostBtn}>
                  <ChevronLeftIcon className="h-4 w-4" />
                  Back
                </button>
              )}
              {step === "details" && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setStep("datetime")} className={ghostBtn}>
                    <ChevronLeftIcon className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!detailsValid}
                    onClick={() => setStep("confirm")}
                    className={`flex-1 ${amberBtn}`}
                  >
                    <CheckIcon className="h-4 w-4" />
                    Confirm booking
                  </button>
                </div>
              )}
              {step === "confirm" && (
                <div className="flex items-center gap-3">
                  <button type="button" onClick={reset} className={ghostBtn}>
                    Book another
                  </button>
                  <button type="button" onClick={onClose} className={`flex-1 ${amberBtn}`}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StepProgress({ step }: { step: BookingStep }) {
  const order: BookingStep[] = ["service", "datetime", "details"];
  const labels = ["Service", "Date & time", "Details"];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
      {order.map((key, i) => (
        <div key={key} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
              i <= idx ? "bg-amber text-ink" : "bg-white/[0.06] text-zinc-500"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`truncate text-xs font-medium ${
              i === idx ? "text-white" : "text-zinc-500"
            }`}
          >
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function BookingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="shrink-0 text-xs uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="text-right text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

export default BarberSiteTemplate;
