import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck2, Inbox as InboxIcon, Loader2, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FEEDBACK_STATUSES, feedbackKindLabel, feedbackStatusLabel } from '@/lib/feedback';
import { Empty, Panel, ago } from '@/components/salesDash/ui';
import { cn } from '@/lib/utils';

/* ══ THE ADMIN FEEDBACK INBOX (Sales Experience release 5, 2026-09-28) — admin only (not in
   SALES_ROUTE_PATTERNS; RLS lets the admin read every row). Two tabs:
   · Feedback — New / Reviewing / Planned / Fixed / Won't do (set_feedback_status). Planned, Fixed and
     Won't do tell the author ("Your suggestion was added" when a feature is fixed).
   · Template requests — Approve / Reject (set_template_request_status) tells the requester.
   ⛔ Approving here RECORDS a decision; registering the template with Meta is still done by hand. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
interface Fb { id: string; created_at: string; author_name: string | null; author_role: string | null; kind: string; message: string; context: Record<string, string>; status: string; admin_note: string | null; email_status: string }
interface Tr { id: string; created_at: string; requester_name: string | null; proposed_name: string | null; message_text: string; use_case: string; why_not_existing: string; status: string; decision_note: string | null }

export default function AdminFeedback() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('open');
  const fb = useQuery({ queryKey: ['admin-feedback'], queryFn: async () => ((await sb.from('feedback_items').select('*').order('created_at', { ascending: false }).limit(500)).data ?? []) as Fb[] });
  const tr = useQuery({ queryKey: ['admin-template-requests'], queryFn: async () => ((await sb.from('template_requests').select('id, created_at, requester_name, proposed_name, message_text, use_case, why_not_existing, status, decision_note').order('created_at', { ascending: false }).limit(200)).data ?? []) as Tr[] });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const rows = (fb.data ?? []).filter((r) => filter === 'all' || (filter === 'open' ? !['fixed', 'wont_do'].includes(r.status) : r.status === filter));

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    const { error } = await sb.rpc('set_feedback_status', { _id: id, _status: status, _note: notes[id] ?? null });
    setBusy(null);
    if (error) { toast({ title: 'Not saved', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Marked ${feedbackStatusLabel(status)}`, description: ['planned', 'fixed', 'wont_do'].includes(status) ? 'The author has been told.' : undefined });
    void qc.invalidateQueries({ queryKey: ['admin-feedback'] });
  };
  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    const { error } = await sb.rpc('set_template_request_status', { _id: id, _status: status, _note: notes[id] ?? null });
    setBusy(null);
    if (error) { toast({ title: 'Not saved', description: error.message, variant: 'destructive' }); return; }
    toast({ title: status === 'approved' ? 'Approved — the requester has been told' : 'Rejected — the requester has been told' });
    void qc.invalidateQueries({ queryKey: ['admin-template-requests'] });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><InboxIcon className="h-6 w-6 text-violet-500" />Feedback inbox</h1>
        <p className="text-sm text-muted-foreground">What the team has asked for, reported or found confusing — and the template requests.</p>
      </header>
      <Tabs defaultValue="feedback">
        <TabsList><TabsTrigger value="feedback">Feedback{fb.data ? ` (${(fb.data ?? []).filter((r) => r.status === 'new').length} new)` : ''}</TabsTrigger><TabsTrigger value="templates">Template requests{tr.data ? ` (${(tr.data ?? []).filter((r) => r.status === 'submitted').length})` : ''}</TabsTrigger></TabsList>
        <TabsContent value="feedback" className="space-y-3">
          <div className="flex justify-end">
            <Select value={filter} onValueChange={setFilter}><SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">Open (not fixed / won't do)</SelectItem><SelectItem value="all">All</SelectItem>{FEEDBACK_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select>
          </div>
          {fb.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : rows.length === 0 ? <Empty icon={MessageSquarePlus}>No feedback here.</Empty> : rows.map((r) => (
            <Panel key={r.id} title={`${feedbackKindLabel(r.kind)} · ${r.author_name ?? r.author_role ?? 'Someone'}`} tone="purple" hint={`${ago(r.created_at)}${r.context?.path ? ` · on ${r.context.path}` : ''}${r.email_status !== 'sent' ? ` · email ${r.email_status}` : ''}`}
              action={<span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.status === 'new' ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : r.status === 'fixed' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>{feedbackStatusLabel(r.status)}</span>}>
              <p className="whitespace-pre-wrap text-sm">{r.message}</p>
              {r.context && Object.keys(r.context).length > 0 && <p className="mt-2 break-words text-[11px] text-muted-foreground">{Object.entries(r.context).filter(([k]) => k !== 'userAgent').map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input value={notes[r.id] ?? r.admin_note ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="A note for them (optional)" className="h-9 min-w-[200px] flex-1 text-sm" />
                {FEEDBACK_STATUSES.filter((s) => s.value !== r.status).map((s) => <Button key={s.value} size="sm" variant="outline" className="h-9 text-xs" disabled={busy === r.id} onClick={() => void setStatus(r.id, s.value)}>{s.label}</Button>)}
              </div>
            </Panel>
          ))}
        </TabsContent>
        <TabsContent value="templates" className="space-y-3">
          {tr.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (tr.data ?? []).length === 0 ? <Empty icon={FileCheck2}>No template requests.</Empty> : (tr.data ?? []).map((r) => (
            <Panel key={r.id} title={r.proposed_name || 'Template request'} tone="grey" hint={`${r.requester_name ?? 'Someone'} · ${ago(r.created_at)}`}
              action={<span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : r.status === 'rejected' ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300')}>{r.status === 'submitted' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Rejected'}</span>}>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{r.message_text}</p>
              <p className="mt-2 text-xs text-muted-foreground"><b>For:</b> {r.use_case} · <b>Why not an existing one:</b> {r.why_not_existing}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input value={notes[r.id] ?? r.decision_note ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="A note for them (optional)" className="h-9 min-w-[200px] flex-1 text-sm" />
                <Button size="sm" className="h-9 text-xs" disabled={busy === r.id || r.status === 'approved'} onClick={() => void decide(r.id, 'approved')}>Approve</Button>
                <Button size="sm" variant="outline" className="h-9 text-xs" disabled={busy === r.id || r.status === 'rejected'} onClick={() => void decide(r.id, 'rejected')}>Reject</Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Approving records your decision and tells them. Registering the template with Meta is still done in WhatsApp Manager.</p>
            </Panel>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
