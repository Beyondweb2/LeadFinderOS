import { useMemo, useState, type ReactNode } from "react";

import "./fonts.css";
import { STOCK_HERO, STOCK_ABOUT, STOCK_APPROACH, stockServiceImage } from "./assets";
import type { SiteContent, SiteService } from "../shared/content";
import { Reveal, useReveal } from "../shared/useReveal";
import { useCountUp } from "../shared/useCountUp";
import { Carousel } from "../shared/Carousel";

/* -------------------------------------------------------------------------- */
/*  PlumberSiteTemplate                                                        */
/*                                                                            */
/*  A single-page marketing site for a UK plumber / heating engineer, rebuilt */
/*  in React from a Bootstrap/WOW.js reference theme. "Deep Marine" palette    */
/*  (navy #0F2233 + teal #0E7490 + cyan #06B6D4). Every visual class is        */
/*  plumber-scoped (plumber-* tokens under the .plumber-site root) so it can   */
/*  never leak into the barber/salon templates.                               */
/*                                                                            */
/*  Sections: hero · about · services · why us · how it works · reviews ·      */
/*  FAQ + contact · footer, with drop-shaped graphics. Scroll-reveal + count-  */
/*  up + carousel come from the shared primitives (prefers-reduced-motion      */
/*  aware). Reviews link out to Google — never republishes quotes.            */
/*                                                                            */
/*  Plumbers don't take slot bookings, so every CTA routes to contact/call    */
/*  (bookingEnabled/bookingSlug are accepted for a uniform template signature  */
/*  but intentionally unused).                                                */
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

  const heroSrc = heroImageUrl || STOCK_HERO;
  const aboutSrc = aboutImageUrl || STOCK_ABOUT;

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
            heroSrc={heroSrc}
            googleRating={googleRating}
            reviewCount={reviewCount}
          />
          <About
            about={about}
            businessName={businessName}
            aboutSrc={aboutSrc}
            services={services}
            reviewCount={reviewCount}
          />
          <Services services={services} />
          {(whyUsPoints?.length || googleRating) && (
            <WhyUs whyUsPoints={whyUsPoints} approachSrc={STOCK_APPROACH} reviewCount={reviewCount} />
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

      {/* Owner claim-preview bar (all viewports) on /claim & /s/; else a mobile
          "Call for a quote" bar — plumbers want the phone, not a booking flow. */}
      {onClaim ? (
        showClaimBar ? <ClaimBar onClaim={onClaim} /> : null
      ) : (
        <MobileCallBar telHref={telHref} />
      )}
    </div>
  );
}

export default PlumberSiteTemplate;

/* ------------------------------- primitives -------------------------------- */

function Wordmark({ businessName, size = "md", logoUrl }: { businessName: string; size?: "md" | "lg"; logoUrl?: string }) {
  if (logoUrl) {
    return <img src={logoUrl} alt={businessName} className={`w-auto object-contain ${size === "lg" ? "h-12" : "h-9"}`} />;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-plumber-primary text-white">
        <DropIcon className="h-4 w-4" />
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
      <WrenchIcon className="h-3.5 w-3.5" />
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
      className={`group inline-flex items-center gap-2 rounded-full bg-plumber-primary px-6 py-3 text-sm font-bold text-white shadow-[0_10px_28px_-10px_rgba(14,116,144,0.7)] transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep ${className}`}
    >
      {children}
      <ArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  );
}

/** Reviews count-up tile, started when scrolled into view. */
function CountStat({ target, label }: { target: number; label: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const n = useCountUp(target, { start: visible });
  return (
    <div
      ref={ref}
      className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl border border-plumber-line bg-white px-5 py-3.5 shadow-[0_16px_40px_-18px_rgba(15,34,51,0.3)]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-full bg-plumber-primary/10 text-plumber-primary">
        <StarIcon className="h-5 w-5" filled />
      </span>
      <div>
        <div className="font-plumber-display text-2xl font-extrabold leading-none text-plumber-ink">
          {n}+
        </div>
        <div className="text-xs text-plumber-faint">{label}</div>
      </div>
    </div>
  );
}

/** Decorative cyan "drops" — the theme's signature motif. */
function Drops({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className}`}>
      <span className="absolute h-3 w-3 rounded-full bg-plumber-accent/70" style={{ left: 0, top: 0 }} />
      <span className="absolute h-2 w-2 rounded-full bg-plumber-accent/50" style={{ left: 22, top: 18 }} />
      <span className="absolute h-1.5 w-1.5 rounded-full bg-plumber-accent/40" style={{ left: 8, top: 34 }} />
    </div>
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
            <PhoneIcon className="h-4 w-4" />
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
  heroSrc,
  googleRating,
  reviewCount,
}: {
  businessName: string;
  category?: string;
  heroHeadline: string;
  tagline: string;
  heroSrc: string;
  googleRating?: number;
  reviewCount?: number;
}) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div id="home" className="absolute -top-20" />
      {/* Soft marine wash background */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(1100px 520px at 88% -10%, rgba(6,182,212,0.10), transparent 60%)," +
            "radial-gradient(820px 480px at -8% 6%, rgba(14,116,144,0.08), transparent 55%)",
        }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <Reveal>
            <Eyebrow>{category || "Plumbing & heating"}</Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 font-plumber-display text-4xl font-extrabold leading-[1.05] tracking-tight text-plumber-ink sm:text-5xl md:text-6xl">
              {heroHeadline}
            </h1>
          </Reveal>
          <Reveal delay={150}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-plumber-muted">{tagline}</p>
          </Reveal>
          <Reveal delay={220}>
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
            <Reveal delay={290}>
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

        <Reveal direction="right" delay={120} className="relative">
          <div className="relative">
            <Drops className="-left-4 -top-4" />
            <img
              src={heroSrc}
              alt={businessName}
              loading="eager"
              className="aspect-[6/5] w-full rounded-[28px] object-cover shadow-[0_30px_70px_-30px_rgba(15,34,51,0.5)]"
            />
            <span aria-hidden className="absolute -bottom-6 -right-4 h-24 w-24 rounded-full bg-plumber-accent/20 blur-2xl" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------- about ---------------------------------- */

function About({
  about,
  businessName,
  aboutSrc,
  services,
  reviewCount,
}: {
  about: string;
  businessName: string;
  aboutSrc: string;
  services: SiteService[];
  reviewCount?: number;
}) {
  const points = services.slice(0, 6).map((s) => s.name);
  return (
    <section id="about" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2">
        <Reveal direction="left" className="relative">
          <div className="relative">
            <img
              src={aboutSrc}
              alt={`About ${businessName}`}
              loading="lazy"
              className="aspect-[5/6] w-full max-w-md rounded-[28px] object-cover shadow-[0_24px_60px_-28px_rgba(15,34,51,0.45)]"
            />
            {typeof reviewCount === "number" && reviewCount > 0 && (
              <CountStat target={reviewCount} label="Customer reviews" />
            )}
            <Drops className="-right-2 top-6" />
          </div>
        </Reveal>

        <div>
          <SectionHeading eyebrow="About us" title="Turning plumbing into peace of mind" />
          <Reveal delay={80}>
            <p className="mt-5 text-base leading-relaxed text-plumber-muted">{about}</p>
          </Reveal>
          {points.length > 0 && (
            <Reveal delay={150}>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm font-medium text-plumber-ink">
                    <CheckBadge className="mt-0.5 h-5 w-5 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          <Reveal delay={220}>
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

function Services({ services }: { services: SiteService[] }) {
  if (!services.length) return null;
  return (
    <section id="services" className="relative scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading center eyebrow="Services" title="Our plumbing services" />
        <Reveal delay={100} className="mt-12">
          <Carousel
            slideClassName="basis-full sm:basis-1/2 lg:basis-1/3"
            gapClassName="gap-6"
            arrowClassName="grid h-11 w-11 place-items-center rounded-full border border-plumber-line bg-white text-plumber-primary transition-colors hover:bg-plumber-primary hover:text-white"
            dotClassName="h-2 w-2 rounded-full bg-plumber-line transition-colors"
            dotActiveClassName="!bg-plumber-primary"
            ariaLabel="Plumbing services"
          >
            {services.map((s, i) => (
              <ServiceCard key={s.name} service={s} index={i} />
            ))}
          </Carousel>
        </Reveal>
      </div>
    </section>
  );
}

function ServiceCard({ service, index }: { service: SiteService; index: number }) {
  const img = service.imageUrl || stockServiceImage(index);
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-plumber-line bg-plumber-bg transition-all hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(15,34,51,0.35)]">
      <div className="relative">
        <img src={img} alt={service.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        <span className="absolute -bottom-5 left-5 grid h-11 w-11 place-items-center rounded-xl bg-plumber-primary text-white shadow-[0_10px_24px_-10px_rgba(14,116,144,0.8)]">
          <WrenchIcon className="h-5 w-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-8">
        <h3 className="font-plumber-display text-lg font-extrabold text-plumber-ink">{service.name}</h3>
        {service.description && <p className="mt-2 flex-1 text-sm leading-relaxed text-plumber-muted">{service.description}</p>}
        <a href="#contact" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-plumber-primary hover:text-plumber-primary-deep">
          Read more <ArrowIcon className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

/* --------------------------------- why us --------------------------------- */

const WHY_CARDS = [
  { n: "01", title: "Qualified plumbers", desc: "Experienced engineers for domestic plumbing, from small repairs to full bathrooms." },
  { n: "02", title: "Fast response", desc: "Same-day appointments when available — plumbing problems can't wait." },
  { n: "03", title: "Respect for your home", desc: "Tidy tradespeople who explain the work and leave your property as they found it." },
];

function WhyUs({ whyUsPoints, approachSrc, reviewCount }: { whyUsPoints?: string[]; approachSrc: string; reviewCount?: number }) {
  return (
    <section id="why-us" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal direction="left" className="relative">
            <div className="relative">
              <img
                src={approachSrc}
                alt="Our work"
                loading="lazy"
                className="aspect-[5/5] w-full max-w-md rounded-[28px] object-cover shadow-[0_24px_60px_-28px_rgba(15,34,51,0.45)]"
              />
              {typeof reviewCount === "number" && reviewCount > 0 && (
                <CountStat target={reviewCount} label="Customer reviews" />
              )}
            </div>
          </Reveal>
          <div>
            <SectionHeading eyebrow="What to expect from us" title="Why choose us" />
            <Reveal delay={80}>
              <p className="mt-5 text-base leading-relaxed text-plumber-muted">
                We focus on clear communication, upfront pricing where possible, and workmanship you can rely on —
                whether it's an emergency call-out or planned work.
              </p>
            </Reveal>
            {whyUsPoints?.length ? (
              <Reveal delay={150}>
                <ul className="mt-6 space-y-3">
                  {whyUsPoints.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm font-medium text-plumber-ink">
                      <CheckBadge className="mt-0.5 h-5 w-5 shrink-0" />
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
            <Reveal key={c.n} delay={i * 90}>
              <div className="h-full rounded-2xl border border-plumber-line bg-white p-7">
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-plumber-primary/10 text-plumber-primary">
                    <ShieldIcon className="h-6 w-6" />
                  </span>
                  <span className="font-plumber-display text-3xl font-extrabold text-plumber-line">{c.n}</span>
                </div>
                <h3 className="mt-4 font-plumber-display text-lg font-extrabold text-plumber-ink">{c.title}</h3>
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

function HowItWorks({ steps }: { steps: NonNullable<SiteContent["processSteps"]> }) {
  return (
    <section className="relative scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading center eyebrow="How we work" title="How it works" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 90}>
              <div className="relative h-full rounded-2xl border border-plumber-line bg-plumber-bg p-7">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-plumber-primary text-white">
                  <WrenchIcon className="h-6 w-6" />
                </span>
                <span className="absolute right-6 top-6 font-plumber-display text-3xl font-extrabold text-plumber-line">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-plumber-display text-lg font-extrabold text-plumber-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-plumber-muted">{step.description}</p>
              </div>
            </Reveal>
          ))}
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
  // Honesty rule: we NEVER republish review text. Show the real rating + a link
  // out to Google's reviews. If there's no rating, invite the visitor to ask.
  const hasRating = typeof googleRating === "number" && googleRating > 0;
  return (
    <section id="reviews" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <SectionHeading center eyebrow="Testimonials" title={hasRating ? `Rated ${googleRating!.toFixed(1)}/5${typeof reviewCount === "number" ? ` by ${reviewCount} customers` : ""}` : "What our customers say"} />
        <Reveal delay={100}>
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
        {/* FAQ */}
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

        {/* Contact card (honest: call + details, not a dead form) */}
        <div id="contact" className="scroll-mt-20">
          <Reveal direction="right">
            <div className="rounded-3xl border border-plumber-line bg-plumber-bg p-7 sm:p-9">
              <h3 className="font-plumber-display text-2xl font-extrabold text-plumber-ink">Get a free quote</h3>
              <p className="mt-2 text-sm text-plumber-muted">
                Tell us the problem and we'll arrange a visit or emergency attendance.
              </p>
              <a
                href={telHref}
                className="mt-6 flex items-center justify-center gap-2.5 rounded-full bg-plumber-primary px-6 py-4 text-base font-bold text-white shadow-[0_14px_34px_-12px_rgba(14,116,144,0.8)] transition-all hover:-translate-y-0.5 hover:bg-plumber-primary-deep"
              >
                <PhoneIcon className="h-5 w-5" /> Call {phone}
              </a>

              <dl className="mt-7 space-y-4 text-sm">
                {address.trim() && (
                  <div className="flex items-start gap-3">
                    <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
                    <div>
                      <dt className="font-semibold text-plumber-ink">Location</dt>
                      <dd className="text-plumber-muted">{address}</dd>
                    </div>
                  </div>
                )}
                {serviceArea && (
                  <div className="flex items-start gap-3">
                    <DropIcon className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
                    <div>
                      <dt className="font-semibold text-plumber-ink">Service area</dt>
                      <dd className="text-plumber-muted">{serviceArea}</dd>
                    </div>
                  </div>
                )}
                {hours.length > 0 && (
                  <div className="flex items-start gap-3">
                    <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-plumber-primary" />
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
                <a href={mapSrc.replace("&output=embed", "")} target="_blank" rel="noopener noreferrer" className="mt-6 block overflow-hidden rounded-2xl border border-plumber-line" aria-label={`Open ${businessName} in Google Maps`}>
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
          <div key={f.question} className="overflow-hidden rounded-2xl border border-plumber-line bg-plumber-bg">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? -1 : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-plumber-ink"
            >
              {f.question}
              <ChevronIcon className={`h-5 w-5 shrink-0 text-plumber-primary transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-plumber-muted">{f.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- footer --------------------------------- */

function Footer({ businessName, services, address, logoUrl }: { businessName: string; services: SiteService[]; address: string; logoUrl?: string }) {
  return (
    <footer className="bg-plumber-ink text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
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
            Get free quote <ArrowIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
      <div className="border-t border-white/10">
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
        <PhoneIcon className="h-[18px] w-[18px]" /> Call for a quote
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

/* ---------------------------------- icons --------------------------------- */

function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} className="h-4 w-4" filled={i < full} />
      ))}
    </span>
  );
}

function StarIcon({ className = "", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={filled ? "#06B6D4" : "none"} stroke="#06B6D4" strokeWidth="1.6" aria-hidden>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.8 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" strokeLinejoin="round" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.9 2.1z" />
    </svg>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckBadge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#0E7490" opacity="0.12" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#0E7490" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WrenchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.3-.6-.6-2.3z" />
    </svg>
  );
}

function DropIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.5s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" />
    </svg>
  );
}

function ShieldIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
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
