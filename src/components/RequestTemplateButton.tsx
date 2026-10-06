import { useState } from 'react';
import { ExternalLink, FilePlus2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { DialogHero } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import {
  META_TEMPLATE_GUIDELINES_URL, TEMPLATE_REQUEST_LIMITS, checkTemplateRequest, templateRequestRefusal,
  type TemplateRequestSource,
} from '@/lib/templateRequest';

/* "Request a template" — the link under every approved-template picker. Sends Paul an email of
   exactly what was typed (fn template-request, which saves the request first). Nothing goes to Meta. */
export function RequestTemplateButton({ source, className }: { source: TemplateRequestSource; className?: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ message: '', useCase: '', whyNotExisting: '', name: '' });
  const [busy, setBusy] = useState(false);
  const check = checkTemplateRequest({ ...f, source });
  const checkError = check.ok ? null : (check as Extract<typeof check, { ok: false }>).error;
  const L = TEMPLATE_REQUEST_LIMITS;

  const send = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    try {
      const r = await invokeEdge<{ ok: boolean; emailed?: boolean; error?: string }>('template-request', { ...f, source });
      if (!r.ok) { toast({ title: 'Request not sent', description: templateRequestRefusal(r.error), variant: 'destructive' }); return; }
      toast(r.emailed
        ? { title: 'Request sent to Paul', description: 'He has the exact wording by email and will decide whether to register it.' }
        : { title: 'Request saved', description: "The email to Paul didn't go through, but your request is saved and he can see it." });
      setF({ message: '', useCase: '', whyNotExisting: '', name: '' });
      setOpen(false);
    } catch (e) {
      toast({ title: 'Request not sent', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const count = (v: string, max: number) => <span className={v.length > max ? 'text-destructive' : ''}>{v.length}/{max}</span>;

  return (
    <>
      <Button type="button" variant="link" size="sm" className={className ?? 'h-auto px-0 text-xs'} onClick={() => setOpen(true)}>
        <FilePlus2 className="mr-1 h-3.5 w-3.5" />Request a template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHero
            icon={FilePlus2}
            tone="blue"
            title="Request a WhatsApp template"
            subtitle="Paul gets an email with exactly what you write here and decides whether to register it with Meta. Nothing is sent to anyone else."
          />
          <div className="space-y-3">
            <a href={META_TEMPLATE_GUIDELINES_URL} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2">
              Read WhatsApp's template rules before you write <ExternalLink className="h-3 w-3" />
            </a>
            <label className="block text-xs font-medium">What should the message say?
              <Textarea rows={6} className="mt-1 text-sm" value={f.message} onChange={(e) => setF((p) => ({ ...p, message: e.target.value }))}
                placeholder="Hi [name], … Write the full message. Put details that change in square brackets, e.g. [business], [town], [link]." />
              <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">{count(f.message, L.message)}</span>
            </label>
            <label className="block text-xs font-medium">When would you use it?
              <Input className="mt-1 h-9 text-sm" value={f.useCase} onChange={(e) => setF((p) => ({ ...p, useCase: e.target.value }))}
                placeholder="e.g. after a call where they asked for prices by WhatsApp" />
            </label>
            <label className="block text-xs font-medium">Why doesn't an existing template cover this?
              <Textarea rows={2} className="mt-1 resize-none text-sm" value={f.whyNotExisting} onChange={(e) => setF((p) => ({ ...p, whyNotExisting: e.target.value }))}
                placeholder="One or two lines — e.g. every current template is a cold opener; this is for someone I've already spoken to" />
              <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">{count(f.whyNotExisting, L.whyNotExisting)}</span>
            </label>
            <label className="block text-xs font-medium">Suggested name <span className="font-normal text-muted-foreground">(optional)</span>
              <Input className="mt-1 h-9 text-sm" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. prices after a call" />
            </label>
            {checkError && (f.message || f.useCase || f.whyNotExisting) && (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">{templateRequestRefusal(checkError)}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={() => void send()} disabled={!check.ok || busy}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Send to Paul
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
