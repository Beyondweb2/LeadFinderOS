import { Loader2, Mail, MessageCircle, MessageSquareText, Phone, PhoneCall, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE, type Tone } from '@/components/salesDash/primitives';
import { useContactDecision } from '@/hooks/useSms';
import { ROUTE_LABEL, type RouteChannel, type RouteOption, type RoutePurpose } from '@/lib/contactRouting';

/* "BEST WAY TO CONTACT" (2026-10-09) — the recommendation from src/lib/contactRouting.ts, drawn once and used by the
   Call workspace and the Close screens. It RECOMMENDS; the rep can still pick any available channel (an override is
   a choice, never blocked unless the channel is genuinely unavailable — opted out, no number, not set up).
   Nothing is sent from here: a pick calls `onPick` and the screen's own button does the action. */
const ICON: Record<RouteChannel, typeof Phone> = { whatsapp: MessageCircle, sms: MessageSquareText, email: Mail, call: PhoneCall, whatsapp_app_call: Phone };
const TONE_OF: Record<RouteChannel, Tone> = { whatsapp: 'green', sms: 'blue', email: 'purple', call: 'amber', whatsapp_app_call: 'green' };

export function BestWayToContact({ leadId, purpose = 'link', onPick, className, failed, alreadySent }: {
  leadId: string; purpose?: RoutePurpose; onPick?: (c: RouteChannel) => void; className?: string;
  failed?: RouteChannel[]; alreadySent?: RouteChannel[];
}) {
  const { decision, isLoading } = useContactDecision(leadId, purpose, { failed, alreadySent });
  if (isLoading || !decision) {
    return <div className={cn('flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs text-muted-foreground', className)}><Loader2 className="h-3.5 w-3.5 animate-spin" />Working out the best way to reach them…</div>;
  }
  const bad = decision.best === null;
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', bad ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-border/60 bg-card/60', className)} data-testid="best-way-to-contact" data-best={decision.best ?? 'none'}>
      <p className={cn('flex items-start gap-1.5 text-sm font-semibold leading-snug', bad && TONE.amber.text)} data-testid="best-way-headline">
        {bad && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}{decision.headline}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Ways to contact">
        {decision.options.map((o) => <Chip key={o.channel} o={o} onPick={onPick} />)}
      </div>
      {decision.options.filter((o) => !o.available || o.state === 'failed').slice(0, 2).map((o) => (
        <p key={o.channel} className="mt-1 text-[11px] leading-snug text-muted-foreground"><span className="font-semibold">{ROUTE_LABEL[o.channel]}:</span> {o.state === 'failed' ? 'did not arrive — pick another way.' : o.reason}</p>
      ))}
    </div>
  );
}

function Chip({ o, onPick }: { o: RouteOption; onPick?: (c: RouteChannel) => void }) {
  const I = ICON[o.channel];
  const tone = TONE_OF[o.channel];
  const usable = o.available && o.state !== 'failed';
  return (
    <button type="button" disabled={!usable || !onPick} onClick={() => onPick?.(o.channel)} title={o.reason} data-testid={`route-${o.channel}`} data-recommended={o.recommended ? 'true' : 'false'}
      className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition',
        o.recommended ? cn(TONE[tone].solid, 'ring-transparent') : usable ? cn(TONE[tone].soft, TONE[tone].text, TONE[tone].ring, 'hover:brightness-110') : 'bg-muted/40 text-muted-foreground/60 ring-border/40 line-through decoration-muted-foreground/30',
        !onPick && 'cursor-default')}>
      <I className="h-3.5 w-3.5 shrink-0" />{ROUTE_LABEL[o.channel]}
      <span className={cn('font-normal', o.recommended ? 'opacity-90' : 'opacity-70')}>{o.state === 'already_sent' ? 'sent' : o.costWords}</span>
    </button>
  );
}
