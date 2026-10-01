import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, BarChart3, CalendarClock, ClipboardList, Clock, Keyboard, Map as MapIcon, Megaphone, MessageCircle, Search, Target, Wallet,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useRecentLeads } from '@/hooks/useRecentLeads';
import { canOpenRoute } from '@/lib/access';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { GO_SHORTCUTS, goTarget, isPaletteKey, isTypingTarget } from '@/lib/shortcuts';
import { outreachLeadLink, whatsAppLinkForLead } from '@/lib/salesLinks';
import { writeCampaignFilter } from '@/lib/outreachPrefs';
import { cn } from '@/lib/utils';

/* ══ THE COMMAND PALETTE — Ctrl/Cmd + K (Sales Experience release 4, 2026-09-28) ═════════════════════
   Search a lead, jump to a recent lead, open WhatsApp / Outreach / Find Leads / Sales / follow-ups, or
   a campaign's leads (Focus Mode and its saved views retired 2026-10-01: the lists live on Sales). Also owns the safe "g then x" shortcuts and "?" help.
   ⛔ Opening things only — nothing here sends, saves or changes a lead. Routes a role cannot open are
   never offered (canOpenRoute). Lead search reads under the person's own permissions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
type Item = { id: string; group: string; label: string; hint?: string; icon: typeof Search; run: () => void; alt?: { label: string; run: () => void }[] };
const GO_ICON: Record<string, typeof Search> = { '/sales-dashboard': BarChart3, '/inbox': MessageCircle, '/outreach': ClipboardList, '/find-leads': Search, '/coverage': MapIcon };
export const OPEN_PALETTE_EVENT = 'open-command-palette';

export function CommandPalette() {
  const navigate = useNavigate();
  const { role } = useSubscription();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const recent = useRecentLeads(open);
  const term = q.trim();
  const search = useQuery({
    queryKey: ['palette-search', role, term],
    enabled: open && term.length >= 2 && !!role,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.from(leadSourceFor(role).table).select('id, business_name, search_location, derived_town')
        .ilike('business_name', `%${term.replace(/[%_,()]/g, ' ')}%`).eq('is_archived', false).order('business_name').limit(8);
      if (error) throw error;
      return (data ?? []) as { id: string; business_name: string | null; search_location: string | null; derived_town: string | null }[];
    },
  });
  const campaigns = useQuery({
    queryKey: ['palette-campaigns'],
    enabled: open && !!role,
    staleTime: 5 * 60_000,
    queryFn: async () => ((await sb.from('campaigns').select('id, name').order('name')).data ?? []) as { id: string; name: string }[],
  });

  // Global keys: Ctrl/Cmd+K anywhere; "g x" and "?" only when not typing.
  const last = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteKey(e)) { e.preventDefault(); setOpen((v) => !v); return; }
      if (open || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp(true); return; }
      const to = goTarget(last.current.key, last.current.at, e.key, Date.now());
      if (to && canOpenRoute(role, to)) { e.preventDefault(); navigate(to); last.current = { key: null, at: 0 }; return; }
      last.current = { key: e.key.toLowerCase(), at: Date.now() };
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_PALETTE_EVENT, onOpen); };
  }, [open, role, navigate]);
  useEffect(() => { if (!open) { setQ(''); setSel(0); } }, [open]);

  const close = (fn: () => void) => () => { setOpen(false); fn(); };
  const items = useMemo<Item[]>(() => {
    const t = term.toLowerCase();
    const match = (s: string) => !t || s.toLowerCase().includes(t);
    const out: Item[] = [];
    const leadItem = (id: string, name: string, hint: string | undefined, group: string): Item => ({
      id: `${group}:${id}`, group, label: name, hint, icon: group === 'Recent leads' ? Clock : Search,
      run: close(() => navigate(outreachLeadLink(id))),
      alt: [
        { label: 'WhatsApp', run: close(() => navigate(whatsAppLinkForLead(id))) },
      ],
    });
    if (term.length >= 2) for (const l of search.data ?? []) out.push(leadItem(l.id, l.business_name ?? 'Unnamed business', l.derived_town || l.search_location || undefined, 'Leads'));
    if (!term) for (const r of recent.data ?? []) out.push(leadItem(r.id, r.name, undefined, 'Recent leads'));
    for (const g of GO_SHORTCUTS) if (canOpenRoute(role, g.to) && match(g.label)) out.push({ id: `go:${g.to}`, group: 'Go to', label: g.label, hint: g.keys, icon: GO_ICON[g.to] ?? ArrowRight, run: close(() => navigate(g.to)) });
    if (canOpenRoute(role, '/sales-dashboard') && match('Follow-ups due')) out.push({ id: 'go:follow-ups', group: 'Go to', label: 'Follow-ups', hint: 'Sales', icon: CalendarClock, run: close(() => { navigate('/sales-dashboard'); window.setTimeout(() => document.getElementById('follow-ups')?.scrollIntoView({ behavior: 'smooth' }), 900); }) });
    if (match('Send feedback') || match('bug') || match('suggest')) out.push({ id: 'act:feedback', group: 'Help', label: 'Send feedback', icon: ArrowRight, run: close(() => window.dispatchEvent(new Event('open-feedback'))) });
    if (match("What's new")) out.push({ id: 'act:news', group: 'Help', label: "What's new", icon: ArrowRight, run: close(() => window.dispatchEvent(new Event('open-whats-new'))) });
    for (const c of campaigns.data ?? []) if (t && match(c.name)) out.push({ id: `camp:${c.id}`, group: 'Campaigns', label: c.name, hint: 'open in Outreach', icon: Megaphone, run: close(() => { writeCampaignFilter(user?.id, c.id); navigate('/outreach'); }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, search.data, recent.data, campaigns.data, role, user?.id]);
  useEffect(() => { setSel(0); }, [term]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
  };
  let lastGroup = '';

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
          <DialogHeader className="sr-only"><DialogTitle>Search and jump</DialogTitle><DialogDescription>Search a lead or jump to a page.</DialogDescription></DialogHeader>
          <div className="flex items-center gap-2 border-b border-border/60 px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} placeholder="Search leads and pages…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" aria-label="Search leads, pages and views" role="combobox" aria-expanded="true" aria-controls="palette-list" />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
            {term.length >= 2 && search.isFetching && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
            {items.length === 0 && !search.isFetching && <li className="px-3 py-6 text-center text-xs text-muted-foreground">{term.length === 1 ? 'Keep typing…' : 'Nothing matches.'}</li>}
            {items.map((it, i) => {
              const head = it.group !== lastGroup ? (lastGroup = it.group, <li key={`h:${it.group}`} className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{it.group}</li>) : null;
              return [head, (
                <li key={it.id} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)}
                  className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2', i === sel ? 'bg-muted' : '')}>
                  <button type="button" onClick={it.run} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <it.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{it.label}</span>
                    {it.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{it.hint}</span>}
                  </button>
                  {it.alt?.map((a) => <button key={a.label} type="button" onClick={a.run} className="shrink-0 rounded-md border border-border/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground">{a.label}</button>)}
                </li>
              )];
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ to move · Enter to open</span>
            <button type="button" onClick={() => { setOpen(false); setHelp(true); }} className="flex items-center gap-1 hover:text-foreground"><Keyboard className="h-3.5 w-3.5" />Shortcuts</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle><DialogDescription>They only open things — none of them sends or changes anything.</DialogDescription></DialogHeader>
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between"><span>Search and jump</span><kbd className="rounded border px-1.5 text-xs">Ctrl / ⌘ K</kbd></li>
            {GO_SHORTCUTS.filter((g) => canOpenRoute(role, g.to)).map((g) => <li key={g.to} className="flex justify-between"><span>{g.label}</span><kbd className="rounded border px-1.5 text-xs">{g.keys}</kbd></li>)}
            <li className="flex justify-between"><span>Lead popup: next / previous lead</span><kbd className="rounded border px-1.5 text-xs">→ ←</kbd></li>
            <li className="flex justify-between"><span>This list</span><kbd className="rounded border px-1.5 text-xs">?</kbd></li>
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A button that opens the palette (the phone top bar, the sidebar). */
export function PaletteButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-label="Search leads and pages (Ctrl K)"
      className={cn('inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground', compact ? 'h-10 w-10 justify-center' : 'h-9 w-full border border-border/60 px-2.5', className)}>
      <Search className="h-4 w-4" />{!compact && <><span className="flex-1 text-left">Search…</span><kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd></>}
    </button>
  );
}
