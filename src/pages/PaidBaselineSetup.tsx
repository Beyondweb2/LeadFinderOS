import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Play, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditQuestionEditor, cleanAuditQuestions } from '@/components/AuditQuestionEditor';
import { useToast } from '@/hooks/use-toast';
import { invokePaidBaseline, type PaidBaseline } from '@/lib/paidBaseline';
import { BASELINE_QUESTIONS } from '@/lib/auditQuestionCounts';
import { isFrozenBaselineStatus, paidBaselineStatusLabel } from '@/lib/paidBaselineState';
import { createSingleFlight, startApproved } from '@/lib/paidBaselineFlow';

export default function PaidBaselineSetup() {
  const { leadId = '' } = useParams<{ leadId: string }>();
  const { toast } = useToast();
  const flight = useRef(createSingleFlight());
  const [baseline, setBaseline] = useState<PaidBaseline | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const next = await invokePaidBaseline('get', leadId);
      setBaseline(next);
      setQuestions(next.questions);
    } catch (e) {
      toast({ title: 'Could not load baseline', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [leadId, toast]);
  useEffect(() => { void load(); }, [load]);

  const invoke = useCallback((action: string, extra: Record<string, unknown> = {}) => invokePaidBaseline(action, leadId, extra), [leadId]);
  const fail = (message: string) => { setError(message); toast({ title: 'Could not update baseline', description: message, variant: 'destructive' }); };

  /* One in-flight action at a time; a second click while busy does nothing. */
  const act = (action: string, extra: Record<string, unknown> = {}) => flight.current.run(async () => {
    setBusy(action); setError(null);
    try {
      const next = await invoke(action, extra);
      setBaseline(next);
      setQuestions(next.questions);
      toast({ title: paidBaselineStatusLabel(next.status) });
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Try again');
    } finally { setBusy(null); }
  });
  /* Start is the shared controller's job so a refusal arrives as the server's sentence, never as
     "approved but waiting". */
  const start = () => flight.current.run(async () => {
    setBusy('run'); setError(null);
    try {
      const result = await startApproved(invoke, baseline);
      if (result.baseline) { setBaseline(result.baseline as PaidBaseline); setQuestions(result.baseline.questions); }
      if (result.ok === false) { fail(result.error); return; }
      toast({ title: paidBaselineStatusLabel(result.baseline.status), description: 'It continues on the server.' });
    } finally { setBusy(null); }
  });

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!baseline) return <div className="mx-auto max-w-2xl py-12 text-center text-sm text-muted-foreground">No paid baseline found.</div>;

  const locked = isFrozenBaselineStatus(baseline.status);
  const lines = cleanAuditQuestions(questions);
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
            {locked && <span className="flex items-center gap-1 text-xs font-normal text-emerald-500"><Lock className="h-3.5 w-3.5" /> Frozen for the remeasure</span>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">These exact questions are measured now and replayed verbatim at the remeasure. Review them before approving.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
          <AuditQuestionEditor questions={questions} onChange={setQuestions} disabled={locked} busy={!!busy}/>
          <div className="flex flex-wrap gap-2">
            {!locked && <Button variant="outline" onClick={() => void act('save', { questions: lines })} disabled={!!busy || lines.length === 0}><Save className="mr-2 h-4 w-4" /> Save edits</Button>}
            {!locked && <Button variant="outline" onClick={() => void act('generate', { force: true })} disabled={!!busy}><RefreshCw className="mr-2 h-4 w-4" /> Regenerate draft</Button>}
            {baseline.status === 'needs_questions' && <Button onClick={() => void act('generate')} disabled={!!busy}><RefreshCw className="mr-2 h-4 w-4" /> Generate draft</Button>}
            {baseline.status === 'needs_approval' && <Button onClick={() => void act('approve', { questions: lines })} disabled={!!busy || lines.length !== BASELINE_QUESTIONS}>Approve questions</Button>}
            {baseline.status === 'approved' && <Button onClick={() => void start()} disabled={!!busy}>{busy === 'run' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Start baseline</Button>}
          </div>
          {!locked && lines.length !== BASELINE_QUESTIONS && <p className="text-xs text-muted-foreground">Approval needs exactly {BASELINE_QUESTIONS} questions (currently {lines.length}).</p>}
          <p className="text-xs text-muted-foreground">Status: <span className="font-medium text-foreground">{paidBaselineStatusLabel(baseline.status)}</span>{baseline.approved_at ? ` · approved ${new Date(baseline.approved_at).toLocaleString('en-GB')}` : ''}</p>
        </CardContent>
      </Card>
    </div>
  );
}
