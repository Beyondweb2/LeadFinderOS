import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Loader2, Plus, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { tradeWord } from '@/lib/trade';
import { chipsForTrade, serviceExamplesFor } from '@/lib/onboardingChips';
import {
  ACCESS_OPTIONS, AGENCY_OPTIONS, DOMAIN_OPTIONS, ONBOARDING_COPY as C, SELF_SITE_OPTIONS,
  accessConsequenceText, answerProblems, answersFromRecords, onboardingStatus, permissionAckText, siteAccessFromBranch,
  type OnboardingAnswers,
} from '@/lib/manualOnboarding';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COMPLETE / EDIT ONBOARDING MANUALLY — the customer's own onboarding questions, answered by Paul
   on the client's behalf.

   ⛔ THE CUSTOMER'S QUESTIONS, WORD FOR WORD, IN THE CUSTOMER'S ORDER, WITH THE CUSTOMER'S CONDITIONS
   (src/lib/manualOnboarding.ts holds the copy; the test pins it against findable-site). The one
   thing that differs is who is typing, and the header says so.
   ⛔ SAVING WRITES THE SAME onboarding_responses COLUMNS the customer's answers go to, via
   paid-client-hub `save_onboarding`. It never starts a baseline, never runs an audit and never
   contacts the client.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const call = (body: Record<string, unknown>) => invokeEdge<Record<string, any>>('paid-client-hub', body);

function Panel({ headline, sub, children }: { headline: string; sub: string; children: ReactNode }) {
  return <section className="space-y-3 rounded-md border p-3">
    <div><h3 className="font-medium">{headline}</h3><p className="text-xs text-muted-foreground">{sub}</p></div>
    {children}
  </section>;
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T | null; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return <div className="space-y-1.5">{options.map((o) =>
    <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${value === o.value ? 'border-primary bg-primary/5' : ''}`}>
      <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} aria-label={o.label} />
      <span>{o.label}</span>
    </label>)}</div>;
}

function Pills({ items, onRemove }: { items: string[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return <div className="flex flex-wrap gap-1.5">{items.map((x, i) =>
    <span key={x + i} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs">
      {x}<button type="button" aria-label={`Remove ${x}`} onClick={() => onRemove(i)}><X className="h-3 w-3" /></button>
    </span>)}</div>;
}

export function ManualOnboardingDialog({ leadId, open, onOpenChange, onSaved }: { leadId: string; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void | Promise<void> }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<OnboardingAnswers | null>(null);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [detected, setDetected] = useState<{ services: string[]; towns: string[] }>({ services: [], towns: [] });
  const [serviceInput, setServiceInput] = useState('');
  const [areaInput, setAreaInput] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null);
    call({ action: 'onboarding_form', lead_id: leadId })
      .then((res) => {
        if (cancelled) return;
        const f = res.form as { lead: Record<string, unknown>; onboarding: Record<string, unknown> | null; detected: { services: string[]; towns: string[] } };
        setRow(f.onboarding); setA(answersFromRecords(f.onboarding, f.lead)); setDetected(f.detected ?? { services: [], towns: [] });
      })
      .catch((e) => { if (!cancelled) setError(edgeErrorMessage(e, 'Could not load the onboarding answers')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, leadId]);

  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) => setA((prev) => (prev ? { ...prev, [k]: v } : prev));
  const siteAccess = a ? siteAccessFromBranch(a.agency_manages, a.can_get_access, a.self_site) : null;
  const chips = useMemo(() => chipsForTrade(tradeWord(a?.trade ?? '')).services, [a?.trade]);
  const problems = a ? answerProblems(a) : [];
  const problemFor = (f: keyof OnboardingAnswers) => problems.find((p) => p.field === f)?.message;
  const status = onboardingStatus(row);

  const addService = (raw: string) => {
    if (!a) return;
    const v = raw.trim();
    if (!v || a.services.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set('services', [...a.services, v]);
  };
  const toggleService = (chip: string) => {
    if (!a) return;
    const i = a.services.findIndex((x) => x.toLowerCase() === chip.toLowerCase());
    set('services', i >= 0 ? a.services.filter((_, j) => j !== i) : [...a.services, chip]);
  };
  const addArea = (raw: string) => {
    if (!a) return;
    const v = raw.trim();
    if (!v || v.toLowerCase() === a.confirmed_location.trim().toLowerCase() || a.areas.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set('areas', [...a.areas, v]);
  };

  const save = async () => {
    if (!a || problems.length) return;
    setSaving(true); setError(null);
    try {
      /* Hidden answers are not sent: the branch that is not showing is cleared before it leaves. */
      const answers: OnboardingAnswers = {
        ...a,
        can_get_access: a.agency_manages === 'yes' ? a.can_get_access : null,
        self_site: a.agency_manages === 'no' ? a.self_site : null,
        website_manager_email: a.agency_manages === 'yes' && a.can_get_access === 'yes' ? a.website_manager_email : '',
      };
      await call({ action: 'save_onboarding', lead_id: leadId, answers });
      toast({ title: 'Onboarding saved', description: 'Saved to the client’s onboarding record, marked as entered by you.' });
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(edgeErrorMessage(e, 'Could not save the onboarding answers'));
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>{row ? 'Edit onboarding answers' : 'Complete onboarding manually'}</DialogTitle></DialogHeader>
      {loading && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {a && !loading && <div className="space-y-4 text-sm">
        <p className="rounded-md bg-muted p-2 text-xs">You are answering the client’s onboarding questions on their behalf. These are the same questions, saved to the same record; it is marked as entered by you, never as submitted by the client. Current state: <b>{status.label}</b>. Blank answers are prefilled from the client record where it has one — check each before saving. Nothing is sent to the client and no baseline starts.</p>
        {row && String(row.status ?? '') !== 'paid' && <p className="text-xs text-amber-700 dark:text-amber-300">The client started onboarding themselves (status “{String(row.status)}”) but it was never marked paid. Saving adopts that record and marks it paid — no second record is created.</p>}

        <Panel headline={C.you.headline} sub={C.you.sub}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{C.contactName.label}</Label><Input value={a.contact_name} placeholder={C.contactName.label} onChange={(e) => set('contact_name', e.target.value)} /></div>
            <div><Label>{C.contactEmail.label}</Label><Input type="email" value={a.contact_email} onChange={(e) => set('contact_email', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.contactEmail.helper}</p>{problemFor('contact_email') && <p className="text-xs text-destructive">{problemFor('contact_email')}</p>}</div>
            <div><Label>{C.phone.label}</Label><Input type="tel" value={a.confirmed_phone} placeholder={C.phone.placeholder} onChange={(e) => set('confirmed_phone', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.phone.helper}</p>{problemFor('confirmed_phone') && <p className="text-xs text-destructive">{problemFor('confirmed_phone')}</p>}</div>
            <div><Label>{C.website.label} <span className="font-normal text-muted-foreground">{C.website.optional}</span></Label><Input value={a.business_website} placeholder={C.website.placeholder} onChange={(e) => set('business_website', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.website.helper}</p>{problemFor('business_website') && <p className="text-xs text-destructive">{problemFor('business_website')}</p>}</div>
          </div>
        </Panel>

        <Panel headline={C.business.headline} sub={C.business.sub}>
          <div><Label>{C.businessName.label}</Label><Input value={a.business_name} placeholder={C.businessName.placeholder} onChange={(e) => set('business_name', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.businessName.helper}</p></div>
        </Panel>

        <Panel headline={C.tradeTown.headline} sub={C.tradeTown.sub}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>{C.trade.label}</Label><Input value={a.trade} placeholder={C.trade.placeholder} onChange={(e) => set('trade', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.trade.helper}</p></div>
            <div><Label>{C.town.label}</Label><Input value={a.confirmed_location} placeholder={C.town.placeholder} onChange={(e) => set('confirmed_location', e.target.value)} /></div>
          </div>
        </Panel>

        <Panel headline={C.websiteStep.headline} sub={C.websiteStep.sub}>
          <div><p className="mb-1 font-medium">{C.domain.question}</p><Radio name="domain" value={a.domain_status} options={DOMAIN_OPTIONS} onChange={(v) => set('domain_status', v)} />
            {a.domain_status === 'new' && <p className="mt-2 text-xs text-muted-foreground">{C.domain.newNote}</p>}</div>
          <div><p className="mb-1 font-medium">{C.agency.question}</p><Radio name="agency" value={a.agency_manages} options={AGENCY_OPTIONS} onChange={(v) => setA((p) => p ? { ...p, agency_manages: v, can_get_access: null, self_site: null } : p)} /></div>
          {a.agency_manages === 'yes' && <div><p className="mb-1 font-medium">{C.access.question}</p><p className="mb-1 text-xs text-muted-foreground">{C.access.helper}</p><Radio name="access" value={a.can_get_access} options={ACCESS_OPTIONS} onChange={(v) => set('can_get_access', v)} />
            {a.can_get_access === 'yes' && <div className="mt-2"><Label>{C.managerEmail.label} <span className="font-normal text-muted-foreground">{C.managerEmail.optional}</span></Label><Input value={a.website_manager_email} placeholder={C.managerEmail.placeholder} onChange={(e) => set('website_manager_email', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.managerEmail.helper}</p>{problemFor('website_manager_email') && <p className="text-xs text-destructive">{problemFor('website_manager_email')}</p>}</div>}
          </div>}
          {a.agency_manages === 'no' && <div><p className="mb-1 font-medium">{C.selfSite.question}</p><Radio name="self" value={a.self_site} options={SELF_SITE_OPTIONS} onChange={(v) => set('self_site', v)} /></div>}
          {siteAccess && <p className="text-xs text-muted-foreground">{accessConsequenceText(siteAccess)}</p>}
        </Panel>

        <Panel headline={C.permission.headline} sub={C.permission.sub}>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={a.gbp_consent === 'yes_all'} onChange={(e) => set('gbp_consent', e.target.checked ? 'yes_all' : null)} /><span>{permissionAckText(siteAccess)}</span></label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={a.gbp_consent === 'discuss'} onChange={(e) => set('gbp_consent', e.target.checked ? 'discuss' : null)} /><span>{C.permission.discuss}</span></label>
          <p className="text-xs text-muted-foreground">Tick only what the client has actually agreed to.</p>
        </Panel>

        <Panel headline={C.q2.headline} sub={C.q2.sub}>
          <div className="space-y-2">
            <Label>{C.services.label}</Label>
            {chips.length > 0
              ? <><p className="text-xs text-muted-foreground">{C.services.chipsHint}</p><div className="flex flex-wrap gap-1.5">{chips.map((c) => {
                  const on = a.services.some((x) => x.toLowerCase() === c.toLowerCase());
                  return <button key={c} type="button" onClick={() => toggleService(c)} className={`rounded-full border px-2 py-0.5 text-xs ${on ? 'border-primary bg-primary/10 text-primary' : ''}`}>{c}</button>;
                })}</div></>
              : <p className="text-xs text-muted-foreground">{serviceExamplesFor(tradeWord(a.trade)) || C.services.noChips}</p>}
            <Pills items={a.services} onRemove={(i) => set('services', a.services.filter((_, j) => j !== i))} />
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addService(serviceInput); setServiceInput(''); }}>
              <Input value={serviceInput} placeholder={C.services.add} onChange={(e) => setServiceInput(e.target.value)} />
              <Button type="submit" variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </form>
            {detected.services.filter((d) => !a.services.some((x) => x.toLowerCase() === d.toLowerCase())).length > 0 && <div className="rounded-md border border-dashed p-2">
              <p className="text-xs text-muted-foreground">Detected on their current website — <b>not</b> added. Tap only the genuine services the client confirms:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{detected.services.filter((d) => !a.services.some((x) => x.toLowerCase() === d.toLowerCase())).map((d) =>
                <button key={d} type="button" onClick={() => addService(d)} className="rounded-full border border-dashed px-2 py-0.5 text-xs">+ {d}</button>)}</div>
            </div>}
          </div>
          <div className="space-y-2">
            <Label>{C.areas.label} <span className="font-normal text-muted-foreground">{C.areas.optional}</span></Label>
            <p className="text-xs text-muted-foreground">{a.confirmed_location ? `We've got your main town as ${a.confirmed_location}. ` : ''}{C.areas.helper}</p>
            <Pills items={a.areas} onRemove={(i) => set('areas', a.areas.filter((_, j) => j !== i))} />
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addArea(areaInput); setAreaInput(''); }}>
              <Input value={areaInput} placeholder={C.areas.placeholder} onChange={(e) => setAreaInput(e.target.value)} />
              <Button type="submit" variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </form>
            {detected.towns.filter((d) => !a.areas.some((x) => x.toLowerCase() === d.toLowerCase()) && d.toLowerCase() !== a.confirmed_location.toLowerCase()).length > 0 && <div className="rounded-md border border-dashed p-2">
              <p className="text-xs text-muted-foreground">Towns with pages on their current website — <b>not</b> added. A page existing is not proof they work there:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{detected.towns.filter((d) => !a.areas.some((x) => x.toLowerCase() === d.toLowerCase()) && d.toLowerCase() !== a.confirmed_location.toLowerCase()).map((d) =>
                <button key={d} type="button" onClick={() => addArea(d)} className="rounded-full border border-dashed px-2 py-0.5 text-xs">+ {d}</button>)}</div>
            </div>}
          </div>
        </Panel>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{a.confirmed_location.trim() && a.services.length ? 'Primary town and services are set — the baseline can be prepared.' : 'You can save a partial record and finish later. The baseline needs a primary town and at least one service.'}</p>
          <Button disabled={saving || problems.length > 0} onClick={() => void save()}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save onboarding answers</Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}
