import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, Phone } from 'lucide-react';

interface IntroPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  /** Booking-only sites are the paid online-booking product (not a free website),
   *  so the copy must adapt: "your booking page", no "it's free" claim. */
  bookingOnly?: boolean;
}

const SHELL_BG =
  'radial-gradient(1100px 600px at 85% -8%, rgba(230,162,75,0.12), transparent 60%),' +
  'radial-gradient(800px 500px at -10% 8%, rgba(230,162,75,0.06), transparent 55%)';

/**
 * Light, trust-building intro shown once when a barber opens their /s/:token link.
 *
 * Intentionally NON-BLOCKING (not a Radix modal): the dim backdrop is purely
 * visual (`pointer-events-none`) so it never intercepts a click on the page
 * beneath — in particular the fixed "Claim for free" bar stays clickable on the
 * FIRST press. A Radix Dialog here used to swallow the first tap (it sets
 * body{pointer-events:none} + closes on outside-pointerdown), which is what made
 * the claim button feel like it needed two presses. Only the card + its
 * "See my site" button are interactive; Escape also closes it. Copy is
 * intentionally human/understated - keep it.
 */
export function IntroPopup({ open, onOpenChange, businessName, bookingOnly = false }: IntroPopupProps) {
  const name = businessName?.trim() || 'your business';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => onOpenChange(false)}
    >
      {/* Dim backdrop — clicking it (or "See my site") closes. While this popup is
          open the Claim bar is hidden (showClaimBar=false on /s/), so there is no
          bar behind the popup to mis-tap — the cause of the old "double-press". */}
      <div aria-hidden className="absolute inset-0 bg-ink/80 backdrop-blur-sm animate-in fade-in" />

      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line bg-ink-card p-6 text-zinc-300 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)] animate-in fade-in zoom-in-95 sm:p-8"
        style={{ backgroundImage: SHELL_BG }}
      >
        <div className="flex flex-col">
          {/* Centred focal hero — business name as a plain eyebrow (no pill/badge) */}
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-soft">
              Built for {name}
            </span>
            <h2 className="mt-2 font-display text-4xl uppercase leading-[1.0] tracking-wide text-white sm:text-5xl">
              {bookingOnly ? 'This is your booking page' : 'This is your website'}
            </h2>
            <p className="mt-3 text-base font-semibold text-white">
              {bookingOnly ? 'Take bookings online, day and night.' : "It's free — no card, no catch."}
            </p>
          </div>

          {/* Left-aligned supporting copy + contact (editorial contrast) */}
          <p className="mt-5 text-sm leading-relaxed text-zinc-400">
            {bookingOnly
              ? "Have a proper look around — it's yours to make your own. Your services, prices, opening hours and branding are all editable."
              : "Have a proper look around — it's yours to keep, and yours to make your own. The photos, colours, text and services are all editable."}
          </p>

          <div className="mt-4 flex flex-col gap-2.5 rounded-xl border border-line bg-white/[0.03] p-3.5 sm:flex-row sm:items-center sm:gap-5">
            <a
              href="mailto:paul@move37.fun"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber transition-colors hover:text-amber-soft"
            >
              <Mail className="h-4 w-4 shrink-0" /> paul@move37.fun
            </a>
            <a
              href="tel:+447767746740"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber transition-colors hover:text-amber-soft"
            >
              <Phone className="h-4 w-4 shrink-0" /> +44 7767 746740
            </a>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Any questions, just ask — Paul</p>

          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-6 w-full rounded-full bg-amber py-6 text-base font-bold text-ink shadow-[0_8px_30px_-6px_rgba(230,162,75,0.5)] transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
          >
            Start editing
          </Button>
        </div>
      </div>
    </div>
  );
}
