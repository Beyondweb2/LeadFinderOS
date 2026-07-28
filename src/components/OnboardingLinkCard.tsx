import { useState } from 'react';
import { Copy, Check, Link2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { onboardingUrl, onboardingUrlLabel } from '@/config/findableSite';
import type { OutreachLead } from '@/types/outreach';

/**
 * COPY THE SIGN-UP LINK for one lead.
 *
 * The link was being typed by hand, and the failure is silent rather than loud: a wrong or missing
 * ?lead= does not error, it just makes a known prospect anonymous. The flow still runs, they can
 * still pay, and only afterwards does it emerge that no baseline exists and the 8-week guarantee
 * cannot be measured. So the link is generated, shown, and copied — never retyped.
 */

/** Statuses that mean the money has already landed. Mirrors the edge functions' PAID_OR_BEYOND. */
const PAID_OR_BEYOND = new Set(['payment_received', 'in_delivery', 'completed']);

/**
 * What the sign-up flow needs from a lead, and what degrades without it. Deliberately split into
 * "already paid" (the link is pointless) and "will half-work" (the link functions but something
 * downstream suffers), because those want different words on screen.
 */
function assess(lead: OutreachLead) {
  const paid = PAID_OR_BEYOND.has(lead.status) || ((lead.amount_paid ?? 0) > 0);

  const trade = (lead.category ?? lead.search_keyword ?? '').trim();
  const town = (lead.search_location ?? lead.address ?? '').trim();
  const name = (lead.business_name ?? '').trim();

  const warnings: string[] = [];
  // The one that actually breaks something: startPaidBaseline refuses with no_business_type, so a
  // paying client would get no baseline — the exact hole the guarantee is measured through.
  if (!trade) warnings.push('no trade stored, so no baseline can run after they pay');
  // Cosmetic but visible: the form's suggestion chips fall back to generic without a trade, and the
  // headline says "your business" instead of naming them.
  if (!name) warnings.push('no business name, so the page cannot greet them by name');
  // Recoverable by the customer — the town field just starts empty instead of prefilled.
  if (!town) warnings.push('no town on file, so they start with an empty area field');

  return { paid, warnings, blocking: !trade };
}

export function OnboardingLinkCard({ lead }: { lead: OutreachLead }) {
  const [copied, setCopied] = useState(false);
  const { paid, warnings, blocking } = assess(lead);
  const url = onboardingUrl(lead.id);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard denied (insecure context, or permission refused). The link is on screen and
         selectable, so there is still a way to get it — better than an error toast. */
    }
  };

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm">
      <div className="mb-2 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-sky-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Sign-up link</span>
      </div>

      {paid ? (
        /* Already paid: no button at all. Sending an existing client back to checkout wastes their
           time and ours — findable-checkout would refuse it anyway with already_client. */
        <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Already signed up and paid — they don&apos;t need this link.</span>
        </div>
      ) : (
        <>
          {/* The link, visible before it goes anywhere. Shown scheme-less because the https:// is
              noise, and break-all so a long uuid wraps rather than stretching the dialog. */}
          <p className="mb-2 break-all rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            {onboardingUrlLabel(lead.id)}
          </p>

          <Button
            size="sm"
            variant={copied ? 'outline' : 'default'}
            className="h-7 w-full gap-1.5 text-xs"
            onClick={copy}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy sign-up link'}
          </Button>

          {warnings.length > 0 && (
            /* Told BEFORE sending, not after. Amber rather than red when nothing is blocking:
               these links still work, they just cost something downstream. */
            <div className={`mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed ${blocking ? 'text-orange-400' : 'text-amber-400/90'}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {warnings.length === 1 ? 'Heads up: ' : 'Heads up — '}
                {warnings.join('; ')}.
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}
