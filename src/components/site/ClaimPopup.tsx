import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Check, ShieldCheck, CalendarClock, Sparkles, PartyPopper } from 'lucide-react';
import { recordSiteEvent } from '@/lib/siteTracking';
import { barberProPriceLabel } from '@/config/pricing';
import { SETUP_BY_NAME } from '@/config/barberBrand';

interface ClaimPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  shareToken: string;
  /** Already-claimed / already-interested state from the initial page load. */
  initialClaimed?: boolean;
  initialAddonWanted?: boolean;
  /** Bubble state up so the page can reflect it without a refetch. */
  onClaimed?: () => void;
  onAddonWanted?: () => void;
}

/**
 * The barber's claim popup, shown on their /s/:token site link. Clean and
 * trust-building (barber dark/amber palette, no LeadFinder chrome):
 *   • "Claim your free site"  → records the claim (one-time), shows the 24h note
 *   • "I want online booking + SMS reminders" → records ADD-ON INTEREST only
 *     (NO Stripe, NO payment — just flags interest)
 */
export function ClaimPopup({
  open,
  onOpenChange,
  businessName,
  shareToken,
  initialClaimed = false,
  initialAddonWanted = false,
  onClaimed,
  onAddonWanted,
}: ClaimPopupProps) {
  const [claimed, setClaimed] = useState(initialClaimed);
  const [addonWanted, setAddonWanted] = useState(initialAddonWanted);
  const [claiming, setClaiming] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);

  const handleClaim = async () => {
    if (claimed) return;
    setClaiming(true);
    const res = await recordSiteEvent(shareToken, 'claim');
    setClaiming(false);
    if (res.ok) {
      setClaimed(true);
      onClaimed?.();
    }
  };

  const handleAddon = async () => {
    if (addonWanted) return;
    setAddonLoading(true);
    const res = await recordSiteEvent(shareToken, 'addon_interest');
    setAddonLoading(false);
    if (res.ok) {
      setAddonWanted(true);
      onAddonWanted?.();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-0 overflow-hidden rounded-2xl border-line bg-ink-card p-0 text-zinc-200"
      >
        {/* Header band */}
        <div className="relative px-6 pt-7 pb-5 text-center border-b border-line bg-gradient-to-b from-amber/10 to-transparent">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber/30 bg-amber/10">
            {claimed ? <PartyPopper className="h-6 w-6 text-amber" /> : <ShieldCheck className="h-6 w-6 text-amber" />}
          </div>
          {claimed ? (
            <>
              <h2 className="mt-3 text-xl font-bold text-white">You're all set 🎉</h2>
              <p className="mt-1 text-sm text-zinc-400">
                <span className="font-semibold text-zinc-200">{businessName}</span> is claimed.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-xl font-bold text-white">This is your website</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Built for <span className="font-semibold text-zinc-200">{businessName}</span> — claim it free, it's yours to keep.
              </p>
            </>
          )}
        </div>

        <div className="space-y-4 px-6 py-5">
          {claimed ? (
            /* ── Post-claim confirmation ── */
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <Check className="mx-auto h-5 w-5 text-emerald-400" />
              <p className="mt-1.5 text-sm font-medium text-emerald-300">
                You'll receive a message from us with more info within 24 hours.
              </p>
            </div>
          ) : (
            /* ── Claim CTA ── */
            <>
              <div className="flex items-center justify-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-bold uppercase tracking-wide text-emerald-400">
                  100% Free
                </span>
                <span className="text-zinc-500">No card needed</span>
              </div>
              <Button
                onClick={handleClaim}
                disabled={claiming}
                className="w-full rounded-full bg-amber py-6 text-base font-bold text-ink shadow-[0_8px_30px_-6px_rgba(230,162,75,0.5)] transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
              >
                {claiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Claim your free site
              </Button>
            </>
          )}

          {/* ── Add-on interest (NO payment — flags interest only) ── */}
          <div className="rounded-xl border border-line bg-white/[0.02] p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber/10">
                <CalendarClock className="h-4 w-4 text-amber" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Online booking + no-show SMS reminders</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Let clients book 24/7 and cut no-shows. Optional add-on — {barberProPriceLabel}.
                </p>
              </div>
            </div>
            {addonWanted ? (
              <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-500/10 py-2 text-sm font-medium text-emerald-300">
                <Check className="h-4 w-4" /> Added — we'll include this in your message
              </div>
            ) : (
              <Button
                onClick={handleAddon}
                disabled={addonLoading}
                variant="outline"
                className="mt-3 w-full rounded-full border-amber/40 bg-transparent text-amber hover:bg-amber/10 hover:text-amber-soft"
              >
                {addonLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                I want online booking + SMS reminders
              </Button>
            )}
          </div>

          {/* Trust footer */}
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            No spam, ever. Set up by {SETUP_BY_NAME}.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
