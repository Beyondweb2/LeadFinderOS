import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SiteContent } from "@/templates/shared/content";
import type { BarberService } from "@/templates/barber/types";
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
      {/* Full-page background image behind the whole page + a strong dark scrim so
          the services / hours / contact text stays clearly readable (legibility first). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        {content.heroImageUrl ? (
          <img src={content.heroImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1c1509] via-ink to-black" />
        )}
        <div className="absolute inset-0 bg-ink/85" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/85 to-ink/95" />
      </div>

      <header className="relative flex min-h-[46vh] flex-col items-center justify-center px-6 py-14 text-center">
        {content.logoUrl && (
          <img src={content.logoUrl} alt={businessName} className="mb-4 h-14 w-auto object-contain" />
        )}
        <h1 className="font-display text-4xl uppercase tracking-wide text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)] sm:text-5xl">
          {businessName}
        </h1>
        <p className="mt-3 text-sm text-zinc-300">Book your appointment online</p>
        <button
          type="button"
          onClick={() => openFlow(null)}
          className="mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-ink shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ backgroundColor: accent }}
        >
          Book appointment
        </button>
      </header>

      {/* Lean, booking-focused detail — all from data already on the row. No about,
          gallery, marketing copy or reviews list. */}
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
        {/* Services + hours: two columns on desktop, stacked on mobile. */}
        <div className="grid gap-8 md:grid-cols-2">
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

        {/* Contact + rating: centred, below the two columns. */}
        {(content.phone || content.address || typeof content.googleRating === "number") && (
          <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 text-center backdrop-blur-sm sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
            <div className="space-y-1 text-sm">
              {content.phone && (
                <a href={telHref} className="block font-semibold text-white transition-colors hover:text-amber-soft">{content.phone}</a>
              )}
              {content.address && <div className="text-zinc-400">{content.address}</div>}
            </div>
            {typeof content.googleRating === "number" && (
              content.googleReviewsUrl ? (
                <a
                  href={content.googleReviewsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 transition-colors hover:border-amber/40"
                >
                  <span style={{ color: accent }}>★</span>
                  <span className="font-bold text-white">{content.googleRating.toFixed(1)}</span>
                  {typeof content.reviewCount === "number" && (
                    <span className="text-xs text-zinc-400">({content.reviewCount} Google reviews)</span>
                  )}
                </a>
              ) : (
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                  <span style={{ color: accent }}>★</span>
                  <span className="font-bold text-white">{content.googleRating.toFixed(1)}</span>
                  {typeof content.reviewCount === "number" && (
                    <span className="text-xs text-zinc-400">({content.reviewCount} Google reviews)</span>
                  )}
                </div>
              )
            )}
          </section>
        )}

      </main>

      <BookingFlow open={open} onClose={() => setOpen(false)} slug={data.siteName} content={content} variant={variant} initialService={picked} />

      <footer className="border-t border-white/[0.06] px-6 py-6 text-center text-xs text-zinc-600">
        Online booking by bookmybarber.uk
      </footer>
    </div>
  );
}
