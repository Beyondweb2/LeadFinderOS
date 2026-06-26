import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SiteContent } from "@/templates/shared/content";
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
  const [open, setOpen] = useState(true);

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

  return (
    <div className="min-h-screen bg-ink font-body text-zinc-200" style={accentStyle}>
      <header className="relative isolate flex min-h-[44vh] flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
        {content.heroImageUrl ? (
          <img src={content.heroImageUrl} alt={businessName} className="absolute inset-0 -z-10 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#1c1509] via-ink to-black" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />

        {content.logoUrl && (
          <img src={content.logoUrl} alt={businessName} className="mb-4 h-14 w-auto object-contain" />
        )}
        <h1 className="font-display text-4xl uppercase tracking-wide text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] sm:text-5xl">
          {businessName}
        </h1>
        <p className="mt-3 text-sm text-zinc-300">Book your appointment online</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-base font-bold text-ink shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          style={{ backgroundColor: accent }}
        >
          Book appointment
        </button>
      </header>

      <BookingFlow open={open} onClose={() => setOpen(false)} slug={data.siteName} content={content} variant={variant} />

      <footer className="border-t border-white/[0.06] px-6 py-6 text-center text-xs text-zinc-600">
        Online booking by bookmybarber.uk
      </footer>
    </div>
  );
}
