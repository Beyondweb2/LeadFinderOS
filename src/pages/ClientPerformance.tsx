import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Loader2, Minus, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useAuth } from '@/hooks/useAuth';
import { useClientPerformance, type PerformancePayload } from '@/hooks/useClientPerformance';
import {
  PERFORMANCE_PERIODS,
  changeHigherIsBetter,
  changePosition,
  isPerformancePeriod,
  pagePath,
  type Change,
  type PageRow,
  type PerformancePeriod,
} from '@/lib/searchPerformance';

/* ══ THE PERFORMANCE SCREEN (2026-09-22, Phase 1 — Search Console only) ════════════════════════
   Its own route rather than a ninth card on the client hub, and its own lazy chunk: the hub loads
   one payload for eight fulfilment stages, and bolting a 90-day analytics read onto that call
   would make every visit to every stage pay for it.

   ⛔ THIS IS AN OPERATOR SCREEN, NOT A CLIENT DOCUMENT. Nothing here is sent to a customer. It is
      listed in client-copy-claims.test.ts's OPERATOR_SCREENS all the same, because a stale claim on
      an operator screen is one the operator repeats to a client on the phone.

   ⛔ GOOGLE SEARCH PERFORMANCE AND AI VISIBILITY ARE NOT COMBINED, ANYWHERE, BY ANY ARITHMETIC.
      They measure different things on different scales; a blended figure would be indefensible in
      the one conversation that matters, which is a refund conversation. The AI side lives on the
      baseline and comparison screens and stays there. */

const PERIOD_LABEL: Record<PerformancePeriod, string> = { 7: '7 days', 28: '28 days', 90: '90 days' };

const TYPE_LABEL: Record<string, string> = {
  home: 'Home',
  service: 'Service',
  location: 'Location',
  commercial: 'Commercial',
  other: 'Other',
};

const int = (n: number) => n.toLocaleString('en-GB');
/** CTR with one decimal. null → an em dash: a rate with no impressions is unknown, not 0%. */
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
/** Average position with one decimal. */
const pos = (v: number | null) => (v === null ? '—' : v.toFixed(1));
const day = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** A stored day is a DAY. Formatting it in local time renders it as the next day under BST. */
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB') : '—');

/* ── The change chip ──────────────────────────────────────────────────────────────────────────
   🔴 COLOUR AND ARROW READ `improved`, NEVER THE SIGN OF `delta`. Average position improving means
   the number going DOWN, so a green arrow here points down on that one metric and that is correct.
   The sign flip lives in changePosition() in the lib; this component never re-derives it. */
function ChangeChip({ change, format }: { change: Change | null; format: 'pct' | 'position' }) {
  if (!change) return <span className="text-xs text-muted-foreground">—</span>;
  const flat = change.delta === 0;
  const tone = flat ? 'text-muted-foreground' : change.improved ? 'text-emerald-600' : 'text-rose-600';
  const Icon = flat ? Minus : change.improved ? (format === 'position' ? ArrowDown : ArrowUp) : (format === 'position' ? ArrowUp : ArrowDown);
  const body = format === 'position'
    ? `${change.delta > 0 ? '+' : ''}${change.delta.toFixed(1)}`
    : change.pct === null
      ? `${change.delta > 0 ? '+' : ''}${int(Math.round(change.delta))}`
      : `${change.pct > 0 ? '+' : ''}${(change.pct * 100).toFixed(0)}%`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3 w-3" />{body}
    </span>
  );
}

function MetricCard({ title, value, change, format, hint }: {
  title: string; value: string; change: Change | null; format: 'pct' | 'position'; hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="flex items-center gap-2">
          <ChangeChip change={change} format={format} />
          <span className="text-xs text-muted-foreground">vs previous period</span>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/* ── The five states. Each is its own arm; there is no catch-all else ──────────────────────── */

function StatePanel({ data }: { data: PerformancePayload }) {
  const conn = data.connection;
  const domain = data.client.canonical_domain;

  if (data.state === 'not_connected') {
    return (
      <Card><CardContent className="space-y-3 p-6 text-sm">
        <div className="flex items-center gap-2 font-medium"><PlugZap className="h-4 w-4" />Search Console not connected</div>
        <p className="text-muted-foreground">
          This client has no Search Console link yet, so there is nothing to show. Connecting one is a
          setup step done in Google and in the database — it is not a button on this page in this version.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Add the Findable service account as a user on the client's Search Console property.</li>
          <li>Record the property string and the canonical domain against this client.</li>
          <li>Run the first sync.</li>
        </ol>
      </CardContent></Card>
    );
  }

  if (data.state === 'property_missing') {
    return (
      <Card><CardContent className="space-y-2 p-6 text-sm">
        <div className="font-medium">No Search Console property selected</div>
        <p className="text-muted-foreground">
          This client has a connection record but no property string on it, so the sync has nothing to
          ask Google for. Set the exact property — either the URL-prefix form
          ({domain ? `https://${domain}/` : 'https://example.com/'}) or the domain form
          ({domain ? `sc-domain:${domain}` : 'sc-domain:example.com'}) — and run the sync.
        </p>
      </CardContent></Card>
    );
  }

  if (data.state === 'error') {
    return (
      <Card className="border-rose-300"><CardContent className="space-y-2 p-6 text-sm">
        <div className="flex items-center gap-2 font-medium text-rose-600"><AlertTriangle className="h-4 w-4" />The last sync failed</div>
        {/* The real message, not a catch-all. A generic "something went wrong" is worse than none:
            this text is the only thing that distinguishes "the service account is not on the
            property" from "the property string is wrong". */}
        <pre className="whitespace-pre-wrap rounded border bg-muted/40 p-3 text-xs">{conn?.last_sync_error || 'No error text was recorded.'}</pre>
        <p className="text-muted-foreground">
          Last successful sync: {stamp(conn?.last_synced_at)}
          {data.coverage.last_date ? ` · stored data runs to ${day(data.coverage.last_date)}, and is shown below.` : ' · no data has been stored yet.'}
        </p>
      </CardContent></Card>
    );
  }

  if (data.state === 'no_data') {
    return (
      <Card><CardContent className="space-y-2 p-6 text-sm">
        <div className="font-medium">No Search Console data for this period yet</div>
        {/* ⛔ No claim that data begins at verification. Google can hold data from before a property
            was verified, and it publishes recent days late and revises them. What we can honestly
            say is what we have — which is max(date), stated plainly. */}
        <p className="text-muted-foreground">
          Search Console publishes a day's figures a couple of days after it happens, so a newly
          connected site shows nothing for a while. This is not a failure and not a statement about
          when data starts — it is simply what has been stored so far.
        </p>
        <p className="text-muted-foreground">
          Stored data {data.coverage.last_date
            ? `runs ${day(data.coverage.first_date)} – ${day(data.coverage.last_date)} (${int(data.coverage.row_count)} rows), none of it inside the selected period.`
            : 'is empty for this client.'}
          {' '}Last sync ran {stamp(conn?.last_synced_at)}.
        </p>
      </CardContent></Card>
    );
  }

  return null;
}

/* ── Pages table ─────────────────────────────────────────────────────────────────────────── */

type SortKey = 'clicks' | 'impressions' | 'position';

function PagesTable({ rows, canonicalDomain }: { rows: PageRow[]; canonicalDomain: string | null }) {
  const [sort, setSort] = useState<SortKey>('clicks');

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === 'position') {
      // Lower is better, and a page with no impressions has no position — it sorts last rather
      // than sorting first as a 0 would.
      return copy.sort((a, b) => {
        const av = a.current.position, bv = b.current.position;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return av - bv;
      });
    }
    return copy.sort((a, b) => b.current[sort] - a.current[sort]);
  }, [rows, sort]);

  const head = (key: SortKey, label: string) => (
    <TableHead className="cursor-pointer select-none text-right" onClick={() => setSort(key)}>
      <span className={sort === key ? 'font-semibold text-foreground' : ''}>{label}</span>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Pages</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Page</TableHead>
              <TableHead>Type</TableHead>
              {head('impressions', 'Impressions')}
              {head('clicks', 'Clicks')}
              <TableHead className="text-right">CTR</TableHead>
              {head('position', 'Avg position')}
              <TableHead className="text-right">Change (clicks)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.url}>
                <TableCell className="max-w-[22rem]">
                  <a className="text-primary underline" href={row.url} target="_blank" rel="noreferrer">{row.label}</a>
                  <div className="text-xs text-muted-foreground">{pagePath(row.url)}</div>
                </TableCell>
                <TableCell>
                  {/* 🔴 An unknown URL is SHOWN, labelled untracked. Hiding it would hide real
                      traffic — and would hide a broken URL normaliser, because a join that matches
                      nothing looks exactly like a client with no traffic once the rows are gone. */}
                  {row.tracked
                    ? <span className="text-xs">{TYPE_LABEL[row.pageType] ?? row.pageType}</span>
                    : <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">untracked</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{int(row.current.impressions)}</TableCell>
                <TableCell className="text-right tabular-nums">{int(row.current.clicks)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(row.current.ctr)}</TableCell>
                <TableCell className="text-right tabular-nums">{pos(row.current.position)}</TableCell>
                <TableCell className="text-right">
                  {row.comparisonSuppressed
                    /* The page was built or rebuilt inside the compared span, so a change figure
                       would measure its own creation. That number is worse than no number: it looks
                       like a result. */
                    ? <span className="text-xs text-muted-foreground" title={`Rebuilt ${day(row.builtOrRebuiltOn)} — inside the comparison window`}>rebuilt</span>
                    : <ChangeChip change={changeHigherIsBetter(row.current.clicks, row.previous ? row.previous.clicks : null)} format="pct" />}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No pages returned any impressions in this period.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {canonicalDomain && <p className="mt-3 text-xs text-muted-foreground">Matched against the tracked inventory for {canonicalDomain}.</p>}
      </CardContent>
    </Card>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────────────────────── */

export default function ClientPerformance() {
  const { leadId = '' } = useParams();
  const { user } = useAuth();
  /* The period is HOW the page is configured, not WHAT it is looking at, so it persists rather
     than living in the URL (CLAUDE.md §6). Scoped to the user; validated on rehydrate so a stale
     or hand-edited value cannot put an unsupported period in the request. */
  const [period, setPeriod] = usePersistedState<PerformancePeriod>('client-performance-period', 28, {
    tier: 'local',
    scope: user?.id ?? null,
    validate: (v) => (isPerformancePeriod(v) ? v : null),
  });

  const { data, isLoading, error, refetch, isFetching } = useClientPerformance(leadId, period);

  const overview = data?.overview;
  const changes = useMemo(() => {
    if (!overview) return null;
    return {
      impressions: changeHigherIsBetter(overview.current.impressions, overview.previous.impressions),
      clicks: changeHigherIsBetter(overview.current.clicks, overview.previous.clicks),
      ctr: changeHigherIsBetter(overview.current.ctr, overview.previous.ctr),
      position: changePosition(overview.current.position, overview.previous.position),
    };
  }, [overview]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin" /></div>;

  if (error || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 py-6">
        <Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>
        <Card><CardContent className="space-y-3 p-6 text-sm">
          <div className="flex items-center gap-2 font-medium text-rose-600"><AlertTriangle className="h-4 w-4" />Could not load performance</div>
          <pre className="whitespace-pre-wrap rounded border bg-muted/40 p-3 text-xs">{error instanceof Error ? error.message : 'Unknown error'}</pre>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>Try again</Button>
        </CardContent></Card>
      </div>
    );
  }

  const populated = data.state === 'populated';

  return (
    <div className="mx-auto max-w-7xl space-y-4 py-6">
      <Link to={`/paid-clients/${leadId}`} className="text-xs text-muted-foreground">← Client hub</Link>

      <Card><CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{data.client.business_name}</h1>
            <p className="text-sm text-muted-foreground">
              {data.client.canonical_domain
                ? <a className="text-primary underline" href={`https://${data.client.canonical_domain}/`} target="_blank" rel="noreferrer">{data.client.canonical_domain}<ExternalLink className="ml-1 inline h-3 w-3" /></a>
                : 'No canonical domain recorded'}
              {data.client.town ? ` · ${data.client.town}` : ''}
            </p>
            <p className="mt-1 text-sm">
              Google Search performance. AI visibility is measured separately and is not combined with these figures.
            </p>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">
              {data.state === 'populated' ? 'Connected' : data.state === 'error' ? 'Sync error' : data.state === 'no_data' ? 'Connected — no data in this period' : data.state === 'property_missing' ? 'No property selected' : 'Not connected'}
            </div>
            {/* ⛔ Coverage is max(date) in the stored data, never last_synced_at. A sync that ran
                five minutes ago and returned nothing must not imply there is data for today. */}
            <div className="text-muted-foreground">
              {data.coverage.last_date ? `Data through ${day(data.coverage.last_date)}` : 'No data stored yet'}
            </div>
            {data.connection?.last_synced_at && <div className="text-xs text-muted-foreground">Last sync {stamp(data.connection.last_synced_at)}</div>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {PERFORMANCE_PERIODS.map((p) => (
            <Button key={p} size="sm" variant={p === period ? 'default' : 'outline'} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</Button>
          ))}
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="text-xs text-muted-foreground">
            {day(data.windows.current.from)} – {day(data.windows.current.to)} · compared with {day(data.windows.previous.from)} – {day(data.windows.previous.to)}
          </span>
        </div>
      </CardContent></Card>

      <StatePanel data={data} />

      {populated && overview && changes && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Impressions" value={int(overview.current.impressions)} change={changes.impressions} format="pct" />
            <MetricCard title="Clicks" value={int(overview.current.clicks)} change={changes.clicks} format="pct" />
            <MetricCard title="CTR" value={pct(overview.current.ctr)} change={changes.ctr} format="pct" hint="Clicks ÷ impressions across the period" />
            <MetricCard title="Average position" value={pos(overview.current.position)} change={changes.position} format="position" hint="Impression-weighted. Lower is better." />
          </div>

          <PagesTable rows={data.pages} canonicalDomain={data.client.canonical_domain} />

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Queries</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Query</TableHead><TableHead>Page</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Avg position</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.queries.map((q) => (
                    <TableRow key={`${q.query} ${q.url}`}>
                      <TableCell className="max-w-[24rem]">{q.query}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{q.pageLabel}{!q.tracked && ' · untracked'}</TableCell>
                      <TableCell className="text-right tabular-nums">{int(q.impressions)}</TableCell>
                      <TableCell className="text-right tabular-nums">{int(q.clicks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pos(q.position)}</TableCell>
                    </TableRow>
                  ))}
                  {data.queries.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No queries returned any impressions in this period.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">Top {data.queries.length} by clicks. Search Console withholds low-volume queries, so these will not sum to the totals above.</p>
            </CardContent>
          </Card>

          {data.untracked_count > 0 && (
            <p className="text-xs text-muted-foreground">
              {data.untracked_count} of {data.pages.length} pages with traffic are not in the tracked inventory
              ({data.tracked_count} tracked). They are shown above as untracked — nothing is hidden.
            </p>
          )}
        </>
      )}
    </div>
  );
}
