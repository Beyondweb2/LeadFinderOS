import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Plus, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { remeasureStatus } from '@/lib/deliveryCockpit';
import { useAuth } from '@/hooks/useAuth';
import { EdgeAuthError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';

type Client = { id: string; business_name: string; address?: string | null; search_location?: string | null; derived_town?: string | null; website?: string | null; amount_paid?: number | null; payment_date?: string | null; next_action?: string | null; next_action_date?: string | null; baseline_audit_id?: string | null; remeasure_audit_id?: string | null; remeasure_due_date?: string | null; delivery_checklist?: Record<string, boolean> | null };
/* Every request goes through invokeEdge: a real session first, an explicit Authorization header,
   one refresh-and-retry on 401, and a genuine sign-out routed to /auth. Never the anon key. */
const call = <T = Record<string, unknown>>(body: Record<string, unknown>) => invokeEdge<T>('paid-client-hub', body);

function ManualClient({ done }: { done: (id: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [matches, setMatches] = useState<Array<{id:string;business_name:string;website?:string|null;search_location?:string|null}>>([]); const [form, setForm] = useState<Record<string, string>>({ amount_paid: '49.99', website_route: 'optimise_existing', domain_status: 'existing' });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const save = async () => { setBusy(true); setError(null); try { const r = await call<{ lead_id: string }>({ action: 'create_manual', ...form, services: form.services?.split(',') ?? [], service_areas: form.service_areas?.split(',') ?? [] }); done(r.lead_id); } catch (e) { setError(edgeErrorMessage(e, 'Could not save the client')); } finally { setBusy(false); } };
  const findMatches = async () => { if ((form.business_name ?? '').trim().length < 2) return; try { setMatches((await call<{ leads: typeof matches }>({ action: 'matches', query: form.business_name })).leads); } catch (e) { setError(edgeErrorMessage(e, 'Could not search leads')); } };
  return <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add paid client manually</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">This creates the same paid onboarding record used by checkout clients.</p><div className="grid gap-3 sm:grid-cols-2">
    {[['business_name','Business name'],['contact_name','Contact name'],['email','Email'],['phone','Phone / WhatsApp'],['website','Website'],['location','Primary location'],['services','Services (comma separated)'],['service_areas','Service areas (comma separated)'],['amount_paid','Amount paid'],['payment_date','Payment date (YYYY-MM-DD)'],['access_status','Website manager / access status']].map(([key,label]) => <div key={key} className={key === 'access_status' ? 'sm:col-span-2' : ''}><Label>{label}</Label><Input value={form[key] ?? ''} onChange={(e) => set(key,e.target.value)} /></div>)}
    <div><Label>Website route</Label><select className="w-full rounded-md border bg-background p-2 text-sm" value={form.website_route} onChange={(e) => set('website_route',e.target.value)}><option value="optimise_existing">Optimise existing site</option><option value="rebuild_existing">Rebuild existing site</option><option value="new_site">New site</option></select></div>
    <div><Label>Domain</Label><select className="w-full rounded-md border bg-background p-2 text-sm" value={form.domain_status} onChange={(e) => set('domain_status',e.target.value)}><option value="existing">Existing domain</option><option value="new">New domain</option></select></div>
  </div><div className="rounded-md border p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium">Already an outreach lead?</span><Button type="button" size="sm" variant="outline" onClick={() => void findMatches()}>Find matching business</Button></div>{matches.length > 0 && <div className="mt-2 space-y-1">{matches.map((m) => <button key={m.id} type="button" className="block w-full rounded border p-2 text-left hover:bg-muted" onClick={() => { set('lead_id',m.id); set('business_name',m.business_name); if (m.website) set('website',m.website); if (m.search_location) set('location',m.search_location); setMatches([]); }}><span className="font-medium">{m.business_name}</span><span className="ml-2 text-muted-foreground">{m.search_location || m.website || m.id}</span></button>)}</div>}{form.lead_id && <p className="mt-2 text-emerald-600">Matched existing outreach lead — no duplicate lead will be created.</p>}</div>{error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}<Button disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save client</Button></DialogContent>;
}

/* ⛔ A FAILED LOAD IS NEVER "No paid clients yet." The list has three states — loading, error,
   loaded — and the empty card belongs to the third only. The fetch waits for the auth session
   (ProtectedRoute already guarantees a user; this makes the dependency explicit), runs once per
   user, and a genuine sign-out is handled by invokeEdge + ProtectedRoute, not by this page. */
export default function PaidClients() {
  const { user, isLoading: authLoading } = useAuth();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true); setError(null);
    try { setClients((await call<{ clients: Client[] }>({ action: 'list' })).clients ?? []); }
    catch (e) {
      if (e instanceof EdgeAuthError && !e.transient) return; // the sign-in flow is taking over
      setClients(null);
      setError(edgeErrorMessage(e, 'Could not load paid clients'));
    } finally { setLoading(false); }
  }, [user?.id]);
  useEffect(() => { if (!authLoading && user?.id) void load(); }, [authLoading, user?.id, load]);
  const showSpinner = authLoading || loading;
  return <div className="mx-auto max-w-7xl space-y-5 py-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Paid Clients</h1><p className="text-sm text-muted-foreground">One fulfilment hub for every paying customer.</p></div><Dialog><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4"/>Add Client Manually</Button></DialogTrigger><ManualClient done={(id) => navigate(`/paid-clients/${id}`)} /></Dialog></div>
    {showSpinner && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>}
    {!showSpinner && error && <Card><CardContent className="space-y-3 p-6 text-sm"><div role="alert" className="flex items-start gap-2 text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>Could not load paid clients: {error}</span></div><Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-1 h-4 w-4"/>Try again</Button></CardContent></Card>}
    {!showSpinner && !error && clients && <div className="grid gap-3">{clients.map((c) => { const rm = remeasureStatus(c.remeasure_due_date, Date.now()); const done = Object.values(c.delivery_checklist ?? {}).filter(Boolean).length; return <Link key={c.id} to={`/paid-clients/${c.id}`}><Card className="transition-colors hover:border-primary/60"><CardContent className="grid gap-2 p-4 text-sm md:grid-cols-5"><div><div className="font-semibold">{c.business_name}</div><div className="text-muted-foreground">{c.derived_town || c.search_location || c.address || 'Location needed'}</div></div><div><div className="text-muted-foreground">Payment</div><div>{(c.amount_paid ?? 0) > 0 ? `Paid${c.payment_date ? ` · ${c.payment_date}` : ''}` : 'Needs payment'}</div></div><div><div className="text-muted-foreground">Baseline</div><div>{c.baseline_audit_id ? 'In progress / complete' : 'Not started'}</div></div><div><div className="text-muted-foreground">Next action</div><div>{c.next_action || (c.baseline_audit_id ? 'Continue fulfilment' : 'Prepare baseline')}</div></div><div><div className="text-muted-foreground">Remeasure · progress</div><div>{c.remeasure_due_date ? rm.label : 'Not scheduled'} · {done} checked</div></div></CardContent></Card></Link>; })}{clients.length === 0 && <Card><CardContent className="p-8 text-sm text-muted-foreground">No paid clients yet.</CardContent></Card>}</div>}</div>;
}
