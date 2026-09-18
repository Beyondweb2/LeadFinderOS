import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Lock, Play, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';

export default function PaidBaselineSetup() {
  const { leadId = '' } = useParams<{ leadId: string }>();
  const { toast } = useToast();
  const [baseline, setBaseline] = useState<PaidBaseline | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const next = await invokePaidBaseline('get', leadId);
      setBaseline(next);
      setDraft(next.questions.join('\n'));
    } catch (e) {
      toast({ title: 'Could not load baseline', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [leadId, toast]);
  useEffect(() => { void load(); }, [load]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const next = await invokePaidBaseline(action, leadId, extra);
      setBaseline(next);
      setDraft(next.questions.join('\n'));
      toast({ title: action === 'run' ? 'Baseline queued' : 'Baseline updated' });
    } catch (e) {
      toast({ title: 'Could not update baseline', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally { setBusy(null); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!baseline) return <div className="mx-auto max-w-2xl py-12 text-center text-sm text-muted-foreground">No paid baseline found.</div>;

  const locked = ['approved', 'running', 'complete'].includes(baseline.status);
  const lines = draft.split(/\r?\n/).map((q) => q.trim()).filter(Boolean);
  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
      <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">← Dashboard</Link>
      <div>
        <h1 className="text-2xl font-semibold">{baseline.business_name}</h1>
        <p className="text-sm text-muted-foreground">Needs Baseline · {baseline.location || 'location not confirmed'}</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Client context</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Trade:</span> {baseline.business_type || '—'}</div>
          <div><span className="text-muted-foreground">Website:</span> {baseline.website || 'none recorded'}</div>
          <div><span className="text-muted-foreground">Services:</span> {baseline.services_list?.join(', ') || baseline.services || '—'}</div>
          <div><span className="text-muted-foreground">Areas:</span> {baseline.areas_list?.join(', ') || baseline.location || '—'}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Baseline questions <span className="text-xs font-normal text-muted-foreground">({lines.length})</span></span>
            {locked && <span className="flex items-center gap-1 text-xs font-normal text-emerald-500"><Lock className="h-3.5 w-3.5" /> Locked for week 4</span>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">These exact questions are measured now and replayed at week 4. Review them before approving.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} disabled={locked} rows={14} placeholder="One customer question per line" />
          <div className="flex flex-wrap gap-2">
            {!locked && <Button variant="outline" onClick={() => void act('save', { questions: lines })} disabled={!!busy || lines.length === 0}><Save className="mr-2 h-4 w-4" /> Save edits</Button>}
            {!locked && <Button variant="outline" onClick={() => void act('generate', { force: true })} disabled={!!busy}><RefreshCw className="mr-2 h-4 w-4" /> Regenerate draft</Button>}
            {baseline.status === 'needs_questions' && <Button onClick={() => void act('generate')} disabled={!!busy}><RefreshCw className="mr-2 h-4 w-4" /> Generate draft</Button>}
            {baseline.status === 'needs_approval' && <Button onClick={() => void act('approve', { questions: lines })} disabled={!!busy || lines.length === 0}>Approve questions</Button>}
            {baseline.status === 'approved' && <Button onClick={() => void act('run')} disabled={!!busy}><Play className="mr-2 h-4 w-4" /> Run Baseline Audit</Button>}
          </div>
          <p className="text-xs text-muted-foreground">Status: <span className="font-medium text-foreground">{baseline.status.replace('_', ' ')}</span>{baseline.approved_at ? ` · approved ${new Date(baseline.approved_at).toLocaleString('en-GB')}` : ''}</p>
        </CardContent>
      </Card>
    </div>
  );
}
