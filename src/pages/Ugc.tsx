import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, EyeOff, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState, ErrorState, LoadState, PageHeader, Segmented, ToneChip } from '@/components/operator/ui';
import { UgcBrandTable } from '@/components/ugc/UgcBrandTable';
import { UgcBrandSheet } from '@/components/ugc/UgcBrandSheet';
import { UgcFindPanel } from '@/components/ugc/UgcFindPanel';
import { UgcPitchLogPanel, UgcPitchSystemPanel } from '@/components/ugc/UgcPitchSystemPanel';
import { UgcSettingsPanel } from '@/components/ugc/UgcSettingsPanel';
import { useUgcAccess, useUgcActions, useUgcBrands, useUgcPitchLog, useUgcPitchSystem, useUgcState } from '@/hooks/useUgc';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/lib/edgeInvoke';
import { brandView, sortByTier } from '@/lib/ugc/brandView';
import { pitchedKeySet } from '@/lib/ugc/pitchLog';
import { formatUsd } from '@/lib/ugc/config';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   UGC BRANDS (docs/ugc-brand-finder.md) — Jess finds brands, gets their contacts, and pitches them herself.
   SEPARATE FROM FINDABLE: its own tables, spend and login. Nothing on this page sends a message.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

type View = 'todo' | 'pitch_ready' | 'contacted' | 'needs_jess' | 'all';

export default function Ugc() {
  const access = useUgcAccess();
  const member = access.data?.member === true;
  const state = useUgcState();
  const brands = useUgcBrands();
  const system = useUgcPitchSystem(member);
  const log = useUgcPitchLog(member);
  const [view, setView] = useState<View>('todo');
  const [showHidden, setShowHidden] = useState(false);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const actions = useUgcActions();
  const { toast } = useToast();

  /* THE RESEARCH QUEUE (filled by a contacts run, capped server-side): while this page is open it researches the
     queued brands one at a time. Each one is its own costed run that the server checks against her budget; a
     refusal (budget, emergency stop) empties the queue server-side and stops here. */
  const queued = (brands.data ?? []).filter((b) => b.research_status === 'queued').length;
  const working = useRef(false);
  useEffect(() => {
    if (!queued || working.current) return;
    working.current = true;
    void actions.researchNext()
      .catch((e) => toast({ title: 'Research paused', description: edgeErrorMessage(e), variant: 'destructive' }))
      .finally(() => { working.current = false; });
  }, [queued, brands.dataUpdatedAt, actions, toast]);

  const ctx = useMemo(() => ({ blocked: system.data?.blocked_list ?? [], pitchedKeys: pitchedKeySet(log.data ?? []) }), [system.data, log.data]);
  const rows = useMemo(() => sortByTier((brands.data ?? []).map((b) => ({ brand: b, view: brandView(b, ctx) }))), [brands.data, ctx]);
  const split = (track: 'brand' | 'local') => rows.filter((r) => r.brand.track === track);
  const inView = (status: string, v: View) => v === 'all' || (v === 'todo' ? ['new', 'researching'].includes(status) : status === v);
  const visible = (r: (typeof rows)[number]) => (showHidden || !r.view.hidden) && (!q || `${r.brand.name} ${r.brand.domain ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const filter = (list: typeof rows) => list.filter((r) => visible(r) && inView(r.brand.status, view));
  const paid = split('brand');
  const local = split('local');
  const count = (list: typeof rows, v: View) => list.filter((r) => visible(r) && inView(r.brand.status, v)).length;
  const open = rows.find((r) => r.brand.id === openId) ?? null;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const listFor = (list: typeof rows, empty: string) => {
    if (brands.isLoading) return <LoadState label="Loading brands…" />;
    if (brands.isError) return <ErrorState title="Could not load brands." onRetry={() => void brands.refetch()} />;
    const shown = filter(list);
    if (!shown.length) return <EmptyState icon={Clapperboard} tone="purple" title={list.length ? 'Nothing in this view.' : empty} />;
    return <UgcBrandTable rows={shown} onOpen={setOpenId} selected={selected} onToggle={toggle} />;
  };
  const filters = (list: typeof rows) => (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<View> label="View" value={view} onChange={setView} options={[
        { key: 'todo', label: 'To research', count: count(list, 'todo') },
        { key: 'pitch_ready', label: 'Pitch ready', count: count(list, 'pitch_ready'), tone: 'purple' },
        { key: 'needs_jess', label: 'Needs Jess', count: count(list, 'needs_jess'), tone: 'amber' },
        { key: 'contacted', label: 'Contacted', count: count(list, 'contacted'), tone: 'blue' },
        { key: 'all', label: 'All', count: count(list, 'all') },
      ]} />
      <div className="relative"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 w-56 pl-8" placeholder="Search brands" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-xs"><Switch checked={showHidden} onCheckedChange={setShowHidden} /><EyeOff className="h-3.5 w-3.5" />Show hidden ({list.filter((r) => r.view.hidden).length})</label>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="ugc-page">
      <PageHeader icon={Clapperboard} tone="purple" title="UGC brands"
        subtitle="Find brands that pay for UGC, get the right contact, and pitch them yourself. Nothing is sent from here."
        actions={state.data && <div className="flex flex-wrap gap-1.5">
          <ToneChip tone="green">{formatUsd(state.data.spentThisMonthUsd)} of {formatUsd(state.data.budgetUsd)} this month</ToneChip>
          {queued > 0 && <ToneChip tone="blue" testId="ugc-research-queue">Researching: {queued} queued</ToneChip>}
          {state.data.apifyPct != null && state.data.apifyPct >= 0.8 && <ToneChip tone="amber">Searches paused: shared limit</ToneChip>}
        </div>} />

      <Tabs defaultValue="brands">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="brands">Brands ({paid.filter((r) => !r.view.hidden).length})</TabsTrigger>
          <TabsTrigger value="local">Local · Chiang Mai ({local.length})</TabsTrigger>
          <TabsTrigger value="find">Find</TabsTrigger>
          <TabsTrigger value="system">Pitch system</TabsTrigger>
          <TabsTrigger value="log">Pitch log</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="brands" className="mt-4 space-y-3">{filters(paid)}{listFor(paid, 'No brands yet — run a search on Find.')}</TabsContent>
        <TabsContent value="local" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Local collabs (CM collab DM v4): one business per category at a time, Instagram DM, wait 5 days, no follow-up. Kept apart from paid brand pitches.</p>
          {filters(local)}{listFor(local, 'No local businesses yet — run a Chiang Mai search on Find.')}
        </TabsContent>
        <TabsContent value="find" className="mt-4"><UgcFindPanel selectedIds={[...selected]} budget={state.data ?? null} /></TabsContent>
        <TabsContent value="system" className="mt-4"><UgcPitchSystemPanel ownerId={state.data?.owner ?? ''} isMember={member} /></TabsContent>
        <TabsContent value="log" className="mt-4"><UgcPitchLogPanel ownerId={state.data?.owner ?? ''} isMember={member} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><UgcSettingsPanel admin={access.data?.admin === true} /></TabsContent>
      </Tabs>

      <UgcBrandSheet brand={open?.brand ?? null} view={open?.view ?? null} system={system.data ?? null} senderEmail={access.data?.sender_email ?? null}
        canPitch={member || access.data?.admin === true} open={!!open} onOpenChange={(v) => { if (!v) setOpenId(null); }} />
    </div>
  );
}
