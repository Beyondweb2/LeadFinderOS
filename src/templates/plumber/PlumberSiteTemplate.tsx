import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Phone,
  PhoneCall,
  MapPin,
  Clock,
  ArrowRight,
  ChevronDown,
  Check,
  Star,
  Wrench,
  ClipboardCheck,
  FileCheck2,
  Award,
  Zap,
  Home,
  ShowerHead,
  Waves,
  Droplet,
  Droplets,
  Flame,
  Siren,
} from "lucide-react";

import "./fonts.css";
import type { SiteContent, SiteService } from "../shared/content";
import { Reveal, useReveal } from "../shared/useReveal";
import { useCountUp } from "../shared/useCountUp";
import { Carousel } from "../shared/Carousel";

/* -------------------------------------------------------------------------- */
/*  PlumberSiteTemplate                                                        */
/*                                                                            */
/*  Single-page marketing site for a UK plumber / heating engineer, rebuilt   */
/*  in React from a Bootstrap/WOW.js reference. "Deep Marine" palette          */
/*  (navy #0F2233 + teal #0E7490 + cyan #06B6D4), scoped under .plumber-site.  */
/*                                                                            */
/*  Polish pass: scroll-reveal + staggered cards via the shared primitives     */
/*  (prefers-reduced-motion aware); varied contextual lucide icons per         */
/*  step/service; image slots render a branded <PlaceholderPanel> (gradient +  */
/*  icon + drops) when there's no real photo — never a broken <img>/alt-text;  */
/*  layered offset shadows, big outline numbers, drop-shaped icon frames, and  */
/*  extended marine background graphics for depth.                            */
/*                                                                            */
/*  Reviews link out to Google — never republishes quotes. CTAs route to       */
/*  contact/call (plumbers don't slot-book); bookingEnabled/bookingSlug are    */
/*  accepted for a uniform signature but intentionally unused.                 */
/* -------------------------------------------------------------------------- */

export function PlumberSiteTemplate({
  content,
  onClaim,
  showClaimBar = true,
}: {
  content: SiteContent;
  bookingEnabled?: boolean;
  bookingSlug?: string;
  onClaim?: () => void;
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
    logoUrl,
    googleReviewsUrl,
    whyUsPoints,
    processSteps,
    faqs,
    serviceArea,
  } = content;

  const telHref = useMemo(() => `tel:${phone.replace(/[^\d+]/g, "")}`, [phone]);
  const mapSrc = useMemo(
    () =>
      address.trim()
        ? `https://www.google.com/maps?q=${encodeURIComponent(address.trim())}&output=embed`
        : "",
    [address],
  );

  return (
    <div className="plumber-site font-body text-plumber-muted antialiased">
      <div
        className={`relative min-h-screen bg-plumber-bg ${onClaim ? "pb-[104px] sm:pb-[140px]" : "pb-[68px] sm:pb-0"}`}
      >
        <Header businessName={businessName} telHref={telHref} phone={phone} logoUrl={logoUrl} />

        <main>
          <Hero
            businessName={businessName}
            category={category}
            heroHeadline={heroHeadline}
            tagline={tagline}
            heroImageUrl={heroImageUrl}
            googleRating={googleRating}
            reviewCount={reviewCount}
          />
          <About
            about={about}
            businessName={businessName}
            aboutImageUrl={aboutImageUrl}
            services={services}
            reviewCount={reviewCount}
          />
          <Services services={services} />
          {(whyUsPoints?.length || googleRating) && (
            <WhyUs whyUsPoints={whyUsPoints} reviewCount={reviewCount} />
          )}
          {processSteps?.length ? <HowItWorks steps={processSteps} /> : null}
          <Reviews googleRating={googleRating} reviewCount={reviewCount} googleReviewsUrl={googleReviewsUrl} />
          <FaqContact
            faqs={faqs}
            businessName={businessName}
            phone={phone}
            telHref={telHref}
            address={address}
            serviceArea={serviceArea}
            mapSrc={mapSrc}
            hours={hours}
          />
        </main>

        <Footer businessName={businessName} services={services} address={address} logoUrl={logoUrl} />
      </div>

      {onClaim ? (
        showClaimBar ? <ClaimBar onClaim={onClaim} /> : null
      ) : (
        <MobileCallBar telHref={telHref} />
      )}
    </div>
  );
}

export default PlumberSiteTemplate;

/* ------------------------------- shared bits ------------------------------- */

type IconType = ComponentType<{ className?: string }>;

/* Curated plumbing stock fallbacks (Unsplash — free for commercial use under the
 * Unsplash License, no attribution required; stable CDN URLs). These are a
 * FALLBACK ONLY so a freshly generated site looks full immediately. The real
 * per-business photo (Google hero now, Apify later) is always preferred and
 * overrides stock — see MediaPanel's `src || stock` order. Same set across sites
 * is fine for a fallback. */
const STOCK_IMG = "https://images.unsplash.com/";
const stockUrl = (id: string, w: number) => `${STOCK_IMG}${id}?auto=format&fit=crop&w=${w}&q=70`;
const STOCK = {
  hero: stockUrl("photo-1749532125405-70950966b0e5", 1200), // plumber repairing a bathroom
  about: stockUrl("photo-1676210134188-4c05dd172f89", 1000), // working on pipework in a wall
  work: stockUrl("photo-1676210133055-eab6ef033ce3", 1000), // engineer on pipework in a cabinet
};
/** Stock image for a service card, chosen by service name (mirrors serviceIcon). */
function stockForService(name: string): string {
  const n = name.toLowerCase();
  if (/bath|kitchen|shower/.test(n)) return stockUrl("photo-1521207418485-99c705420785", 800); // kitchen sink/tap
  if (/block|drain|sink|toilet/.test(n)) return stockUrl("photo-1542013936693-884638332954", 800); // tap/water
  if (/leak|repair/.test(n)) return stockUrl("photo-1676210134188-4c05dd172f89", 800); // pipe repair
  if (/boiler|heat|central|radiator/.test(n)) return stockUrl("photo-1650551182991-b07558247564", 800); // pipes & valves
  if (/emergency|call-?out|burst|urgent/.test(n)) return stockUrl("photo-1558618666-fcd25c85cd64", 800); // engineer with tool
  return stockUrl("photo-1530124566582-a618bc2615dc", 800); // tools
}

/** Branded image slot. Prefers the real photo (`src`), then a curated stock photo
 *  (`stock`), and only falls back to a Deep-Marine gradient panel (icon + drops)
 *  if neither exists. The real-photo path always wins, so Apify/Google images
 *  override stock. A missing image is never a broken <img>/alt-text. */
function MediaPanel({
  src,
  stock,
  alt,
  icon: Icon,
  className = "",
  rounded = "rounded-[28px]",
  eager = false,
}: {
  src?: string;
  stock?: string;
  alt: string;
  icon: IconType;
  className?: string;
  rounded?: string;
  eager?: boolean;
}) {
  const url = src || stock; // real photo wins; stock is fallback only
  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        className={`${className} ${rounded} object-cover`}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={alt}
      className={`relative flex items-center justify-center overflow-hidden ${rounded} ${className}`}
      style={{ backgroundImage: "linear-gradient(135deg, #0F2233 0%, #0E7490 100%)" }}
    >
      <span aria-hidden className="absolute h-28 w-28 rounded-full bg-[#06B6D4]/20" style={{ top: "10%", right: "12%" }} />
      <span aria-hidden className="absolute h-16 w-16 rounded-full bg-[#06B6D4]/12" style={{ bottom: "14%", left: "10%" }} />
      <span aria-hidden className="absolute h-8 w-8 rounded-full bg-[#06B6D4]/12" style={{ bottom: "26%", left: "24%" }} />
      <Icon className="relative h-14 w-14 text-[#67E8F9]" />
    </div>
  );
}

/** Drop-shaped icon frame (organic squircle) used on cards. */
function IconBlob({ icon: Icon, className = "" }: { icon: IconType; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-14 w-14 place-items-center bg-plumber-primary/10 text-plumber-primary ${className}`}
      style={{ borderRadius: "42% 58% 60% 40% / 45% 45% 55% 55%" }}
    >
      <Icon className="h-6 w-6" />
    </span>
  );
}

function Wordmark({ businessName, size = "md", logoUrl }: { businessName: string; size?: "md" | "lg"; logoUrl?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={businessName} className={`w-auto object-contain ${size === "lg" ? "h-12" : "h-9"}`} />;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-plumber-primary text-white">
        <Droplet className="h-4 w-4" />
      </span>
      <span className={`font-plumber-display font-extrabold leading-none text-plumber-ink ${size === "lg" ? "text-2xl" : "text-xl"}`}>
        {businessName}
      </span>
    </span>
  );
}

function Eyebrow({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-plumber-primary ${center ? "justify-center" : ""}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-plumber-accent" aria-hidden />
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, center = false }: { eyebrow: string; title: string; center?: boolean }) {
  return (
    <Reveal className={center ? "text-center" : ""}>
      <Eyebrow center={center}>{eyebrow}</Eyebrow>
      <h2 className={`mt-3 font-plumber-display text-3xl font-extrabold leading-tight tracking-tight text-plumber-ink sm:text-4xl ${center ? "mx-auto max-w-2xl" : ""}`}>
        {title}
      </h2>
    </Reveal>
  );
}

function PrimaryBtn({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-2 rounded-full bg-plumber-primary px-6 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-10px_rgba(14,116,144,0.7)] transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep ${className}`}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

/** Soft marine radial wash — extends the drop motif into otherwise-flat sections. */
function MarineBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage:
          "radial-gradient(900px 460px at 92% -12%, rgba(6,182,212,0.08), transparent 60%)," +
          "radial-gradient(720px 420px at -8% 108%, rgba(14,116,144,0.07), transparent 55%)",
      }}
    />
  );
}

function CountStat({ target, label }: { target: number; label: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const n = useCountUp(target, { start: visible });
  return (
    <div
      ref={ref}
      className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-plumber-line bg-white px-5 py-3.5 shadow-[0_16px_40px_-18px_rgba(15,34,51,0.3)]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-plumber-primary/10 text-plumber-accent">
        <Star className="h-5 w-5 fill-current" />
      </span>
      <div>
        <div className="font-plumber-display text-2xl font-extrabold leading-none text-plumber-ink">{n}+</div>
        <div className="text-xs text-plumber-faint">{label}</div>
      </div>
    </div>
  );
}

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full ? "fill-current text-plumber-accent" : "text-plumber-line"}`}
        />
      ))}
    </span>
  );
}

function GoogleG({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.1 1.1 4.6z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z" />
    </svg>
  );
}

/* --------------------------------- header --------------------------------- */

function Header({ businessName, telHref, phone, logoUrl }: { businessName: string; telHref: string; phone: string; logoUrl?: string }) {
  const NAV = [
    ["#about", "About"],
    ["#services", "Services"],
    ["#why-us", "Why Us"],
    ["#reviews", "Reviews"],
    ["#faq", "FAQ"],
    ["#contact", "Contact"],
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-plumber-line bg-plumber-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-plumber-bg/65">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <a href="#top" aria-label={`${businessName} — home`} className="shrink-0">
          <Wordmark businessName={businessName} logoUrl={logoUrl} />
        </a>
        <nav className="hidden items-center gap-7 text-sm font-semibold text-plumber-muted lg:flex">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="transition-colors hover:text-plumber-primary">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={telHref}
            aria-label={`Call ${businessName} on ${phone}`}
            className="grid h-10 w-10 place-items-center rounded-full border border-plumber-line bg-white text-plumber-ink transition-all hover:-translate-y-0.5 hover:border-plumber-primary/50 hover:text-plumber-primary"
          >
            <Phone className="h-4 w-4" />
          </a>
          <a
            href="#contact"
            className="hidden items-center gap-2 rounded-full bg-plumber-primary px-4 py-2 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep sm:inline-flex"
          >
            Get free quote
          </a>
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
  heroImageUrl,
  googleRating,
  reviewCount,
}: {
  businessName: string;
  category?: string;
  heroHeadline: string;
  tagline: string;
  heroImageUrl?: string;
  googleRating?: number;
  reviewCount?: number;
}) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div id="home" className="absolute -top-20" />
      <MarineBg />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <Reveal>
            <Eyebrow>{category || "Plumbing & heating"}</Eyebrow>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="mt-4 font-plumber-display text-4xl font-extrabold leading-[1.05] tracking-tight text-plumber-ink sm:text-5xl md:text-6xl">
              {heroHeadline}
            </h1>
          </Reveal>
          <Reveal delay={170}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-plumber-muted">{tagline}</p>
          </Reveal>
          <Reveal delay={250}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryBtn href="#contact">Free consultation</PrimaryBtn>
              <a
                href="#services"
                className="inline-flex items-center gap-2 rounded-full border border-plumber-line bg-white px-6 py-3 text-sm font-semibold text-plumber-primary transition-all hover:-translate-y-0.5 hover:border-plumber-primary"
              >
                Our services
              </a>
            </div>
          </Reveal>
          {typeof googleRating === "number" && (
            <Reveal delay={330}>
              <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-plumber-line bg-white px-4 py-2">
                <Stars rating={googleRating} />
                <span className="text-sm text-plumber-muted">
                  <span className="font-bold text-plumber-ink">{googleRating.toFixed(1)}</span>
                  {typeof reviewCount === "number" && <> · {reviewCount} reviews</>}
                </span>
              </div>
            </Reveal>
          )}
        </div>

        <Reveal direction="right" delay={140} distance={72} duration={780} className="relative">
          <span aria-hidden className="absolute -left-5 -top-5 h-20 w-20 rounded-full bg-plumber-accent/15" />
          <MediaPanel
            src={heroImageUrl}
            stock={STOCK.hero}
            alt={businessName}
            icon={Droplets}
            eager
            className="aspect-[6/5] w-full shadow-[0_30px_70px_-30px_rgba(15,34,51,0.5)]"
          />
          <span aria-hidden className="absolute -bottom-6 -right-4 h-24 w-24 rounded-full bg-plumber-accent/20 blur-2xl" />
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- about ---------------------------------- */

function About({
  about,
  businessName,
  aboutImageUrl,
  services,
  reviewCount,
}: {
  about: string;
  businessName: string;
  aboutImageUrl?: string;
  services: SiteService[];
  reviewCount?: number;
}) {
  const points = services.slice(0, 6).map((s) => s.name);
  return (
    <section id="about" className="relative scroll-mt-20 py-20 sm:py-28">
      <MarineBg />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <Reveal direction="left" distance={72} duration={780} className="relative">
          <MediaPanel
            src={aboutImageUrl}
            stock={STOCK.about}
            alt={`About ${businessName}`}
            icon={ShowerHead}
            className="aspect-[5/6] w-full max-w-md shadow-[0_24px_60px_-28px_rgba(15,34,51,0.45)]"
          />
          {typeof reviewCount === "number" && reviewCount > 0 && (
            <CountStat target={reviewCount} label="Customer reviews" />
          )}
        </Reveal>

        <div>
          <SectionHeading eyebrow="About us" title="Turning plumbing into peace of mind" />
          <Reveal delay={90}>
            <p className="mt-5 text-base leading-relaxed text-plumber-muted">{about}</p>
          </Reveal>
          {points.length > 0 && (
            <Reveal delay={160}>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm font-medium text-plumber-ink">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-plumber-primary/12 text-plumber-primary">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          <Reveal delay={230}>
            <div className="mt-8">
              <PrimaryBtn href="#contact">Get in touch</PrimaryBtn>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------- services -------------------------------- */

function serviceIcon(name: string): IconType {
  const n = name.toLowerCase();
  if (/bath|kitchen|shower/.test(n)) return ShowerHead;
  if (/block|drain|sink|toilet/.test(n)) return Waves;
  if (/leak|repair/.test(n)) return Droplet;
  if (/boiler|heat|central|radiator/.test(n)) return Flame;
  if (/emergency|call-?out|burst|urgent/.test(n)) return Siren;
  return Wrench;
}

function Services({ services }: { services: SiteService[] }) {
  if (!services.length) return null;
  return (
    <section id="services" className="relative scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading center eyebrow="Services" title="Our plumbing services" />
        <div className="mt-12">
          <Carousel
            slideClassName="basis-full sm:basis-1/2 lg:basis-1/3"
            gapClassName="gap-6"
            arrowClassName="grid h-11 w-11 place-items-center rounded-full border border-plumber-line bg-white text-plumber-primary transition-colors hover:bg-plumber-primary hover:text-white"
            dotClassName="h-2 w-2 rounded-full bg-plumber-line transition-colors"
            dotActiveClassName="!bg-plumber-primary"
            ariaLabel="Plumbing services"
          >
            {services.map((s, i) => (
              <Reveal key={s.name} delay={i * 90} className="h-full">
                <ServiceCard service={s} />
              </Reveal>
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}

function ServiceCard({ service }: { service: SiteService }) {
  const Icon = serviceIcon(service.name);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-plumber-line bg-plumber-bg transition-all hover:-translate-y-1.5 hover:shadow-[0_28px_55px_-26px_rgba(15,34,51,0.4)]">
      <div className="relative">
        <MediaPanel src={service.imageUrl} stock={stockForService(service.name)} alt={service.name} icon={Icon} rounded="rounded-none" className="aspect-[4/3] w-full" />
        <span className="absolute -bottom-5 left-5 grid h-11 w-11 place-items-center rounded-xl bg-plumber-primary text-white shadow-[0_10px_24px_-10px_rgba(14,116,144,0.8)]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-8">
        <h3 className="font-plumber-display text-lg font-extrabold text-plumber-ink">{service.name}</h3>
        {service.description && <p className="mt-2 flex-1 text-sm leading-relaxed text-plumber-muted">{service.description}</p>}
        <a href="#contact" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-plumber-primary hover:text-plumber-primary-deep">
          Read more <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

/* --------------------------------- why us --------------------------------- */

const WHY_CARDS: { n: string; icon: IconType; title: string; desc: string }[] = [
  { n: "01", icon: Award, title: "Qualified plumbers", desc: "Experienced engineers for domestic plumbing, from small repairs to full bathrooms." },
  { n: "02", icon: Zap, title: "Fast response", desc: "Same-day appointments when available — plumbing problems can't wait." },
  { n: "03", icon: Home, title: "Respect for your home", desc: "Tidy tradespeople who explain the work and leave your property as they found it." },
];

function WhyUs({ whyUsPoints, reviewCount }: { whyUsPoints?: string[]; reviewCount?: number }) {
  return (
    <section id="why-us" className="relative scroll-mt-20 py-20 sm:py-28">
      <MarineBg />
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal direction="left" distance={72} duration={780} className="relative">
            <MediaPanel
              stock={STOCK.work}
              alt="Our work"
              icon={Wrench}
              className="aspect-[5/5] w-full max-w-md shadow-[0_24px_60px_-28px_rgba(15,34,51,0.45)]"
            />
            {typeof reviewCount === "number" && reviewCount > 0 && (
              <CountStat target={reviewCount} label="Customer reviews" />
            )}
          </Reveal>
          <div>
            <SectionHeading eyebrow="What to expect from us" title="Why choose us" />
            <Reveal delay={90}>
              <p className="mt-5 text-base leading-relaxed text-plumber-muted">
                We focus on clear communication, upfront pricing where possible, and workmanship you can rely on —
                whether it's an emergency call-out or planned work.
              </p>
            </Reveal>
            {whyUsPoints?.length ? (
              <Reveal delay={160}>
                <ul className="mt-6 space-y-3">
                  {whyUsPoints.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm font-medium text-plumber-ink">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-plumber-primary/12 text-plumber-primary">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ) : null}
          </div>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {WHY_CARDS.map((c, i) => (
            <Reveal key={c.n} delay={i * 110}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-plumber-line bg-white p-7 shadow-[0_18px_44px_-26px_rgba(15,34,51,0.35)] transition-all hover:-translate-y-1.5 hover:shadow-[0_28px_60px_-26px_rgba(15,34,51,0.45)]">
                <span aria-hidden className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-plumber-accent/10" />
                <div className="flex items-center justify-between">
                  <IconBlob icon={c.icon} />
                  <span className="font-plumber-display text-4xl font-extrabold text-plumber-line">{c.n}</span>
                </div>
                <h3 className="mt-5 font-plumber-display text-lg font-extrabold text-plumber-ink">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-plumber-muted">{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ how it works ------------------------------ */

function processIcon(title: string, i: number): IconType {
  const t = title.toLowerCase();
  if (/call|message|contact|book/.test(t)) return PhoneCall;
  if (/assess|quote|diagnos|inspect/.test(t)) return ClipboardCheck;
  if (/repair|test|fix|fit|install/.test(t)) return Wrench;
  if (/invoice|guarantee|paperwork|warranty|after/.test(t)) return FileCheck2;
  return [PhoneCall, ClipboardCheck, Wrench, FileCheck2][i % 4];
}

function HowItWorks({ steps }: { steps: NonNullable<SiteContent["processSteps"]> }) {
  return (
    <section className="relative scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading center eyebrow="How we work" title="How it works" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = processIcon(step.title, i);
            return (
              <Reveal key={step.title} delay={i * 110}>
                <div className="relative h-full overflow-hidden rounded-2xl border border-plumber-line bg-plumber-bg p-7 shadow-[0_18px_44px_-26px_rgba(15,34,51,0.35)] transition-all hover:-translate-y-1.5 hover:shadow-[0_28px_60px_-26px_rgba(15,34,51,0.45)]">
                  <span aria-hidden className="absolute right-5 top-4 font-plumber-display text-5xl font-extrabold text-plumber-line/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <IconBlob icon={Icon} className="relative" />
                  <h3 className="relative mt-5 font-plumber-display text-lg font-extrabold text-plumber-ink">{step.title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-plumber-muted">{step.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- reviews -------------------------------- */

function Reviews({
  googleRating,
  reviewCount,
  googleReviewsUrl,
}: {
  googleRating?: number;
  reviewCount?: number;
  googleReviewsUrl?: string;
}) {
  const hasRating = typeof googleRating === "number" && googleRating > 0;
  return (
    <section id="reviews" className="relative scroll-mt-20 py-20 sm:py-28">
      <MarineBg />
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <SectionHeading
          center
          eyebrow="Testimonials"
          title={hasRating ? `Rated ${googleRating!.toFixed(1)}/5${typeof reviewCount === "number" ? ` by ${reviewCount} customers` : ""}` : "What our customers say"}
        />
        <Reveal delay={110}>
          <div className="mt-8 inline-flex flex-col items-center gap-5 rounded-3xl border border-plumber-line bg-white px-8 py-10 shadow-[0_24px_60px_-30px_rgba(15,34,51,0.4)]">
            {hasRating ? (
              <>
                <Stars rating={googleRating!} className="scale-125" />
                <p className="max-w-md text-sm leading-relaxed text-plumber-muted">
                  Our reviews live on Google, where every rating is verified — read them in full and see what
                  customers really say.
                </p>
              </>
            ) : (
              <p className="max-w-md text-sm leading-relaxed text-plumber-muted">
                Happy to provide references on request — just ask when you get in touch.
              </p>
            )}
            {googleReviewsUrl && (
              <a
                href={googleReviewsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-plumber-line bg-white px-5 py-2.5 text-sm font-bold text-plumber-ink transition-all hover:-translate-y-0.5 hover:border-plumber-primary hover:text-plumber-primary"
              >
                <GoogleG className="h-4 w-4" /> Read our Google reviews
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------- faq + contact ------------------------------ */

function FaqContact({
  faqs,
  businessName,
  phone,
  telHref,
  address,
  serviceArea,
  mapSrc,
  hours,
}: {
  faqs?: SiteContent["faqs"];
  businessName: string;
  phone: string;
  telHref: string;
  address: string;
  serviceArea?: string;
  mapSrc: string;
  hours: SiteContent["hours"];
}) {
  return (
    <section id="faq" className="relative scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="FAQ" title="Common questions" />
          <div className="mt-8">
            {faqs?.length ? (
              <Accordion items={faqs} />
            ) : (
              <p className="text-sm text-plumber-muted">Have a question? Give us a call — we're happy to help.</p>
            )}
          </div>
        </div>

        <div id="contact" className="scroll-mt-20">
          <Reveal direction="right" distance={60} duration={760}>
            <div className="relative overflow-hidden rounded-3xl border border-plumber-line bg-plumber-bg p-7 shadow-[0_22px_55px_-30px_rgba(15,34,51,0.4)] sm:p-9">
              <span aria-hidden className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-plumber-accent/10" />
              <h3 className="font-plumber-display text-2xl font-extrabold text-plumber-ink">Get a free quote</h3>
              <p className="mt-2 text-sm text-plumber-muted">
                Tell us the problem and we'll arrange a visit or emergency attendance.
              </p>
              <a
                href={telHref}
                className="mt-6 flex items-center justify-center gap-2.5 rounded-full bg-plumber-primary px-6 py-4 text-base font-bold text-white shadow-[0_14px_34px_-12px_rgba(14,116,144,0.8)] transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep"
              >
                <PhoneCall className="h-5 w-5" /> Call {phone}
              </a>

              <dl className="mt-7 space-y-4 text-sm">
                {address.trim() && (
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
                    <div>
                      <dt className="font-semibold text-plumber-ink">Location</dt>
                      <dd className="text-plumber-muted">{address}</dd>
                    </div>
                  </div>
                )}
                {serviceArea && (
                  <div className="flex items-start gap-3">
                    <Droplet className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
                    <div>
                      <dt className="font-semibold text-plumber-ink">Service area</dt>
                      <dd className="text-plumber-muted">{serviceArea}</dd>
                    </div>
                  </div>
                )}
                {hours.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
                    <div className="min-w-0">
                      <dt className="font-semibold text-plumber-ink">Opening hours</dt>
                      <dd className="mt-1 space-y-0.5 text-plumber-muted">
                        {hours.map((h) => (
                          <div key={h.day} className="flex justify-between gap-6">
                            <span>{h.day}</span>
                            <span className="text-plumber-ink/80">{h.open}</span>
                          </div>
                        ))}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              {mapSrc && (
                <a
                  href={mapSrc.replace("&output=embed", "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 block overflow-hidden rounded-2xl border border-plumber-line"
                  aria-label={`Open ${businessName} in Google Maps`}
                >
                  <iframe src={mapSrc} title={`Map to ${businessName}`} loading="lazy" className="h-44 w-full" style={{ border: 0, pointerEvents: "none" }} />
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Accordion({ items }: { items: NonNullable<SiteContent["faqs"]> }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-3">
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <Reveal key={f.question} delay={i * 70}>
            <div className="overflow-hidden rounded-2xl border border-plumber-line bg-plumber-bg">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-plumber-ink"
              >
                {f.question}
                <ChevronDown className={`h-5 w-5 shrink-0 text-plumber-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-plumber-muted">{f.answer}</p>
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

/* --------------------------------- footer --------------------------------- */

function Footer({ businessName, services, address, logoUrl }: { businessName: string; services: SiteService[]; address: string; logoUrl?: string }) {
  return (
    <footer className="relative overflow-hidden bg-plumber-ink text-white/80">
      <span aria-hidden className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-plumber-accent/10" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="[&_*]:!text-white">
            <Wordmark businessName={businessName} logoUrl={logoUrl} size="lg" />
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Professional plumbing and heating for homes and landlords. Call for advice, quotes and emergency support.
          </p>
        </div>
        <div>
          <h4 className="font-plumber-display text-sm font-extrabold uppercase tracking-wider text-white">Services</h4>
          <ul className="mt-4 space-y-2 text-sm text-white/60">
            {services.slice(0, 6).map((s) => (
              <li key={s.name}>
                <a href="#services" className="transition-colors hover:text-plumber-accent">{s.name}</a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-plumber-display text-sm font-extrabold uppercase tracking-wider text-white">Get in touch</h4>
          <p className="mt-4 text-sm text-white/60">{address}</p>
          <a href="#contact" className="mt-4 inline-flex items-center gap-2 rounded-full bg-plumber-primary px-5 py-2.5 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep">
            Get free quote <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto max-w-6xl px-5 py-5 text-center text-xs text-white/40 sm:px-8">
          © {businessName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ---------------------------- mobile call bar ----------------------------- */

function MobileCallBar({ telHref }: { telHref: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-plumber-line bg-white/95 px-4 py-1.5 backdrop-blur-xl sm:hidden">
      <a
        href={telHref}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-plumber-primary py-2.5 text-[15px] font-bold text-white active:scale-[0.98]"
      >
        <PhoneCall className="h-[18px] w-[18px]" /> Call for a quote
      </a>
    </div>
  );
}

function ClaimBar({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t border-plumber-line bg-white/95 px-4 py-3 shadow-[0_-16px_40px_-20px_rgba(15,34,51,0.4)] backdrop-blur-xl sm:py-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 sm:gap-6">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-plumber-ink sm:text-xl">This is your new website</div>
          <div className="text-xs text-plumber-muted sm:text-sm">It&apos;s free — no card needed.</div>
        </div>
        <div className="relative shrink-0 animate-claim-float">
          <span aria-hidden className="absolute -inset-1 rounded-full bg-plumber-primary/25 opacity-60 blur-lg animate-pulse-slow" />
          <button
            type="button"
            onClick={onClaim}
            className="relative inline-flex items-center gap-2 rounded-full bg-plumber-primary px-6 py-2.5 text-sm font-bold text-white shadow-[0_14px_34px_-12px_rgba(14,116,144,0.85)] transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep active:scale-[0.98] sm:px-9 sm:py-4 sm:text-lg"
          >
            Claim for free
          </button>
        </div>
      </div>
    </div>
  );
}
