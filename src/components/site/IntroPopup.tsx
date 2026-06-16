import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface IntroPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
}

/**
 * Light, trust-building intro shown once when a barber opens their /s/:token
 * link. NOT a claim or upsell — it just reassures them the site is genuinely
 * free and easy to edit, then gets out of the way ("See my site"). Claiming
 * happens later via the bottom "Claim for free" bar; the upsell lives on the
 * dashboard. Copy is intentionally human/understated — do not rewrite.
 */
export function IntroPopup({ open, onOpenChange, businessName }: IntroPopupProps) {
  const name = businessName?.trim() || 'your business';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-2xl border-line bg-ink-card p-6 text-zinc-200 sm:p-7">
        <h2 className="text-2xl font-bold text-white">This is your website</h2>

        <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-300">
          <p>
            Built for <span className="font-semibold text-white">{name}</span> — and it's yours, free.
          </p>
          <p>
            No catch, no card, nothing to pay. I build these for local barbers and I made this one for
            you. Have a proper look around — if you like it, you can claim it and it's yours to keep.
          </p>
          <p>
            It's easy to change anything yourself too — your photos, your text, your hours — takes a
            couple of minutes, no tech skills needed.
          </p>
          <div>
            <p>Any questions, just get in touch:</p>
            <p className="mt-1">
              <a href="mailto:paul@move37.fun" className="text-amber hover:text-amber-soft hover:underline">
                paul@move37.fun
              </a>
            </p>
            <p>
              <a href="tel:+447767746740" className="text-amber hover:text-amber-soft hover:underline">
                +44 7767 746740
              </a>
            </p>
            <p className="mt-3 text-zinc-400">— Paul</p>
          </div>
        </div>

        <Button
          onClick={() => onOpenChange(false)}
          className="mt-5 w-full rounded-full bg-amber py-6 text-base font-bold text-ink shadow-[0_8px_30px_-6px_rgba(230,162,75,0.5)] transition-all hover:-translate-y-0.5 hover:bg-amber-soft"
        >
          See my site
        </Button>
      </DialogContent>
    </Dialog>
  );
}
