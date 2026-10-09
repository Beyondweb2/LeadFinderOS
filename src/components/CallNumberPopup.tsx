import { useState, type KeyboardEvent } from 'react';
import { Check, Copy, MessageCircle, PhoneCall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { callNumberView, type CallNumberView } from '@/lib/callNumber';

/* ══ THE NUMBER WINDOW (Paul, 2026-10-07) ═════════════════════════════════════════════════════════════
   Outreach's CALL opens the prospect popup with THIS small window over it: the business, the number to dial
   on, Copy number, the two ways to call, and Cancel. The prospect popup stays visible underneath (a light
   overlay), and on a phone this window sits at the bottom as a compact sheet.
   🔴 TWO WAYS TO CALL (Paul, 2026-10-07):
      · CALL ON WHATSAPP — opens the WhatsApp app at this number in a new tab (the rep calls from there) and closes
        this window. UK / Australian numbers only (callNumber.whatsappUrl).
      · CALL MANUALLY — closes this window; the rep dials on their own phone (Copy number first).
   ⛔ Nothing else external and nothing unasked: no tel: link (on a laptop with WhatsApp Desktop installed a tel:
      link is what made the old Call ask "Open WhatsApp?" unasked), no window.open, no location change.
   ⛔ NOTHING WRITTEN. Both only close this window (callArrival.afterStartCall) — the script stays open to read
      while talking, and "What happened?" waits for LOG CALL. Copy only copies, and says Copied.
   ════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** ← / → step to the next lead in the popup underneath; never from inside this window. */
const keepKeysHere = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); };

/** The window's content — plain markup, no portal, so it can be rendered and checked on its own. */
export function CallNumberCard({ businessName, view, copied, onCopy, onStartCall, onCancel, onBrowserCall }: {
  businessName: string;
  view: CallNumberView | null;
  copied: boolean;
  onCopy: () => void;
  onStartCall: () => void;
  onCancel: () => void;
  /** Call from the browser (Twilio): shown only where the screen offers it. Not the free options below. */
  onBrowserCall?: () => void;
}) {
  return (
    <div className="min-w-0 space-y-4" data-testid="call-number-card">
      <div className="min-w-0 pr-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Call</p>
        <p className="mt-0.5 break-words text-base font-bold leading-snug" data-testid="call-number-business">{businessName}</p>
      </div>
      {view ? (
        <div className="rounded-2xl bg-muted/50 px-4 py-3 text-center ring-1 ring-inset ring-border/70">
          <p className="select-all break-all font-mono text-2xl font-bold tracking-wide tabular-nums sm:text-[1.7rem]" data-testid="call-number-display">{view.display}</p>
          {view.stored && <p className="mt-1 break-all text-xs text-muted-foreground" data-testid="call-number-stored">On file as {view.stored}</p>}
        </div>
      ) : (
        <p className="rounded-2xl bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground" data-testid="call-number-none">No phone number on file.</p>
      )}
      <Button type="button" variant="outline" className="h-10 w-full min-w-0 rounded-full" onClick={onCopy} disabled={!view} data-testid="call-number-copy">
        {copied ? <Check className="mr-1.5 h-4 w-4 text-emerald-500" /> : <Copy className="mr-1.5 h-4 w-4" />}
        {copied ? 'Copied' : 'Copy number'}
      </Button>
      {onBrowserCall && view && (
        <Button type="button" className="h-11 w-full min-w-0 rounded-full bg-amber-500 font-bold text-white hover:bg-amber-600" onClick={onBrowserCall} data-testid="call-number-browser">
          <PhoneCall className="mr-1.5 h-4 w-4 shrink-0" />Call in browser
        </Button>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {view?.whatsappUrl && (
          <Button asChild className="h-11 min-w-0 rounded-full bg-emerald-600 font-bold text-white hover:bg-emerald-700">
            <a href={view.whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={onStartCall} data-testid="call-number-whatsapp">
              <MessageCircle className="mr-1.5 h-4 w-4 shrink-0" />Call on WhatsApp
            </a>
          </Button>
        )}
        <Button type="button" className={cn('h-11 min-w-0 rounded-full font-bold', !view?.whatsappUrl && 'sm:col-span-2')} onClick={onStartCall} data-testid="call-number-start">
          <PhoneCall className="mr-1.5 h-4 w-4 shrink-0" />Call manually
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">{view?.whatsappUrl ? 'Call on WhatsApp, or copy the number and dial it on your phone.' : 'Copy the number and dial it on your phone.'} The script stays open here; press Log call when you are done.</p>
      <button type="button" onClick={onCancel} className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground" data-testid="call-number-cancel">Cancel</button>
    </div>
  );
}

export function CallNumberPopup({ open, onOpenChange, businessName, phone, country, onStartCall, onBrowserCall }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  phone: string | null | undefined;
  country?: string | null;
  /** CALL: the caller closes this window and nothing else. */
  onStartCall: () => void;
  onBrowserCall?: () => void;
}) {
  const view = callNumberView(phone, country);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!view) return;
    void navigator.clipboard?.writeText(view.copy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }, () => {});
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-black/25 !backdrop-blur-none"
        className="gap-0 sm:max-w-sm max-sm:bottom-0 max-sm:top-auto max-sm:translate-y-0 max-sm:rounded-t-[1.25rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
        onKeyDown={keepKeysHere} data-testid="call-number-popup">
        <DialogTitle className="sr-only">Call {businessName}</DialogTitle>
        <DialogDescription className="sr-only">The number to dial on your own phone</DialogDescription>
        <CallNumberCard businessName={businessName} view={view} copied={copied} onCopy={copy}
          onStartCall={onStartCall} onCancel={() => onOpenChange(false)} onBrowserCall={onBrowserCall} />
      </DialogContent>
    </Dialog>
  );
}
