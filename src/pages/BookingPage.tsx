import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Phone, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SiteContent } from "@/templates/shared/content";
import type { BarberService } from "@/templates/barber/types";
import { STOCK_HERO } from "@/templates/barber/assets";
import { normaliseTemplate, DEFAULT_TEMPLATE_KEY } from "@/templates/registry";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { BookingFlow } from "@/templates/barber/BookingFlow";
import "@/templates/barber/fonts.css";

/**
 * Standalone booking page at bookmybarber.uk/<slug> for has-website barbers
 * (booking-only). Resolves the generated_sites row by slug and renders a clean
 * branded header (business name / logo / accent / hero) + the existing BookingFlow
 * — NO marketing chrome. Reuses get-availability / create-booking as-is (keyed off
 * the slug). Mounted by App.tsx only when the host is bookmybarber.uk.
 */

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function hexToChannels(hex: string): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `${parseInt(n.slice(0, 2), 16)} ${parseInt(n.slice(2, 4), 16)} ${parseInt(n.slice(4, 6), 16)}`;
}
function mixChannels(hex: string, toward: 0 | 255, t: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const ch = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((x) => {
    const v = parseInt(x, 16);
    return Math.round(v + (toward - v) * t);
  });
  return ch.join(" ");
}

export default function BookingPage({ slug }: { slug: string }) {
  // Landing-first: show the branded page; the booking flow opens on the hero CTA or
  // by tapping a service (which preselects it). `picked` carries that preselection.
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<BarberService | null>(null);
  const openFlow = (svc: BarberService | null) => { setPicked(svc); setOpen(true); };

  const { data, isLoading } = useQuery({
    queryKey: ["booking-page", slug],
    queryFn: async (): Promise<{ siteName: string; content: SiteContent; template: string } | null> => {
      const res = await supabase
        .from("generated_sites")
        .select("site_name, content, template")
        .eq("site_name", slug)
        .maybeSingle();
      if (res.error) {
        const fb = await supabase
          .from("generated_sites")
          .select("site_name, content")
          .eq("site_name", slug)
          .maybeSingle();
        const r = fb.data as { site_name?: string; content?: unknown } | null;
        return r?.content ? { siteName: r.site_name as string, content: r.content as SiteContent, template: DEFAULT_TEMPLATE_KEY } : null;
      }
      const r = res.data as { site_name?: string; content?: unknown; template?: unknown } | null;
      return r?.content ? { siteName: r.site_name as string, content: r.content as SiteContent, template: normaliseTemplate(r.template) } : null;
    },
  });

  const content = data?.content ?? null;
  const businessName = content?.businessName ?? "";
  useSiteBranding(businessName || "Online booking", data?.template ?? DEFAULT_TEMPLATE_KEY);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  if (!data || !content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-ink px-6 text-center">
        <p className="text-lg font-semibold text-white">This booking page isn’t available.</p>
        <p className="text-sm text-zinc-400">Please check the link, or check back soon.</p>
      </div>
    );
  }

  const accent = content.accentColor && HEX_RE.test(content.accentColor) ? content.accentColor : "#E6A24B";
  const accentStyle = {
    "--barber-accent": hexToChannels(accent),
    "--barber-accent-soft": mixChannels(accent, 255, 0.3),
    "--barber-accent-deep": mixChannels(accent, 0, 0.15),
  } as CSSProperties;
  const variant = data.template === "salon" ? "salon" : "barber";
  const services = (content.services ?? []).filter((s) => (s.name ?? "").trim());
  const hours = content.hours ?? [];
  const telHref = content.phone ? `tel:${content.phone.replace(/[^\d+]/g, "")}` : "";

  return (
    <div className="relative min-h-screen bg-ink font-body text-zinc-200" style={accentStyle}>
      {/* Full-page background. The image is a normal absolutely-positioned layer that
          paints ABOVE the root's bg-ink and BELOW the content (content is relative z-10).
          NOT a negative-z / fixed layer — that sat behind the opaque app background and
          black-screened. Always shows an image: the real hero, or the stock barber one. */}
      <img
        src={content.heroImageUrl || STOCK_HERO}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-ink/65" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/70 to-ink/95" />

      {/* Header — matches the full barber template's treatment: a sticky, blurred bar
          with the bolder wordmark, a call button and a proper Book button. */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink/70 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/55">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          {content.logoUrl ? (
            <img src={content.logoUrl} alt={businessName} className="h-9 w-auto object-contain" />
          ) : (
            <span className="inline-flex min-w-0 items-baseline gap-1">
              <span className="break-words font-display text-lg uppercase leading-tight tracking-[0.04em] text-white sm:text-2xl sm:tracking-[0.06em]">{businessName}</span>
              <span className="mb-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {content.phone && (
              <a
                href={telHref}
                aria-label={`Call ${businessName}`}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/12 bg-white/[0.03] text-zinc-200 transition-all hover:-translate-y-0.5 hover:border-white/30 hover:text-white"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => openFlow(null)}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-ink shadow-lg transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: accent }}
            >
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">Book now</span>
              <span className="sm:hidden">Book</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero — name + tagline + reviews. No CTA here: the header "Book now" and the
          tap-to-book services are the booking paths, so the hero just sets the scene. */}
      <section className="relative z-10 flex flex-col items-center justify-center px-6 pb-12 pt-14 text-center">
        <h1 className="font-display text-3xl uppercase tracking-wide text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] sm:text-4xl">
          {businessName}
        </h1>
        <p className="mt-3 text-sm text-zinc-300">Book your appointment online</p>
        {/* Google reviews up top so they're visible without scrolling. */}
        {typeof content.googleRating === "number" && (() => {
          const inner = (
            <>
              <span style={{ color: accent }}>★</span>
              <span className="font-bold text-white">{content.googleRating!.toFixed(1)}</span>
              {typeof content.reviewCount === "number" && (
                <span className="text-xs text-zinc-300">· {content.reviewCount} Google reviews</span>
              )}
            </>
          );
          return content.googleReviewsUrl ? (
            <a href={content.googleReviewsUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 backdrop-blur-sm transition-colors hover:border-white/35">
              {inner}
            </a>
          ) : (
            <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 backdrop-blur-sm">
              {inner}
            </div>
          );
        })()}
      </section>

      {/* Lean, booking-focused detail — all from data already on the row. No about,
          gallery, marketing copy or reviews list. */}
      <main className="relative z-10 mx-auto max-w-4xl space-y-6 px-6 pb-12 pt-2">
        {/* Services + hours: two columns on desktop, stacked on mobile. */}
        <div className="grid gap-6 md:grid-cols-2">
          {services.length > 0 && (
            <section className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl uppercase tracking-wide text-white">Services</h2>
                <span className="text-xs uppercase tracking-wide text-zinc-400">Tap to book</span>
              </div>
              <ul className="mt-4 flex-1 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm">
                {services.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => openFlow(s)}
                      className="flex w-full items-baseline justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{s.name}</div>
                        {typeof s.durationMins === "number" && s.durationMins > 0 && (
                          <div className="text-xs uppercase tracking-wide text-zinc-500">{s.durationMins} min</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2">
                        {s.price && (
                          <span className="font-display text-xl tracking-wide" style={{ color: accent }}>{s.price}</span>
                        )}
                        <span aria-hidden className="self-center text-lg leading-none" style={{ color: accent }}>›</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hours.length > 0 && (
            <section className="flex flex-col">
              <h2 className="font-display text-2xl uppercase tracking-wide text-white">Opening hours</h2>
              <ul className="mt-4 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm">
                {hours.map((h, i) => (
                  <li key={`${h.day}-${i}`} className="flex items-center justify-between gap-4 border-b border-white/[0.05] px-4 py-3 last:border-b-0">
                    <span className="text-sm font-medium text-zinc-200">{h.day}</span>
                    <span className={`text-sm tabular-nums ${/closed/i.test(h.open) ? "text-zinc-500" : "text-zinc-300"}`}>{h.open}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Contact: phone + address. The Google reviews now sit up in the hero so
            they're visible without scrolling. */}
        {(content.phone || content.address) && (
          <section className="mx-auto flex max-w-xl flex-col items-center gap-1 rounded-2xl border border-white/10 bg-black/40 p-4 text-center backdrop-blur-sm">
            {content.phone && (
              <a href={telHref} className="block font-semibold text-white transition-colors hover:text-amber-soft">{content.phone}</a>
            )}
            {content.address && <div className="text-sm text-zinc-400">{content.address}</div>}
          </section>
        )}

      </main>

      <BookingFlow open={open} onClose={() => setOpen(false)} slug={data.siteName} content={content} variant={variant} initialService={picked} />

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-6 text-center text-xs text-zinc-600">
        Online booking by bookmybarber.uk
      </footer>
    </div>
  );
}
