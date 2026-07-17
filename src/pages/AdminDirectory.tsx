import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Loader2, FolderTree, RefreshCw, ExternalLink } from 'lucide-react';

interface DirectoryBusiness {
  id: string;
  name: string;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  city: string | null;
  website: string | null;
  is_client: boolean;
  niche: string;
  area: string;
}

/**
 * Admin "Directory" page — the control panel for the directory-page pipeline. Trigger a
 * scrape (scrape-directory edge fn) for a niche+area, then view the fact-dense businesses
 * captured in directory_businesses. Admin-gated by the route (RequireAdmin); the edge fn
 * keeps its own server-side admin gate. Untyped-client cast because directory_businesses
 * isn't in the generated Supabase types yet.
 */
export default function AdminDirectory() {
  const navigate = useNavigate();
  const [niche, setNiche] = useState('');
  const [area, setArea] = useState('');
  const [maxPlaces, setMaxPlaces] = useState(5);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<{ scraped: number; written: number } | null>(null);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<DirectoryBusiness[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // Load the businesses for a given niche+area (normalised the same way the edge fn stores them).
  const fetchRows = async (nicheVal: string, areaVal: string) => {
    const n = nicheVal.toLowerCase().trim();
    const a = areaVal.toLowerCase().trim();
    if (!n || !a) return;
    setLoadingRows(true);
    setError('');
    try {
      const { data, error: qErr } = await (supabase as unknown as SupabaseClient)
        .from('directory_businesses')
        .select('id, name, rating, review_count, category, city, website, is_client, niche, area')
        .eq('niche', n)
        .eq('area', a)
        .order('rating', { ascending: false, nullsFirst: false });
      if (qErr) {
        console.error('[AdminDirectory] fetchRows error:', qErr);
        setError(qErr.message);
        return; // surface the read failure instead of showing a false "No businesses yet"
      }
      setRows((data ?? []) as DirectoryBusiness[]);
    } catch (e) {
      console.error('[AdminDirectory] fetchRows exception:', e);
      setError(e instanceof Error ? e.message : 'Failed to load businesses');
    } finally {
      setLoadingRows(false);
    }
  };

  // Debug/overview fallback: show ALL directory businesses (no niche/area filter), most recent
  // 50 — so the table is never blank just because of a niche/area typo or filter mismatch.
  const fetchAll = async () => {
    setLoadingRows(true);
    setError('');
    try {
      const { data, error: qErr } = await (supabase as unknown as SupabaseClient)
        .from('directory_businesses')
        .select('id, name, rating, review_count, category, city, website, is_client, niche, area')
        .order('scraped_at', { ascending: false })
        .limit(50);
      if (qErr) {
        console.error('[AdminDirectory] fetchAll error:', qErr);
        setError(qErr.message);
        return;
      }
      setRows((data ?? []) as DirectoryBusiness[]);
    } catch (e) {
      console.error('[AdminDirectory] fetchAll exception:', e);
      setError(e instanceof Error ? e.message : 'Failed to load businesses');
    } finally {
      setLoadingRows(false);
    }
  };

  // On mount, if niche+area are already set (e.g. prefilled), show their existing rows so a
  // reload isn't blank. Guarded on both being non-empty; the after-scrape refresh still runs too.
  useEffect(() => {
    if (niche.trim() && area.trim()) fetchRows(niche, area);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScrape = async () => {
    if (scraping) return;
    const n = niche.trim();
    const a = area.trim();
    if (!n || !a) { setError('Enter both a niche and an area.'); return; }
    setScraping(true);
    setError('');
    setScrapeStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Not authenticated'); return; }

      const clampedMax = Math.min(50, Math.max(1, Math.round(Number(maxPlaces) || 5)));
      const { data: result, error: fnError } = await supabase.functions.invoke('scrape-directory', {
        body: { niche: n, area: a, maxPlaces: clampedMax },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnError) throw fnError;
      if (!result?.ok) throw new Error(result?.error || 'Scrape failed');

      setScrapeStatus({ scraped: Number(result.scraped) || 0, written: Number(result.written) || 0 });
      await fetchRows(n, a); // refresh the list from what was just written
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-primary" /> Directory
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loadingRows}>
            <FolderTree className="h-4 w-4 mr-2" /> Show all
          </Button>
          {rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => fetchRows(niche, area)} disabled={loadingRows}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingRows ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Scrape a niche + area into the directory pool (fact-dense: name, rating, reviews, category).
        This is the raw data for building "best [niche] in [area]" pages.
      </p>

      {/* Scrape form */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Niche (e.g. accountant)"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              disabled={scraping}
            />
            <Input
              placeholder="Area (e.g. peterborough)"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={scraping}
            />
            <Input
              type="number"
              min={1}
              max={50}
              placeholder="Max places"
              value={maxPlaces}
              onChange={(e) => setMaxPlaces(Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 1))))}
              disabled={scraping}
              className="sm:w-32 shrink-0"
              title="Max places (1–50)"
            />
            <Button onClick={handleScrape} disabled={scraping} className="sm:w-40 shrink-0">
              {scraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {scraping ? 'Scraping…' : 'Scrape'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Each scrape costs a small Apify fee — more places = more cost.
          </p>
          {scraping && (
            <p className="text-xs text-muted-foreground">Scraping takes ~30–120s — leave this open.</p>
          )}
          {scrapeStatus && (
            <p className="text-sm text-foreground">
              Scraped <span className="font-semibold">{scrapeStatus.scraped}</span> ·
              wrote <span className="font-semibold">{scrapeStatus.written}</span> to the directory.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          {loadingRows ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <FolderTree className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">No businesses yet — scrape a niche + area to populate the list.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead className="text-right">Reviews</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead className="text-right">Website</TableHead>
                    <TableHead className="text-center">Client</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">{b.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.rating ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.review_count ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{b.category ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{b.city ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        {b.website ? (
                          <a
                            href={/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Visit
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {b.is_client
                          ? <Badge className="bg-green-500/20 text-green-500 border-transparent">Client</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">—</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">{rows.length} businesses</p>
      )}
    </div>
  );
}
