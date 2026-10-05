import { ClipboardCopy, Lock, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CLIENT_NEED_WORDS, clientInfoRequestMessage } from '@/lib/clientMissingInfo';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NEED FROM THIS CLIENT — an INTERNAL helper in the Inbox, opened by Paid Client → Contact client
   (/inbox?lead=<id>&need=<keys>, 2026-10-05, client missing-info actions).
   ⛔ INTERNAL. It is never sent and never becomes part of a message by itself. "Put in reply box" only
   fills the composer (the same draft path as the reply drafter) — Paul edits and presses Send himself,
   and only inside the 24-hour window where free text is allowed at all. Outside it, Copy only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export function ClientInfoNeededHelper({ keys, contactName, windowOpen, onDraft, onDismiss }: {
  keys: string[]; contactName: string | null; windowOpen: boolean; onDraft: (text: string) => void; onDismiss: () => void;
}) {
  const { toast } = useToast();
  const shown = keys.filter((k) => CLIENT_NEED_WORDS[k]);
  if (!shown.length) return null;
  const message = clientInfoRequestMessage({ contactName, keys: shown.filter((k) => k !== 'onboarding') });
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast({ title: 'Request copied', description: 'Nothing was sent.' }); }
    catch { toast({ title: 'Copy blocked by the browser', description: message, variant: 'destructive' }); }
  };
  return (
    <div className="mx-3 mt-2 rounded-lg border border-dashed border-amber-500/60 bg-amber-500/[0.06] p-2.5 text-xs" data-testid="client-info-needed-helper" role="note">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 font-semibold"><Lock className="h-3.5 w-3.5" />Need from this client <span className="font-normal text-muted-foreground">· internal — never sent</span></p>
        <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Hide this note"><X className="h-3.5 w-3.5" /></button>
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{shown.map((k) => <li key={k}>{CLIENT_NEED_WORDS[k]}</li>)}</ul>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copy()} data-testid="helper-copy-request"><ClipboardCopy className="mr-1 h-3.5 w-3.5" />Copy request</Button>
        {windowOpen && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onDraft(message)} data-testid="helper-draft-request"
            title="Puts the request in the reply box for you to edit. It is not sent until you press Send.">
            <PenLine className="mr-1 h-3.5 w-3.5" />Put in reply box
          </Button>
        )}
      </div>
      {!windowOpen && <p className="mt-1.5 text-muted-foreground">The 24-hour window is closed: only an approved template can be sent from here. Copy the request for email, or use a template below.</p>}
    </div>
  );
}
