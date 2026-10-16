import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, ClipboardList, Info, Loader2, Plus, Save, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ActionBar, Callout, DialogHero, LoadState, SubSection } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { EdgeFunctionError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { tradeWord } from '@/lib/trade';
import { chipsForTrade, serviceExamplesFor } from '@/lib/onboardingChips';
import { AGENCY_CONTRACT_NOTE, DOMAIN_QUESTIONS, DOMAIN_REASON_TEXT, NEW_DOMAIN_REGISTRATION_NOTE, SITE_RIGHTS_OPTIONS, domainAuthority } from '@/lib/domainAuthority';
import {
  AGENCY_OPTIONS, BUILD_OK_OPTIONS, CONTRACT_OPTIONS, DESIGN_OPTIONS, KEEP_ACCESS_OPTIONS, LEGACY_KEEP_COPY as L, MANAGER_OPTIONS, ONBOARDING_COPY as C, SIMPLE_COPY as S, WEBSITE_CHOICE_OPTIONS,
  accessConsequenceText, answerProblems, answersFromRecords, branchFromChoice, choiceFromBranch, domainAnswerOf, domainColumnsFor, domainOptionsFor, onboardingStatus, permissionAckText, siteAccessFromBranch,
  type BuildOk, type HasAgency, type OnboardingAnswers, type SiteManager, type WebsiteChoice,
} from '@/lib/manualOnboarding';
import { agencyContractOutcome } from '@/lib/agencyContractRule';
import { QC_REVIEW_TEXT, TIED_IN_DECLINE_REASON } from '@/lib/quickClose';

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

/* 2026-10-06 design consistency: each question group is a SubSection (marker + heading, no box of its
   own), not a stack of identical grey bordered boxes. */
function Panel({ headline, sub, children }: { headline: string; sub: string; children: ReactNode }) {
  return <SubSection title={headline} tone="blue" className="border-t border-border/60 pt-4">
    <div className="space-y-3">
      <p className="-mt-1 text-xs text-muted-foreground">{sub}</p>
      {children}
    </div>
  </SubSection>;
}

function Radio<T extends string>({ name, value, options, onChange }: { name: string; value: T | null; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return <div className="space-y-1.5">{options.map((o) =>
    <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${value === o.value ? 'border-primary bg-primary/5' : ''}`}>
      <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} aria-label={o.label} />
      <span>{o.label}</span>
    </label>)}</div>;
}

/** One row of "Is this right?": a value we already hold is shown as text (Fix opens it); a gap is a field. */
function Known({ label, held, value, fixing, children }: { label: string; held: boolean; value: string; fixing: boolean; children: ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">{label}</dt>
    <dd className="mt-0.5">{held && !fixing ? <span className="font-medium">{value}</span> : children}</dd></div>;
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
  /* The website question is CHOICE-FIRST, as on the customer page (2026-10-07). The choice and the keep-access
     answer are the form's own state; the stored three (agency_manages / can_get_access / self_site) are
     written through branchFromChoice and read back with choiceFromBranch. */
  const [choiceState, setChoiceState] = useState<WebsiteChoice | null>(null);
  const [managerState, setManagerState] = useState<SiteManager | null>(null);
  const [keepAccess, setKeepAccess] = useState<'yes' | 'no' | null>(null);
  /* 2026-10-16: "Happy for us to build you an AI-optimised website?" — the form's own answer (no column; the client's
     page does not store it either). A Build sign-up already said yes by choosing it. */
  const [buildOk, setBuildOk] = useState<BuildOk | null>(null);
  /* What the record already held when the form opened: shown, not asked (Fix opens it). */
  const [loaded, setLoaded] = useState<OnboardingAnswers | null>(null);
  const [fixing, setFixing] = useState(false);
  const held = (k: 'business_name' | 'trade' | 'confirmed_location' | 'contact_name' | 'contact_email' | 'confirmed_phone' | 'business_website') => !!loaded?.[k]?.trim();
  const [areaInput, setAreaInput] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null);
    call({ action: 'onboarding_form', lead_id: leadId })
      .then((res) => {
        if (cancelled) return;
        const f = res.form as { lead: Record<string, unknown>; onboarding: Record<string, unknown> | null; detected: { services: string[]; towns: string[] } };
        const first = answersFromRecords(f.onboarding, f.lead);
        setRow(f.onboarding); setA(first); setLoaded(first); setFixing(false); setDetected(f.detected ?? { services: [], towns: [] });
        /* A fresh load reads the website choice back from the stored answers, never from the last client's form. */
        setChoiceState(null); setManagerState(null); setKeepAccess(null);
        setBuildOk(String(f.onboarding?.plan_tier ?? '') === 'new_site' ? 'yes' : null);
      })
      .catch((e) => { if (!cancelled) setError(edgeErrorMessage(e, 'Could not load the onboarding answers')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, leadId]);

  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) => setA((prev) => (prev ? { ...prev, [k]: v } : prev));
  const stored = a ? choiceFromBranch(a.agency_manages, a.can_get_access, a.self_site) : { choice: null, manager: null, keepAccess: null };
  const choice = choiceState ?? stored.choice;
  const manager = managerState ?? stored.manager;
  const keep = keepAccess ?? stored.keepAccess;
  const applyWebsite = (c: WebsiteChoice | null, m: SiteManager | null, k: 'yes' | 'no' | null) => {
    const b = branchFromChoice(c, m, k);
    setA((p) => (p ? { ...p, ...b, ...(c === 'keep' ? { domain_status: 'existing' as const } : {}) } : p));
  };
  const pickChoice = (c: WebsiteChoice) => { const m = c === 'none' ? null : manager; const k = c === 'keep' ? keep : null; setChoiceState(c); setManagerState(m); setKeepAccess(k); applyWebsite(c, m, k); };
  const pickManager = (m: SiteManager) => { setManagerState(m); applyWebsite(choice, m, keep); };
  const pickKeep = (k: 'yes' | 'no') => { setKeepAccess(k); applyWebsite(choice, manager, k); };
  const siteAccess = a ? siteAccessFromBranch(a.agency_manages, a.can_get_access, a.self_site) : null;
  /* 🔴 BUILD ONLY (2026-10-16): the simple questions. Optimise ("keep") is drawn only for a row already on it. */
  const legacyKeep = choice === 'keep';
  const noWebsite = choice === 'none';
  const hasAgency: HasAgency | null = noWebsite ? null : manager === 'agency' ? 'yes' : manager === 'self' ? 'no' : null;
  const pickNoWebsite = (on: boolean) => (on ? pickChoice('none') : (() => { setChoiceState('build'); setManagerState(null); setKeepAccess(null); applyWebsite('build', null, null); })());
  const pickAgency = (v: HasAgency) => { const m: SiteManager = v === 'yes' ? 'agency' : 'self'; setChoiceState('build'); setManagerState(m); setKeepAccess(null); applyWebsite('build', m, null); };
  const contract = a ? (legacyKeep ? 'go' : agencyContractOutcome(noWebsite ? false : hasAgency === null ? null : hasAgency === 'yes', a.agency_contract)) : 'unanswered';
  const domainAnswer = a ? domainAnswerOf(a) : null;
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
      try {
        await call({ action: 'save_onboarding', lead_id: leadId, answers });
      } catch (e) {
        /* ⛔ A SAVE THAT WOULD TAKE AWAY WHAT THE CLIENT CONFIRMED (pre-sales fix 03, M-020) is refused by the
           server until Paul says, explicitly, that the client withdrew it. Never silently. */
        if (!(e instanceof EdgeFunctionError) || e.code !== 'would_clear_consents') throw e;
        if (!window.confirm(`${e.detail}\n\nOnly press OK if the client has told you this. Otherwise press Cancel and leave the website answers as they were.`)) return;
        await call({ action: 'save_onboarding', lead_id: leadId, answers, confirm_clear_consents: true });
      }
      toast({ title: 'Onboarding saved', description: 'Saved to the client’s onboarding record, marked as entered by you.' });
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(edgeErrorMessage(e, 'Could not save the onboarding answers'));
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
      <DialogHero icon={ClipboardList} tone="blue" title={row ? 'Edit onboarding answers' : 'Complete onboarding manually'} />
      {loading && <LoadState />}
      {error && <Callout tone="red" icon={AlertCircle}>{error}</Callout>}
      {a && !loading && <div className="space-y-4 text-sm">
        <Callout tone="blue" icon={Info} className="text-xs">You are answering the client’s onboarding questions on their behalf. These are the same questions, saved to the same record; it is marked as entered by you, never as submitted by the client. Current state: <b>{status.label}</b>. Blank answers are prefilled from the client record where it has one — check each before saving. Nothing is sent to the client and no baseline starts.</Callout>
        {row && String(row.status ?? '') !== 'paid' && <Callout tone="amber" className="text-xs">The client started onboarding themselves (status “{String(row.status)}”) but it was never marked paid. Saving adopts that record and marks it paid — no second record is created.</Callout>}

        {/* 2026-10-16: the customer page's first screen — what we already hold is SHOWN, not asked; a gap is a field;
            Fix opens everything (never ask for anything the lead already holds). */}
        <Panel headline={C.you.headline} sub={C.you.sub}>
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2" data-testid="manual-known">
            <Known label={C.businessName.label} held={held('business_name')} value={a.business_name} fixing={fixing}><Input aria-label={C.businessName.label} value={a.business_name} placeholder={C.businessName.placeholder} onChange={(e) => set('business_name', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{C.businessName.helper}</p></Known>
            <Known label={C.trade.label} held={held('trade')} value={a.trade} fixing={fixing}><Input aria-label={C.trade.label} value={a.trade} placeholder={C.trade.placeholder} onChange={(e) => set('trade', e.target.value)} /></Known>
            <Known label={C.town.label} held={held('confirmed_location')} value={a.confirmed_location} fixing={fixing}><Input aria-label={C.town.label} value={a.confirmed_location} onChange={(e) => set('confirmed_location', e.target.value)} /></Known>
            <Known label={C.contactName.label} held={held('contact_name')} value={a.contact_name} fixing={fixing}><Input aria-label={C.contactName.label} value={a.contact_name} placeholder={C.contactName.label} onChange={(e) => set('contact_name', e.target.value)} /></Known>
            <Known label={C.contactEmail.label} held={held('contact_email')} value={a.contact_email} fixing={fixing}><Input aria-label={C.contactEmail.label} type="email" value={a.contact_email} onChange={(e) => set('contact_email', e.target.value)} />{problemFor('contact_email') && <p className="text-xs text-destructive">{problemFor('contact_email')}</p>}</Known>
            <Known label={C.phone.label} held={held('confirmed_phone')} value={a.confirmed_phone} fixing={fixing}><Input aria-label={C.phone.label} type="tel" value={a.confirmed_phone} placeholder={C.phone.placeholder} onChange={(e) => set('confirmed_phone', e.target.value)} />{problemFor('confirmed_phone') && <p className="text-xs text-destructive">{problemFor('confirmed_phone')}</p>}</Known>
            <Known label={C.website.label} held={held('business_website') || choice === 'none'} value={choice === 'none' ? 'No website yet' : a.business_website} fixing={fixing}><Input aria-label={C.website.label} value={a.business_website} placeholder={C.website.placeholder} onChange={(e) => set('business_website', e.target.value)} />{problemFor('business_website') && <p className="text-xs text-destructive">{problemFor('business_website')}</p>}</Known>
          </dl>
          {!fixing && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setFixing(true)} data-testid="manual-fix">{C.fix.action}</Button>}
        </Panel>

        {!legacyKeep && <>
          <Panel headline={S.agency.headline} sub={S.agency.sub}>
            <label className="flex items-center gap-2" data-testid="manual-no-website"><input type="checkbox" checked={noWebsite} onChange={(e) => pickNoWebsite(e.target.checked)} /><span>{S.noWebsite}</span></label>
            {!noWebsite && <Radio name="has-agency" value={hasAgency} options={AGENCY_OPTIONS} onChange={pickAgency} />}
            {hasAgency === 'yes' && <div data-testid="manual-agency-contract"><p className="mb-1 font-medium">{S.contract.question}</p><Radio name="agency-contract" value={a.agency_contract} options={CONTRACT_OPTIONS} onChange={(v) => set('agency_contract', v)} /></div>}
            {contract === 'stop' && <Callout tone="red" icon={AlertCircle} testId="manual-tied-in" title={S.tiedIn.stop}>
              <p className="text-xs text-muted-foreground">{TIED_IN_DECLINE_REASON}</p>
              <label className="mt-2 block text-xs font-medium">{S.tiedIn.ends} <span className="font-normal text-muted-foreground">(optional)</span><Input type="date" className="mt-1 h-9 w-48" value={a.agency_contract_ends} onChange={(e) => set('agency_contract_ends', e.target.value)} /></label>
            </Callout>}
            {contract === 'hold' && <Callout tone="amber" icon={Info} testId="manual-contract-hold" className="text-xs">{QC_REVIEW_TEXT.agency_contract_build}.</Callout>}
          </Panel>
          {contract !== 'stop' && <Panel headline={S.buildOk.headline} sub={S.buildOk.sub}>
            <Radio name="build-ok" value={buildOk} options={BUILD_OK_OPTIONS} onChange={(v) => setBuildOk(v as BuildOk)} />
            {buildOk === 'no' && <Callout tone="red" icon={AlertCircle} testId="manual-build-declined" className="text-xs">Do not sell: building them a website set up properly for AI is how Findable works, so there is nothing else to offer. Note why, and leave the door open.</Callout>}
          </Panel>}
          {contract !== 'stop' && buildOk !== 'no' && !noWebsite && <Panel headline={S.design.headline} sub={S.design.sub}>
            <Radio name="design-choice" value={a.design_choice} options={DESIGN_OPTIONS} onChange={(v) => set('design_choice', v)} />
          </Panel>}
          {contract !== 'stop' && buildOk !== 'no' && choice && <Panel headline={S.domain.headline} sub={S.domain.sub}>
            <Radio name="domain-answer" value={domainAnswer} options={domainOptionsFor(!noWebsite)} onChange={(v) => setA((p) => (p ? { ...p, ...domainColumnsFor(v, !noWebsite) } : p))} />
            {domainAnswer === 'none' && <p className="text-xs text-muted-foreground">{NEW_DOMAIN_REGISTRATION_NOTE}</p>}
            {domainAnswer && domainAnswer !== 'yes' && domainAnswer !== 'none' && <p className="text-xs text-amber-700 dark:text-amber-300">The domain is not ready to connect — sort this out with the client before launch (the site can still be built and previewed).</p>}
          </Panel>}
        </>}

        {legacyKeep && <Panel headline={L.websiteStep.headline} sub={L.websiteStep.sub}>
          <Callout tone="grey" icon={Info} className="text-xs" testId="manual-legacy-optimise">This client is on Findable Optimise (sold before 16 October 2026). Their website answers keep the questions they were sold with. Optimise is no longer offered to new clients.</Callout>
          <div><Radio name="website-choice" value={choice} options={WEBSITE_CHOICE_OPTIONS} onChange={pickChoice} />
            {choice && <p className="mt-1 text-xs text-muted-foreground">{WEBSITE_CHOICE_OPTIONS.find((o) => o.value === choice)?.note}</p>}</div>
          {choice === 'keep' && <>
            <div><p className="mb-1 font-medium">{L.keepManager.question}</p><Radio name="keep-manager" value={manager} options={MANAGER_OPTIONS} onChange={pickManager} /></div>
            {manager && <div><p className="mb-1 font-medium">{manager === 'agency' ? L.access.question : L.selfSite.question}</p><p className="mb-1 text-xs text-muted-foreground">{L.access.helper}</p><Radio name="access" value={keep} options={KEEP_ACCESS_OPTIONS} onChange={pickKeep} />
              {manager === 'agency' && keep === 'yes' && <div className="mt-2"><Label>{L.managerEmail.label} <span className="font-normal text-muted-foreground">{L.managerEmail.optional}</span></Label><Input aria-label={L.managerEmail.label} value={a.website_manager_email} placeholder={L.managerEmail.placeholder} onChange={(e) => set('website_manager_email', e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{L.managerEmail.helper}</p>{problemFor('website_manager_email') && <p className="text-xs text-destructive">{problemFor('website_manager_email')}</p>}</div>}
              {keep === 'no' && <div className="mt-2 rounded-md border border-amber-500/40 p-2 text-xs"><p>{L.keepNoAccess.note}</p><button type="button" className="mt-1 font-semibold underline" onClick={() => pickChoice('build')}>{L.keepNoAccess.action}</button></div>}
            </div>}
          </>}
          {siteAccess && <p className="text-xs text-muted-foreground">{accessConsequenceText(siteAccess)}</p>}
        </Panel>}

        <Panel headline={S.legal.headline} sub={S.legal.sub}>
            {/* ⛔ THE DOMAIN RULE (2026-09-28): the confirmations the customer gives on the new-site path (the simple
                onboarding's one confirmations screen). Record only what the CLIENT confirmed — never tick one on their behalf. */}
            {!legacyKeep && contract !== 'stop' && buildOk !== 'no' && siteAccess && siteAccess !== 'yes_access' && (() => {
              const hasSite = siteAccess !== 'no_website';
              const v = domainAuthority({ newSite: true, hasCurrentSite: hasSite, domain_status: a.domain_status, domain_owned: a.domain_owned, domain_access: a.domain_access, domain_third_party: a.domain_third_party, authority_confirmed: a.authority_confirmed, dns_permission: a.dns_permission, materials_confirmed: a.materials_confirmed, site_rights: a.site_rights });
              return <div className="space-y-3" data-testid="manual-domain-section">
                {hasAgency === 'yes' && <p className="text-xs text-muted-foreground">{AGENCY_CONTRACT_NOTE}</p>}
                {hasSite && <div><p className="mb-1">{DOMAIN_QUESTIONS.siteRights}</p><Radio name="site-rights" value={a.site_rights} options={SITE_RIGHTS_OPTIONS} onChange={(x) => set('site_rights', x)} /></div>}
                {hasSite && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={a.authority_confirmed} onChange={(e) => set('authority_confirmed', e.target.checked)} /><span>{DOMAIN_QUESTIONS.authority}</span></label>}
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={a.dns_permission} onChange={(e) => set('dns_permission', e.target.checked)} /><span>{DOMAIN_QUESTIONS.dns}</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={a.materials_confirmed} onChange={(e) => set('materials_confirmed', e.target.checked)} /><span>{DOMAIN_QUESTIONS.materials}</span></label>
                <p className={`text-xs font-semibold ${v.ready ? 'text-teal-700 dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`}>{v.label}{v.reasons.length ? `: ${v.reasons.map((r) => DOMAIN_REASON_TEXT[r]).join(', ')}` : ''}</p>
                <p className="text-xs text-muted-foreground">Tick only what the client has actually confirmed.</p>
              </div>;
            })()}
          <label className="flex items-start gap-2"><input type="checkbox" aria-label={permissionAckText(siteAccess)} className="mt-1" checked={a.gbp_consent === 'yes_all'} onChange={(e) => set('gbp_consent', e.target.checked ? 'yes_all' : null)} /><span>{permissionAckText(siteAccess)}</span></label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" aria-label={C.permission.discuss} className="mt-0.5" checked={a.gbp_consent === 'discuss'} onChange={(e) => set('gbp_consent', e.target.checked ? 'discuss' : null)} /><span>{C.permission.discuss}</span></label>
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
              <Input aria-label={C.services.add} value={serviceInput} placeholder={C.services.add} onChange={(e) => setServiceInput(e.target.value)} />
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
              <Input aria-label={C.areas.label} value={areaInput} placeholder={C.areas.placeholder} onChange={(e) => setAreaInput(e.target.value)} />
              <Button type="submit" variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </form>
            {detected.towns.filter((d) => !a.areas.some((x) => x.toLowerCase() === d.toLowerCase()) && d.toLowerCase() !== a.confirmed_location.toLowerCase()).length > 0 && <div className="rounded-md border border-dashed p-2">
              <p className="text-xs text-muted-foreground">Towns with pages on their current website — <b>not</b> added. A page existing is not proof they work there:</p>
              <div className="mt-1 flex flex-wrap gap-1.5">{detected.towns.filter((d) => !a.areas.some((x) => x.toLowerCase() === d.toLowerCase()) && d.toLowerCase() !== a.confirmed_location.toLowerCase()).map((d) =>
                <button key={d} type="button" onClick={() => addArea(d)} className="rounded-full border border-dashed px-2 py-0.5 text-xs">+ {d}</button>)}</div>
            </div>}
          </div>
        </Panel>

        <ActionBar className="justify-between">
          <p className="min-w-0 flex-1 basis-60 text-xs text-muted-foreground">{a.confirmed_location.trim() && a.services.length ? 'Primary town and services are set — the baseline can be prepared.' : 'You can save a partial record and finish later. The baseline needs a primary town and at least one service.'}</p>
          <Button disabled={saving || problems.length > 0} onClick={() => void save()}>{saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Save onboarding answers</Button>
        </ActionBar>
      </div>}
    </DialogContent>
  </Dialog>;
}
