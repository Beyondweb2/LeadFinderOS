/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PICKER — one screen per business. Paul's requirement: "It has to be fast, because I run
   through these one after another."

   Two modes on one route:
     /mockups        the mockups-waiting list (Paul asked for this in the app, not in SQL)
     /mockups/:id    place the images for one business

   ⛔ THE SLOT TARGETS COME FROM THE TEMPLATE, NOT FROM THIS FILE. slotsIn() reads the template
   HTML and that IS the slot list — write {{url img van}} in the template and a "van" target
   appears here with no code change. That is the contract's promise and this screen must never
   hardcode a slot name.

   🔴 STOCK IS OFFERED ONLY WHERE IT IS ALLOWED. The hero takes a real photo or none — Paul's one
   exception, because the hero renders in the WhatsApp preview and stock where their shop should be
   reads as a template. The server refuses it too (mockup/index.ts): a rule that lives only in a
   component is one keystroke from being bypassed, so both ends enforce it and this end explains it.

   ⛔ NOTHING HERE AUTO-PLACES. The grid arrives ordered best-first from the vision pass and every
   placement is a deliberate act. See _shared/mockup-pool.ts for why the recovered auto-assign does
   not get a vote.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, RefreshCw, Trash2, ImageOff, ExternalLink, Plus, X } from 'lucide-react';
import { useMockup, useMockupActions, useMockupList, type PoolImage } from '@/hooks/useMockups';
import { MOCKUP_MAX_SERVICES, MOCKUP_MAX_AREAS } from '@/lib/mockupNiche';
import { stockAllowedInSlot, stockFor } from '@/lib/mockupStock';
import { slotsIn } from '@/lib/mockupRender';
import locksmithTpl from '@/mockup/templates/locksmith.html?raw';

/* The template files, by niche key. ⚠️ Vite `?raw` so the HTML ships as a string — the picker needs
   the template to know its slots, and the registry names the file. Adding a niche adds a line
   here and a registry row; no other code changes. */
const TEMPLATE_HTML: Record<string, string> = { locksmith: locksmithTpl, plumber: locksmithTpl };

const asPence = (usd: number | null | undefined) =>
  typeof usd === 'number' ? `${(usd * 100).toFixed(2)}p` : '—';

/* ── The waiting list ─────────────────────────────────────────────────────────────────────── */
function WaitingList() {
  const { data: rows, isLoading, refetch, isFetching } = useMockupList();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mockups waiting</h1>
          <p className="text-sm text-muted-foreground">
            Created automatically when a prospect replies to the opener. Nothing here has been sent.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !rows?.length ? (
        /* ⛔ AN EMPTY LIST IS A REAL ANSWER AND SAYS WHAT IT MEANS. "No mockups" and "the read
           failed" must never look the same — the RLS-200-with-[] trap that has cost this codebase
           three features. */
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No mockups waiting.</p>
          <p className="mt-1">One is prepared when a prospect replies to your opener and their trade has a template.</p>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((r) => (
            <Link key={r.id} to={`/mockups/${r.id}`} className="flex items-center gap-4 p-3 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.business}</div>
                <div className="text-xs text-muted-foreground">{r.niche} · {new Date(r.created_at).toLocaleDateString('en-GB')}</div>
              </div>
              {/* ⛔ "not scraped" and "0 services" are rendered DIFFERENTLY. Collapsing them would
                  mean re-running a scrape that already ran, or not running one that never did. */}
              <div className="flex shrink-0 items-center gap-2 text-xs">
                {!r.scraped
                  ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">site not read yet</span>
                  : <span className="rounded-full bg-muted px-2 py-0.5">{r.services} services · {r.areas} areas</span>}
                {r.pooled
                  ? <span className="rounded-full bg-muted px-2 py-0.5">{r.pool_size} photos</span>
                  : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">no photos yet</span>}
                <span className={`rounded-full px-2 py-0.5 ${r.placed ? 'bg-green-100 text-green-900' : 'bg-muted'}`}>
                  {r.placed} placed
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One business ─────────────────────────────────────────────────────────────────────────── */
function Picker({ id }: { id: string }) {
  const { toast } = useToast();
  const { data, isLoading } = useMockup(id);
  const { pool, place, saveServices, refill } = useMockupActions(id);
  const m = data?.mockup ?? null;
  const c = m?.content ?? {};
  /* Signed display URLs for placed photos, minted per read by the server — never stored. */
  const slotUrls = data?.slot_urls ?? {};

  const templateHtml = TEMPLATE_HTML[String(m?.template ?? '')] ?? '';
  const slots = useMemo(() => (templateHtml ? slotsIn(templateHtml) : []), [templateHtml]);
  const stock = useMemo(() => stockFor(m?.template), [m?.template]);

  const images: PoolImage[] = Array.isArray(c.pool) ? c.pool : [];
  const placed = c.slots ?? {};

  /* Service editor. Seeded from the operator's confirmed list if there is one, else the scrape —
     ⚠️ and NOT written back over the scrape, so the evidence of what their site said survives a
     correction (the server keeps them in separate keys). */
  const seed = c.services_confirmed ?? c.scrape?.services ?? [];
  const [svc, setSvc] = useState<Array<{ name: string; price?: string; description?: string }>>([]);
  const [svcDirty, setSvcDirty] = useState(false);
  useEffect(() => { setSvc(seed.map((s) => ({ ...s }))); setSvcDirty(false); }, [m?.id, c.services_confirmed, c.scrape?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const [dragUrl, setDragUrl] = useState<string | null>(null);

  const doPlace = (slot: string, args: { url?: string; stock_id?: string; clear?: boolean }) => {
    place.mutate({ slot, ...args }, {
      onError: (e) => toast({ title: 'Could not place that', description: (e as Error).message, variant: 'destructive' }),
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</div>;
  if (!m) return <div className="p-6">Mockup not found. <Link className="underline" to="/mockups">Back to the list</Link></div>;

  const biz = c.business ?? {};

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/mockups" className="text-sm text-muted-foreground hover:underline">← Mockups waiting</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{biz.name ?? '(unnamed)'}</h1>
          <p className="text-sm text-muted-foreground">
            {m.template} · {biz.town ?? 'no town'} · status <b>{m.status}</b>
            {c.current_site_url && (
              <> · <a href={c.current_site_url} target="_blank" rel="noopener noreferrer" className="underline">
                their site <ExternalLink className="inline h-3 w-3" />
              </a></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refill.mutate()} disabled={refill.isPending}>
            {refill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-read their site
          </Button>
          {/* ⛔ THE BUTTON PRICES ITSELF, and the figure is DERIVED from the last measured run
              rather than typed as prose — CLAUDE.md §4's rule about pence in text going stale. */}
          <Button
            size="sm"
            onClick={() => pool.mutate(templateHtml, {
              onSuccess: (r) => toast({
                title: `${r.counts.merged} photos`,
                description: `${r.counts.maps} from Maps, ${r.counts.own_site} from their site · cost ${asPence((r.cost_usd.maps ?? 0) + (r.cost_usd.vision ?? 0))}`
                  + (r.errors.maps ? ` · Maps: ${r.errors.maps}` : ''),
              }),
              onError: (e) => toast({ title: 'Could not gather photos', description: (e as Error).message, variant: 'destructive' }),
            })}
            disabled={pool.isPending || !templateHtml}
          >
            {pool.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {images.length ? 'Re-gather photos' : 'Gather photos'}
            {pool.data?.cost_usd ? ` · ~${asPence((pool.data.cost_usd.maps ?? 0) + (pool.data.cost_usd.vision ?? 0))}` : ''}
          </Button>
        </div>
      </div>

      {!templateHtml && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          No template file for niche <b>{m.template}</b>, so this screen cannot know which image slots exist.
          Add <code>src/mockup/templates/{m.template}.html</code> and a registry row.
        </p>
      )}

      {/* ── SLOTS, driven by the template ─────────────────────────────────────────────── */}
      <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Slots this template asks for ({slots.length})
      </h2>
      <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(220px,1fr))` }}>
        {slots.map((slot) => {
          const p = placed[slot];
          const allowStock = stockAllowedInSlot(slot);
          return (
            <div
              key={slot}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
                const sid = e.dataTransfer.getData('application/x-stock-id');
                if (sid) { doPlace(slot, { stock_id: sid }); return; }
                if (url) doPlace(slot, { url });
                setDragUrl(null);
              }}
              className={`rounded-lg border-2 p-2 ${dragUrl ? 'border-dashed border-primary/60 bg-primary/5' : 'border-border'}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold">{slot}</span>
                {p && (
                  <button title="Clear" onClick={() => doPlace(slot, { clear: true })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {p ? (
                <div>
                  <img
                    src={p.kind === 'stock' ? p.path : (slotUrls[slot] ?? '')}
                    alt="" className="h-28 w-full rounded object-cover" referrerPolicy="no-referrer"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.kind === 'stock' ? 'STOCK' : (p.source === 'maps' ? 'Google Maps' : p.source === 'own_site' ? 'their site' : p.source)}
                  </p>
                </div>
              ) : (
                <div className="flex h-28 flex-col items-center justify-center gap-1 rounded bg-muted/50 text-center text-[11px] text-muted-foreground">
                  <ImageOff className="h-4 w-4" />
                  <span>drag a photo here</span>
                  {/* 🔴 The hero rule, explained where it bites rather than hidden. */}
                  {!allowStock && <span className="px-2 font-medium text-amber-700">real photo or none — no stock in {slot}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── POOL ──────────────────────────────────────────────────────────────────────── */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Photos ({images.length}) — best first{c.pool_at ? ` · gathered ${new Date(c.pool_at).toLocaleString('en-GB')}` : ''}
      </h2>
      {!images.length ? (
        <p className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No photos gathered yet. Press <b>Gather photos</b> — Google Maps first, their own site as well.
        </p>
      ) : (
        <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
          {images.map((im) => (
            <figure
              key={im.url}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/uri-list', im.url);
                e.dataTransfer.setData('text/plain', im.url);
                e.dataTransfer.effectAllowed = 'copy';
                setDragUrl(im.url);
              }}
              onDragEnd={() => setDragUrl(null)}
              className={`m-0 cursor-grab overflow-hidden rounded-lg border-2 active:cursor-grabbing ${im.demoted ? 'border-border opacity-50' : 'border-border'}`}
              title={im.demoted ?? `quality ${im.quality ?? '?'}`}
            >
              <img src={im.thumb || im.url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-24 w-full bg-muted object-cover" />
              <figcaption className="px-1.5 py-1 text-[10.5px] leading-tight">
                <span className="font-semibold">{im.source === 'maps' ? 'Maps' : im.source === 'own_site' ? 'their site' : im.source}</span>
                {typeof im.quality === 'number' && <span className="text-muted-foreground"> · q{im.quality}</span>}
                {im.fit && Object.entries(im.fit).filter(([, v]) => v >= 50).map(([k, v]) => (
                  <span key={k} className="ml-1 rounded bg-green-100 px-1 text-green-900">{k} {v}</span>
                ))}
                {/* ⚠️ DEMOTED, NOT HIDDEN. A guess that removes a photo the operator wanted is
                    worse than one that ranks it last, so it stays draggable with its reason. */}
                {im.demoted && <span className="block text-amber-700">{im.demoted}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* ── STOCK ─────────────────────────────────────────────────────────────────────── */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Stock ({stock.length}) — below the fold only, never the hero
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        One curated set, reused every build. Captions stay generic and true — never their own work, never a place name.
      </p>
      <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
        {stock.map((s) => (
          <figure
            key={s.id}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/x-stock-id', s.id); e.dataTransfer.effectAllowed = 'copy'; }}
            className="m-0 cursor-grab overflow-hidden rounded-lg border-2 border-dashed border-border active:cursor-grabbing"
            title={s.alt}
          >
            <img src={s.path} alt={s.alt} className="h-24 w-full bg-muted object-cover" />
            <figcaption className="px-1.5 py-1 text-[10.5px] text-muted-foreground">{s.caption ?? s.alt}</figcaption>
          </figure>
        ))}
      </div>

      {/* ── SERVICES ──────────────────────────────────────────────────────────────────── */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Services ({svc.length}) — the template shows the first {MOCKUP_MAX_SERVICES}
        </h2>
        <Button size="sm" variant={svcDirty ? 'default' : 'outline'} disabled={!svcDirty || saveServices.isPending}
          onClick={() => saveServices.mutate(svc, {
            onSuccess: () => { setSvcDirty(false); toast({ title: 'Services saved' }); },
            onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' }),
          })}>
          {saveServices.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save services
        </Button>
      </div>
      {!c.scrape && (
        <p className="mt-1 text-xs text-amber-700">Their site has not been read yet — press “Re-read their site”.</p>
      )}
      <div className="mt-2 space-y-2">
        {svc.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input value={s.name} placeholder="Service name"
              onChange={(e) => { const n = [...svc]; n[i] = { ...n[i], name: e.target.value }; setSvc(n); setSvcDirty(true); }} />
            <Input value={s.price ?? ''} placeholder="Price (optional)" className="w-40"
              onChange={(e) => { const n = [...svc]; n[i] = { ...n[i], price: e.target.value }; setSvc(n); setSvcDirty(true); }} />
            <Button variant="ghost" size="icon" onClick={() => { setSvc(svc.filter((_, j) => j !== i)); setSvcDirty(true); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => { setSvc([...svc, { name: '' }]); setSvcDirty(true); }}>
          <Plus className="mr-2 h-4 w-4" />Add a service
        </Button>
      </div>

      {/* ── AREAS (read-only here; the scrape owns them) ──────────────────────────────── */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Areas ({c.scrape?.areas?.length ?? 0}) — the template shows the first {MOCKUP_MAX_AREAS}
      </h2>
      <p className="mt-1 text-sm">
        {c.scrape?.areas?.length
          ? c.scrape.areas.join(' · ')
          : <span className="text-muted-foreground">Their site names no areas. The template drops that section entirely.</span>}
      </p>
    </div>
  );
}

export default function MockupsPage() {
  const { id } = useParams<{ id: string }>();
  return id ? <Picker id={id} /> : <WaitingList />;
}
