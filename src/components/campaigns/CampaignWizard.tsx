import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LeadChooser } from '@/components/campaigns/LeadChooser';
import { TemplatePreviewButton, TemplateSnippet } from '@/components/TemplateWordingPreview';
import { useCampaignActions, useCampaignCandidates } from '@/hooks/useMyCampaigns';
import { CAMPAIGN_NAME_MAX, campaignErrorText, launchSkipLine, openerPurpose } from '@/lib/campaignRules';
import { templateLabel } from '@/types/outreach';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   NEW CAMPAIGN — four steps, no settings (2026-10-03). Name → leads → message → review & launch.
   Everything a salesperson used to be asked and need not decide is set by the server: an audit campaign,
   WhatsApp, the current approved first message (the only one the queue sends; follow-ups go from WhatsApp
   after a reply). The name check while typing is a courtesy — the database's unique index decides, so two
   people pressing Create on one name at once get one campaign and one "already exists".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const STEPS = ['Name', 'Leads', 'Message', 'Review'] as const;

export function CampaignWizard({ open, onOpenChange, opener }: { open: boolean; onOpenChange: (v: boolean) => void; opener: string | null }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const actions = useCampaignActions();
  /* ⛔ The STABLE function, not the actions object (a new object every render): depending on the object re-ran the
     check on every render, which set state, which rendered — an infinite loop found driving the real wizard. */
  const { nameAvailable } = actions;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [nameState, setNameState] = useState<{ checking: boolean; error: string | null }>({ checking: false, error: null });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | 'draft' | 'launch'>(null);
  const candidates = useCampaignCandidates(null, open);

  useEffect(() => { if (open) { setStep(0); setName(''); setSelected(new Set()); setNameState({ checking: false, error: null }); } }, [open]);

  /* Availability while typing (debounced). Says only "taken" — never whose. */
  useEffect(() => {
    const n = name.trim();
    if (!n) { setNameState((p) => (p.checking || p.error ? { checking: false, error: null } : p)); return; }
    if (n.length > CAMPAIGN_NAME_MAX) { setNameState({ checking: false, error: campaignErrorText('name_too_long') }); return; }
    setNameState((p) => ({ ...p, checking: true }));
    const t = window.setTimeout(async () => {
      const r = await nameAvailable(n);
      setNameState({ checking: false, error: r.ok && r.available === false ? campaignErrorText(String(r.reason ?? 'name_taken')) : null });
    }, 350);
    return () => window.clearTimeout(t);
  }, [name, nameAvailable]);

  const sendable = (candidates.data ?? []).filter((l) => selected.has(l.id) && l.sendable).length;
  const nameOk = !!name.trim() && !nameState.error && !nameState.checking;
  const canNext = step === 0 ? nameOk : step === 1 ? selected.size > 0 : true;

  const finish = async (launch: boolean) => {
    setBusy(launch ? 'launch' : 'draft');
    try {
      const c = await actions.create(name);
      if (!c.ok) {
        /* The race the index settles: someone took the name since the check. Back to step 1, plainly. */
        setNameState({ checking: false, error: campaignErrorText(String(c.error)) });
        setStep(0);
        return;
      }
      const id = String(c.id);
      const added = await actions.addLeads(id, [...selected]);
      if (!added.ok) { toast({ title: 'Campaign created, leads not added', description: campaignErrorText(String(added.error)), variant: 'destructive' }); navigate(`/campaigns/${id}`); onOpenChange(false); return; }
      if (launch) {
        const l = await actions.launch(id);
        if (!l.ok) toast({ title: 'Campaign created, not launched', description: campaignErrorText(String(l.error)), variant: 'destructive' });
        else toast({ title: 'Campaign launched', description: `${l.queued} ${Number(l.queued) === 1 ? 'message is' : 'messages are'} queued and will go out in the send window. ${launchSkipLine(l.skipped as Record<string, number>)}`.trim() });
      } else {
        toast({ title: 'Draft saved', description: `${Number(added.moved ?? 0)} leads added. Launch it when you are ready.` });
      }
      onOpenChange(false);
      navigate(`/campaigns/${id}`);
    } finally { setBusy(null); }
  };

  return <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
    <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>New campaign</DialogTitle>
        <DialogDescription className="sr-only">Name it, choose leads, check the message, launch.</DialogDescription>
        <ol className="mt-2 flex flex-wrap gap-1.5 text-xs" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1', i === step ? 'border-primary bg-primary text-primary-foreground' : i < step ? 'border-primary/40 text-primary' : 'text-muted-foreground')}>
            {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}{s}
          </li>)}
        </ol>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {step === 0 && <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="campaign-name">What is this campaign?</label>
          <Input id="campaign-name" autoFocus placeholder="e.g. Roofers - Manchester" value={name} maxLength={CAMPAIGN_NAME_MAX + 20}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && nameOk) setStep(1); }} />
          {nameState.checking && <p className="text-xs text-muted-foreground">Checking the name…</p>}
          {nameState.error && <p role="alert" className="text-sm text-destructive" data-testid="name-error">{nameState.error}</p>}
          {!nameState.error && !nameState.checking && name.trim() && <p className="text-xs text-emerald-700 dark:text-emerald-300">The name is free.</p>}
          <p className="text-xs text-muted-foreground">Usually the trade and the town. Every campaign name is unique.</p>
        </div>}

        {step === 1 && <LeadChooser campaignId={null} selected={selected} onChange={setSelected} />}

        {step === 2 && <div className="space-y-3 text-sm">
          <p className="font-medium">The first message</p>
          {opener ? <div className="space-y-2 rounded-md border p-3">
            <p className="font-semibold">{openerPurpose(opener, templateLabel(opener))}</p>
            <TemplateSnippet selected={opener} className="whitespace-normal" />
            <TemplatePreviewButton selected={opener} />
          </div> : <p className="text-destructive">{campaignErrorText('no_approved_opener')}</p>}
          <p className="text-muted-foreground">This is the approved first message, the one every new lead gets. When they reply, you carry on the conversation in WhatsApp.</p>
        </div>}

        {step === 3 && <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Campaign</dt><dd className="font-semibold">{name.trim()}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Message</dt><dd className="font-semibold">{opener ? openerPurpose(opener, templateLabel(opener)) : 'None approved'}</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Leads</dt><dd className="font-semibold" data-testid="review-leads">{selected.size} selected</dd></div>
          <div className="rounded-md border p-3"><dt className="text-xs text-muted-foreground">Will be messaged</dt><dd className="font-semibold">{sendable}</dd><dd className="text-xs text-muted-foreground">Sent in the send window, a few at a time. Leads that can’t be messaged stay in the campaign.</dd></div>
        </dl>}
      </div>

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))} disabled={!!busy}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 3
          ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Next</Button>
          : <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void finish(false)} disabled={!!busy}>{busy === 'draft' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save as draft</Button>
              <Button onClick={() => void finish(true)} disabled={!!busy || !opener || sendable === 0} title={sendable === 0 ? 'None of the chosen leads can be messaged' : undefined}>{busy === 'launch' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Launch</Button>
            </div>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
