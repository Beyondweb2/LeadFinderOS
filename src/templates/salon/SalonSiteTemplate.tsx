import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import "./fonts.css";
import { STOCK_GALLERY, STOCK_HERO, STOCK_INTERIOR } from "./assets";
import { BookingFlow } from "../barber/BookingFlow";
import type { SiteOpeningHours, SiteService, SiteContent, SiteStat } from "../shared/content";
import { GALLERY_LAYOUTS, GALLERY_GRID_BASE } from "../shared/galleryLayout";
import { SocialLinks } from "../shared/SocialLinks";

/* -------------------------------------------------------------------------- */
/*  SalonSiteTemplate                                                          */
/*                                                                            */
/*  A single-page, mobile-first marketing site for a UK hair / beauty salon.   */
/*  Same layout skeleton, section rhythm and components as the barber template */
/*  — this is a SKIN, not a relayout — but light, airy and feminine: warm      */
/*  off-white surfaces, a rose accent, Playfair Display headings and soft,     */
/*  diffuse shadows. Every visual class is salon-scoped (salon-* tokens under  */
/*  the .salon-site root), so it can never leak into the barber template.      */
/*                                                                            */
/*  Fully self-contained: fonts and stock photography are bundled locally; the */
/*  only runtime network call is the (key-less) Google Maps embed iframe.      */
/* -------------------------------------------------------------------------- */

export function SalonSiteTemplate({
  content,
  bookingEnabled = false,
  bookingSlug,
  onClaim,
  showClaimBar = true,
}: {
  content: SiteContent;
  /**
   * Online booking is enabled when the salon has set up bookable staff + hours.
   * When true, "Book now" opens the real booking flow; when false it honestly
   * routes to the contact/call section instead.
   */
  bookingEnabled?: boolean;
  /**
   * The site's slug (site_name). Required for the REAL booking flow. When present
   * (the public /p/:slug page), "Book now" opens <BookingFlow>; when absent
   * (admin/claim preview) it falls back to the frontend-only demo modal.
   */
  bookingSlug?: string;
  /**
   * When set, the site renders in "claim preview" mode: a fixed "Claim for free"
   * bar replaces the mobile Book bar so an owner can view their site before
   * signing up. Used by the /claim page; the public /p/:slug site never sets it.
   */
  onClaim?: () => void;
  /**
   * Hide the fixed "Claim for free" bar while it should not be tappable — e.g.
   * while the intro popup is open on /s/:token, so a tap can't land on the bar
   * behind the popup (the cause of the "double-press"). Defaults to shown.
   */
  showClaimBar?: boolean;
}) {
  const {
    businessName,
    category,
    tagline,
    heroHeadline,
    about,
    services,
    hours,
    phone,
    address,
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

  const heroSrc = heroImageUrl || STOCK_HERO;
  const gallery =
    galleryImageUrls && galleryImageUrls.length > 0 ? galleryImageUrls : STOCK_GALLERY;

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
    <div className="salon-site font-body text-salon-muted antialiased">
      {/* Light, scoped background so the page looks right regardless of host body
          styles. Two whisper-soft rose radials over warm off-white. */}
      {/* pb on mobile clears the fixed bottom Book bar so no section sits under it */}
      <div
        className={`relative min-h-screen bg-salon-bg ${onClaim ? "pb-[104px] sm:pb-[140px]" : "pb-[76px] sm:pb-0"}`}
        style={{
          backgroundImage:
            "radial-gradient(1100px 600px at 85% -8%, rgba(192,132,151,0.10), transparent 60%)," +
            "radial-gradient(800px 500px at -10% 8%, rgba(143,169,140,0.07), transparent 55%)",
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
          />
          <About about={about} businessName={businessName} stats={stats} aboutImageUrl={aboutImageUrl} />
          <Services services={services} showExamplePrices={showExamplePrices} claimPreview={!!onClaim} />
          <Gallery images={gallery} businessName={businessName} />
          <Hours hours={hours} />
          <Contact
            businessName={businessName}
            phone={phone}
            telHref={telHref}
            address={address}
            mapSrc={mapSrc}
            googleRating={googleRating}
            reviewCount={reviewCount}
            googleReviewsUrl={googleReviewsUrl}
            onBook={openBooking}
            bookingEnabled={bookingEnabled}
          />
        </main>

        <Footer businessName={businessName} address={address} logoUrl={logoUrl} facebookUrl={facebookUrl} instagramUrl={instagramUrl} />
      </div>

      {/* Mobile-only sticky Book bar — owners open the link on a phone. */}
      {onClaim ? (showClaimBar ? <ClaimBar onClaim={onClaim} /> : null) : <MobileBookBar onBook={openBooking} />}

      {/* Public site → real booking flow (keyed off the slug). Admin/claim
          preview (no slug) → the frontend-only demo modal. */}
      {bookingSlug ? (
        <BookingFlow
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          slug={bookingSlug}
          content={content}
          variant="salon"
        />
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

/** Image with a graceful soft fallback if the src fails to load. */
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
    <div className={`relative overflow-hidden bg-salon-line/50 ${className}`}>
      {failed ? (
        <div className="absolute inset-0 bg-gradient-to-br from-salon-line via-salon-bg to-white">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, #C08497 0, #C08497 1px, transparent 1px, transparent 22px)",
            }}
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${zoom ? "animate-kenburns" : ""} ${imgClassName}`}
        />
      )}
    </div>
  );
}

/** Uppercase tracked eyebrow label with a short soft-rose rule. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-salon-rose-soft/70" />
      <span className="text-xs font-semibold uppercase tracking-[0.28em] text-salon-rose-soft">
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
            <Star className="absolute inset-0 h-4 w-4 text-salon-ink/15" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="h-4 w-4 text-salon-rose" />
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
      <path d="M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z" stroke="currentColor" strokeWidth="1.6" />
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

/** Soft flower / bloom mark — the salon counterpart to the barber's scissors. */
function BloomIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 9.6V4.5M12 14.4v5.1M14.4 12h5.1M9.6 12H4.5M13.7 10.3l3.6-3.6M6.7 17.3l3.6-3.6M13.7 13.7l3.6 3.6M6.7 6.7l3.6 3.6"
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

/** Type-only wordmark (no logo) — Playfair face + a small rose dot accent. */
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
    <span className="inline-flex items-baseline gap-1">
      <span
        className={`font-salon-display leading-none text-salon-ink ${
          size === "lg" ? "text-3xl tracking-[0.01em]" : "text-2xl"
        }`}
      >
        {businessName}
      </span>
      <span className="mb-1 inline-block h-1.5 w-1.5 rounded-full bg-salon-rose" />
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
}: {
  businessName: string;
  telHref: string;
  phone: string;
  onBook: () => void;
  logoUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-salon-line bg-salon-bg/75 backdrop-blur-xl supports-[backdrop-filter]:bg-salon-bg/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <a href="#top" className="shrink-0" aria-label={`${businessName} — home`}>
          <Wordmark businessName={businessName} logoUrl={logoUrl} />
        </a>

        <nav className="hidden items-center gap-8 text-sm font-medium text-salon-muted md:flex">
          <a href="#services" className="transition-colors hover:text-salon-ink">
            Services
          </a>
          <a href="#gallery" className="transition-colors hover:text-salon-ink">
            Gallery
          </a>
          <a href="#hours" className="transition-colors hover:text-salon-ink">
            Hours
          </a>
          <a href="#visit" className="transition-colors hover:text-salon-ink">
            Visit
          </a>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Real socials (verified) — renders nothing when none present. */}
          <SocialLinks variant="header" facebookUrl={facebookUrl} instagramUrl={instagramUrl} className="mr-1 text-salon-muted" />
          {/* Secondary: call */}
          <a
            href={telHref}
            className="grid h-10 w-10 place-items-center rounded-full border border-salon-line bg-white text-salon-ink transition-all hover:-translate-y-0.5 hover:border-salon-rose/50 hover:text-salon-rose"
            aria-label={`Call ${businessName} on ${phone}`}
          >
            <PhoneIcon className="h-4 w-4" />
          </a>
          {/* Primary: book */}
          <button
            type="button"
            onClick={onBook}
            className="group inline-flex items-center gap-2 rounded-full bg-salon-rose px-4 py-2 text-sm font-bold text-white salon-shadow-sm transition-all hover:-translate-y-0.5 hover:bg-salon-rose-deep"
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
}) {
  return (
    <section
      id="top"
      className="relative isolate flex min-h-[88vh] flex-col justify-end overflow-hidden"
    >
      {/* Full-bleed background image with slow drift. `!absolute` forces it out of
          flow on ALL breakpoints so the photo is a true background with the
          text/scrim overlaid on top. */}
      <SmartImg
        src={heroSrc}
        alt={`Inside ${businessName}`}
        loading="eager"
        zoom
        className="!absolute inset-0 -z-10 h-full w-full"
      />
      {/* Legibility scrims — a warm off-white wash anchored at the bottom/left so
          the charcoal text always sits on near-solid light, while the photo still
          reads on the right. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-salon-bg via-salon-bg/85 to-salon-bg/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-salon-bg/90 via-salon-bg/40 to-transparent" />

      <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-28 sm:px-8 sm:pb-24">
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow>{category ? `${businessName} · ${category}` : businessName}</Eyebrow>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="mt-5 font-salon-display text-5xl leading-[1.02] tracking-[-0.01em] text-salon-ink drop-shadow-[0_1px_16px_rgba(250,246,243,0.7)] sm:text-6xl md:text-7xl">
              {heroHeadline}
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-salon-muted sm:text-xl">
              {tagline}
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onBook}
                className="inline-flex items-center gap-2.5 rounded-full bg-salon-rose px-7 py-3.5 text-base font-bold text-white salon-shadow-lg transition-all hover:-translate-y-0.5 hover:bg-salon-rose-deep"
              >
                <CalendarIcon className="h-5 w-5" />
                Book now
              </button>
              <a
                href="#services"
                className="inline-flex items-center gap-2 rounded-full border border-salon-rose-border bg-white/70 px-6 py-3.5 text-base font-semibold text-salon-rose backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-salon-rose hover:bg-white"
              >
                View services
              </a>
            </div>
          </Reveal>

          {typeof googleRating === "number" && (
            <Reveal delay={0.24}>
              <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-salon-line bg-white/80 px-4 py-2 backdrop-blur-sm">
                <Stars rating={googleRating} />
                <span className="text-sm text-salon-muted">
                  <span className="font-bold text-salon-ink">{googleRating.toFixed(1)}</span>
                  {typeof reviewCount === "number" && (
                    <span className="text-salon-faint"> · {reviewCount} Google reviews</span>
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

function About({ about, businessName, stats, aboutImageUrl }: { about: string; businessName: string; stats?: SiteStat[]; aboutImageUrl?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
        <Reveal className="order-2 md:order-1">
          <Eyebrow>Our story</Eyebrow>
          <h2 className="mt-5 font-salon-display text-4xl leading-[1.05] tracking-[-0.01em] text-salon-ink sm:text-5xl">
            Considered care,
            <br />
            <span className="italic text-salon-rose">every visit.</span>
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-salon-muted">{about}</p>

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
              className="aspect-[4/5] w-full rounded-3xl border border-salon-line salon-shadow"
              imgClassName="transition-transform duration-700 hover:scale-[1.04]"
            />
            {/* Floating accent badge — the salon's single sage touch. */}
            <div className="absolute -bottom-5 -left-3 flex items-center gap-3 rounded-2xl border border-salon-line bg-white/95 px-5 py-4 salon-shadow backdrop-blur-sm sm:-left-5">
              <BloomIcon className="h-7 w-7 text-salon-sage" />
              <div className="leading-tight">
                <div className="font-salon-display text-2xl text-salon-ink">Colour &amp; cutting</div>
                <div className="text-xs text-salon-faint">Balayage · gloss · styling</div>
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
      <div className="font-salon-display text-3xl text-salon-ink">{value}</div>
      <div className="text-xs uppercase tracking-widest text-salon-faint">{label}</div>
    </div>
  );
}

/* ---------------------- example prices + reviews link ---------------------- */

// Illustrative default prices (GBP) used ONLY when showExamplePrices is on and a
// service has no confirmed price. Always labelled "Example" + shown under a
// disclaimer; never presented as real. Matched by lowercased service name.
const EXAMPLE_PRICES: Record<string, string> = {
  "cut & finish": "£50",
  "cut and finish": "£50",
  "cut & blow-dry": "£50",
  "ladies cut": "£48",
  balayage: "from £130",
  highlights: "from £110",
  "full head colour": "from £90",
  "half head highlights": "from £85",
  "root tint": "£60",
  "gloss & toner": "£38",
  toner: "£38",
  "blow-dry": "£35",
  blowdry: "£35",
  treatment: "£30",
  "bridal & occasion": "from £80",
};
const EXAMPLE_PRICE_FALLBACK = "from £40";

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
      className={`inline-flex items-center gap-2.5 rounded-full border border-salon-rose-border bg-salon-rose/[0.06] px-4 py-2 text-sm font-semibold text-salon-rose-deep transition-colors hover:bg-salon-rose/10 ${className}`}
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
  claimPreview = false,
}: {
  services: SiteContent["services"];
  showExamplePrices?: boolean;
  // Pre-claim preview (/s/): the example-prices note nudges that prices are editable
  // after sign-up. False on the live /p/ site (which never sets onClaim), keeping the
  // neutral "for illustration" wording. Derived from !!onClaim.
  claimPreview?: boolean;
}) {
  // Any service without a confirmed price shows an example only when the toggle
  // is on — which is also what triggers the bottom-of-section disclaimer.
  const anyExamples = !!showExamplePrices && services.some((s) => !s.price);
  return (
    <section id="services" className="border-y border-salon-line bg-salon-surface py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <Reveal className="mb-12 text-center">
          <div className="flex justify-center">
            <Eyebrow>The menu</Eyebrow>
          </div>
          <h2 className="mt-5 font-salon-display text-4xl tracking-[-0.01em] text-salon-ink sm:text-5xl">
            Services &amp; prices
          </h2>
        </Reveal>

        {/* Multi-column menu flow: 1 col on mobile → 2 (sm) → 3 (lg), so a long menu
            stays ~a third the height instead of one endless column. All items stay
            visible (no cap/hide) — break-inside-avoid keeps each row intact. */}
        <ul className="columns-1 gap-x-12 sm:columns-2 lg:columns-3">
          {services.map((s, i) => (
            <Reveal as="li" className="break-inside-avoid" key={`${s.name}-${i}`} delay={Math.min(i * 0.05, 0.3)}>
              <div className="group flex items-baseline gap-3 border-b border-salon-line py-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-lg font-bold text-salon-ink transition-colors group-hover:text-salon-rose">
                      {s.name}
                    </h3>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-sm leading-relaxed text-salon-muted">{s.description}</p>
                  )}
                </div>
                {/* dotted leader */}
                <span className="mx-1 hidden flex-1 translate-y-[-3px] border-b border-dotted border-salon-line sm:block" />
                {s.price ? (
                  <span className="shrink-0 font-salon-display text-2xl text-salon-rose">{s.price}</span>
                ) : showExamplePrices ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded bg-salon-rose/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-salon-rose-deep">
                      Example
                    </span>
                    <span className="font-salon-display text-xl text-salon-rose/60">
                      {examplePrice(s.name)}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-medium uppercase tracking-wide text-salon-faint">
                    Price on request
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </ul>

        {anyExamples && (
          <div className="mt-10 flex items-center justify-center gap-2 text-salon-rose-deep/85">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-salon-rose/75" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.5h.01" strokeLinecap="round" />
            </svg>
            <p className="text-center text-sm">{claimPreview ? "Example prices shown - fully customisable after sign up" : "Example prices shown for illustration."}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- gallery -------------------------------- */

function Gallery({ images, businessName }: { images: string[]; businessName: string }) {
  // Render 1–10 images as a varied mosaic that adapts to the count (no gaps).
  const imgs = images.slice(0, 10);
  if (imgs.length === 0) return null;

  const header = (
    <Reveal className="mb-12">
      <Eyebrow>The gallery</Eyebrow>
      <h2 className="mt-5 font-salon-display text-4xl tracking-[-0.01em] text-salon-ink sm:text-5xl">
        From the chair
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
            <Reveal as="figure" key={`${src}-${i}`} delay={Math.min(i * 0.05, 0.3)}>
              <SmartImg
                src={src}
                alt={`${businessName} — gallery ${i + 1}`}
                className="group w-full rounded-2xl border border-salon-line aspect-[4/5]"
                imgClassName="transition-transform duration-700 group-hover:scale-105"
              />
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
            className={`${layout.tiles[i] ?? ""} ${
              imgs.length % 2 === 1 && i === imgs.length - 1 ? "max-md:col-span-2" : ""
            } h-full`}
          >
            <SmartImg
              src={src}
              alt={`${businessName} — gallery ${i + 1}`}
              className="group h-full w-full rounded-2xl border border-salon-line aspect-square md:aspect-auto"
              imgClassName="transition-transform duration-700 group-hover:scale-105"
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------- hours --------------------------------- */

function Hours({ hours }: { hours: SiteContent["hours"] }) {
  const isClosed = (open: string) => /closed/i.test(open);
  return (
    <section id="hours" className="border-t border-salon-line bg-salon-surface py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-8">
        <Reveal className="mb-10 flex items-center gap-4">
          <ClockIcon className="h-8 w-8 text-salon-rose" />
          <div>
            <Eyebrow>Drop in</Eyebrow>
            <h2 className="mt-3 font-salon-display text-4xl tracking-[-0.01em] text-salon-ink sm:text-5xl">
              Opening hours
            </h2>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="overflow-hidden rounded-2xl border border-salon-line bg-white salon-shadow">
            <ul>
              {hours.map((h, i) => (
                <li
                  key={`${h.day}-${i}`}
                  className="flex items-center justify-between gap-4 border-b border-salon-line px-6 py-4 last:border-b-0"
                >
                  <span className="text-base font-semibold text-salon-ink">{h.day}</span>
                  <span
                    className={`text-base tabular-nums ${
                      isClosed(h.open) ? "text-salon-faint" : "text-salon-rose-deep"
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
  mapSrc,
  googleRating,
  reviewCount,
  googleReviewsUrl,
  onBook,
  bookingEnabled,
}: {
  businessName: string;
  phone: string;
  telHref: string;
  address: string;
  mapSrc: string;
  googleRating?: number;
  reviewCount?: number;
  googleReviewsUrl?: string;
  onBook: () => void;
  bookingEnabled?: boolean;
}) {
  return (
    <section id="visit" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
      <div className="grid gap-10 md:grid-cols-2 md:gap-14">
        <Reveal>
          <Eyebrow>Find us</Eyebrow>
          <h2 className="mt-5 font-salon-display text-4xl tracking-[-0.01em] text-salon-ink sm:text-5xl">
            Come and visit
          </h2>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-salon-muted">
            Pop in or call ahead — we&apos;ll have everything ready for you.
          </p>

          {bookingEnabled && (
            <button
              type="button"
              onClick={onBook}
              className="mt-6 inline-flex items-center gap-2.5 rounded-full bg-salon-rose px-7 py-3.5 text-base font-bold text-white salon-shadow-lg transition-all hover:-translate-y-0.5 hover:bg-salon-rose-deep"
            >
              <CalendarIcon className="h-5 w-5" />
              Book now
            </button>
          )}

          <div className="mt-8 space-y-3">
            <a
              href={telHref}
              className="group flex items-center gap-4 rounded-2xl border border-salon-line bg-white px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-salon-rose/40"
              aria-label={`Call ${businessName} on ${phone}`}
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-salon-rose/10 text-salon-rose">
                <PhoneIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-widest text-salon-faint">Call us</span>
                <span className="block text-lg font-bold text-salon-ink group-hover:text-salon-rose">
                  {phone}
                </span>
              </span>
            </a>

            <div className="flex items-center gap-4 rounded-2xl border border-salon-line bg-white px-5 py-4">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-salon-rose/10 text-salon-rose">
                <PinIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs uppercase tracking-widest text-salon-faint">Find us</span>
                <span className="block text-base font-medium text-salon-ink">{address}</span>
              </span>
            </div>

            {typeof googleRating === "number" && (
              <div className="flex items-center gap-4 rounded-2xl border border-salon-line bg-white px-5 py-4">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-salon-rose/10 text-salon-rose">
                  <Star className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs uppercase tracking-widest text-salon-faint">
                    Rated on Google
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-bold text-salon-ink">{googleRating.toFixed(1)}</span>
                    <Stars rating={googleRating} />
                    {typeof reviewCount === "number" && (
                      <span className="text-sm text-salon-muted">({reviewCount})</span>
                    )}
                  </span>
                </span>
              </div>
            )}
          </div>

          {googleReviewsUrl && (
            <div className="mt-5">
              <GoogleReviewsLink url={googleReviewsUrl} />
            </div>
          )}
        </Reveal>

        {mapSrc && (
          <Reveal delay={0.1}>
            <div className="h-full min-h-[360px] overflow-hidden rounded-3xl border border-salon-line salon-shadow">
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
    <footer className="border-t border-salon-line bg-salon-bg">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-10 text-center sm:flex-row sm:justify-between sm:gap-6 sm:px-8 sm:text-left">
        <Wordmark businessName={businessName} logoUrl={logoUrl} />
        <p className="text-sm text-salon-faint">{address}</p>
        <SocialLinks variant="footer" facebookUrl={facebookUrl} instagramUrl={instagramUrl} className="text-salon-muted" />
        <p className="text-xs text-salon-faint">© {businessName}. All rights reserved.</p>
      </div>
    </footer>
  );
}

/* ----------------------------- mobile book bar ---------------------------- */

/** Compact fixed bottom bar (mobile only). Page has matching bottom padding so
 *  it never sits over section content. */
function MobileBookBar({ onBook }: { onBook: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-salon-line bg-salon-bg/90 px-4 py-1.5 backdrop-blur-xl sm:hidden">
      <button
        type="button"
        onClick={onBook}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-salon-rose py-2 text-[15px] font-bold text-white salon-shadow-sm active:scale-[0.98]"
      >
        <CalendarIcon className="h-[18px] w-[18px]" />
        Book now
      </button>
    </div>
  );
}

/** Claim-preview bar: shown (all viewports) when the site is rendered on the
 *  /claim page so an owner can view their website, then claim it for free.
 *  A clean light platform bar (charcoal text, rose button) to suit the salon. */
function ClaimBar({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t border-salon-line bg-white/95 px-4 py-3 salon-shadow-lg backdrop-blur-xl sm:py-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <div className="text-sm font-bold text-salon-ink sm:text-xl">This is your new website</div>
          <div className="text-xs text-salon-muted sm:text-sm">It&apos;s free — no card needed.</div>
        </div>
        <div className="relative shrink-0 animate-claim-float">
          <span
            aria-hidden
            className="absolute -inset-1 rounded-full bg-salon-rose/25 opacity-60 blur-lg animate-pulse-slow"
          />
          <button
            type="button"
            onClick={onClaim}
            className="relative inline-flex items-center gap-2 rounded-full bg-salon-rose px-6 py-2.5 text-sm font-bold text-white salon-shadow-lg transition-all hover:-translate-y-0.5 hover:bg-salon-rose-deep active:scale-[0.98] sm:px-9 sm:py-4 sm:text-lg"
          >
            Claim for free
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
/*  are generated from the salon's opening hours, with a deterministic subset  */
/*  marked as already taken so the flow feels real.                            */
/* -------------------------------------------------------------------------- */

const SLOT_STEP_MINS = 30;
const DAYS_AHEAD = 14;

type BookingStep = "service" | "datetime" | "details" | "confirm";

/** Appointment length: explicit duration, else inferred from the service name. */
function inferDuration(s: SiteService): number {
  if (typeof s.durationMins === "number" && s.durationMins > 0) return s.durationMins;
  const n = s.name.toLowerCase();
  if (/balayage|highlight|full head|colour|color/.test(n)) return 120;
  if (/bridal|occasion|perm|keratin|treatment/.test(n)) return 90;
  if (/gloss|toner|fringe|tidy/.test(n)) return 45;
  if (/cut|blow|style/.test(n)) return 60;
  return 45;
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
  hours: SiteOpeningHours[],
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
  hours: SiteOpeningHours[],
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
  services: SiteService[];
  hours: SiteOpeningHours[];
  phone: string;
  telHref: string;
}) {
  const [step, setStep] = useState<BookingStep>("service");
  const [service, setService] = useState<SiteService | null>(null);
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

  const chooseService = (s: SiteService) => {
    setService(s);
    setSlot(null);
    // Land on the first day that actually has an open slot.
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
    "inline-flex items-center justify-center gap-1.5 rounded-full border border-salon-line bg-white px-5 py-3 text-sm font-semibold text-salon-ink transition-all hover:border-salon-rose/40 hover:text-salon-rose";
  const roseBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-salon-rose px-5 py-3 text-sm font-bold text-white transition-all hover:bg-salon-rose-deep disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-salon-rose";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="salon-site fixed inset-0 z-[60] flex font-body sm:items-center sm:justify-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-salon-ink/40 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Book at ${businessName}`}
            className="relative flex h-full w-full flex-col overflow-hidden bg-salon-bg text-salon-muted sm:h-auto sm:max-h-[88vh] sm:max-w-lg sm:rounded-3xl sm:border sm:border-salon-line sm:salon-shadow-lg"
            initial={{ y: 28, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-salon-line px-5 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="truncate font-salon-display text-xl text-salon-ink">
                  {businessName}
                </span>
                <span className="shrink-0 rounded-full border border-salon-rose-border bg-salon-rose/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-salon-rose-deep">
                  Demo preview
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close booking"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-salon-line text-salon-muted transition-colors hover:border-salon-rose/40 hover:text-salon-rose"
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
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-widest text-salon-faint">
                    Choose a service
                  </h3>
                  {services.map((s, i) => {
                    const dur = inferDuration(s);
                    return (
                      <button
                        key={`${s.name}-${i}`}
                        type="button"
                        onClick={() => chooseService(s)}
                        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-salon-line bg-white px-4 py-3.5 text-left transition-all hover:border-salon-rose/40 hover:bg-salon-rose/[0.04]"
                      >
                        <span className="min-w-0">
                          <span className="block font-bold text-salon-ink group-hover:text-salon-rose">
                            {s.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-salon-muted">
                            {dur} min{s.description ? ` · ${s.description}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          {s.price ? (
                            <span className="font-salon-display text-xl text-salon-rose">{s.price}</span>
                          ) : (
                            <span className="text-xs font-medium uppercase tracking-wide text-salon-faint">
                              Price on request
                            </span>
                          )}
                          <ChevronLeftIcon className="h-4 w-4 rotate-180 text-salon-faint transition-colors group-hover:text-salon-rose" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {step === "datetime" && (
                <div>
                  {service && (
                    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-salon-line bg-white px-4 py-2.5">
                      <span className="text-sm text-salon-muted">
                        <span className="font-bold text-salon-ink">{service.name}</span>
                        <span className="text-salon-faint"> · {duration} min</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setStep("service")}
                        className="text-xs font-semibold uppercase tracking-widest text-salon-rose-deep hover:text-salon-rose"
                      >
                        Change
                      </button>
                    </div>
                  )}

                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-widest text-salon-faint">
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
                              ? "border-salon-rose bg-salon-rose/10 text-salon-ink"
                              : d.open
                                ? "border-salon-line bg-white text-salon-muted hover:border-salon-rose/40"
                                : "border-salon-line/60 text-salon-faint"
                          }`}
                        >
                          <span className="text-[11px] uppercase tracking-wide">{wd}</span>
                          <span className="text-lg font-bold leading-tight">{d.date.getDate()}</span>
                          <span className="text-[10px] uppercase tracking-wide text-salon-faint">
                            {d.open ? mo : "Closed"}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <h3 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-widest text-salon-faint">
                    Choose a time
                  </h3>
                  {slots.length === 0 ? (
                    <p className="py-6 text-center text-sm text-salon-muted">
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
                              ? "cursor-not-allowed border-salon-line/60 text-salon-faint line-through"
                              : slot === sl.mins
                                ? "border-salon-rose bg-salon-rose/15 text-salon-ink"
                                : "border-salon-line bg-white text-salon-ink hover:border-salon-rose/50"
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
                  <h3 className="text-sm font-semibold uppercase tracking-widest text-salon-faint">
                    Your details
                  </h3>
                  <div>
                    <label htmlFor="bk-name" className="mb-1.5 block text-xs uppercase tracking-widest text-salon-faint">
                      Your name
                    </label>
                    <input
                      id="bk-name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sophie Bennett"
                      className="w-full rounded-xl border border-salon-line bg-white px-4 py-3 text-salon-ink outline-none transition-colors placeholder:text-salon-faint focus:border-salon-rose/60"
                    />
                  </div>
                  <div>
                    <label htmlFor="bk-phone" className="mb-1.5 block text-xs uppercase tracking-widest text-salon-faint">
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
                      className="w-full rounded-xl border border-salon-line bg-white px-4 py-3 text-salon-ink outline-none transition-colors placeholder:text-salon-faint focus:border-salon-rose/60"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-salon-faint">
                    This is a demo — your details stay in your browser and aren&apos;t saved, sent,
                    or charged anywhere.
                  </p>
                </div>
              )}

              {step === "confirm" && (
                <div className="text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-salon-rose/10 text-salon-rose">
                    <CheckIcon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-5 font-salon-display text-3xl text-salon-ink">
                    You&apos;re booked in
                  </h3>
                  <p className="mt-2 text-sm text-salon-muted">
                    {name.trim().split(/\s+/)[0]}, here&apos;s your appointment:
                  </p>
                  <div className="mt-6 space-y-2.5 rounded-2xl border border-salon-line bg-white p-4 text-left">
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
                  <div className="mt-5 rounded-xl border border-salon-rose-border bg-salon-rose/[0.07] px-4 py-3 text-xs leading-relaxed text-salon-rose-deep">
                    Demo preview — no appointment was actually booked and nothing was sent.
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="border-t border-salon-line px-5 py-4">
              {step === "service" && (
                <a
                  href={telHref}
                  className="flex items-center justify-center gap-2 text-sm font-medium text-salon-muted transition-colors hover:text-salon-rose"
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
                    className={`flex-1 ${roseBtn}`}
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
                  <button type="button" onClick={onClose} className={`flex-1 ${roseBtn}`}>
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
    <div className="flex items-center gap-2 border-b border-salon-line px-5 py-3">
      {order.map((key, i) => (
        <div key={key} className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
              i <= idx ? "bg-salon-rose text-white" : "bg-salon-line text-salon-faint"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`truncate text-xs font-medium ${
              i === idx ? "text-salon-ink" : "text-salon-faint"
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
      <span className="shrink-0 text-xs uppercase tracking-widest text-salon-faint">{label}</span>
      <span className="text-right text-sm font-semibold text-salon-ink">{value}</span>
    </div>
  );
}

export default SalonSiteTemplate;
