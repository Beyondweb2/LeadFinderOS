import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Facebook, Instagram, Linkedin, Loader2, Search, SearchCheck, X, Youtube, Twitter, Music2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { notifyLeadChanged } from '@/lib/leadSync';
import { linkedInSearchUrl } from '@/lib/focusQueue';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  SOCIAL_CONFIDENCE_LABEL, SOCIAL_SOURCE_LABEL, socialOutcomes, socialOutcomeSentence, socialPlatformLabel,
  type SocialConfidence, type SocialProfileRow, type SocialSource,
} from '@/lib/socialProfiles';

/* ══ SOCIALS — THE ONE LINE AND THE ONE PANEL (2026-09-30, docs/social-profiles.md) ═══════════════════
   SocialLinks is the compact line every lead surface draws (popup header, Prospect details, the Outreach
   row, Focus Mode, the Inbox header). It reads the lead's OWN columns — facebook_url / instagram_url /
   linkedin_url + *_status — which hold only the canonical profile the database picked
   (_social_profiles_sync), so a list never reads a second table.
   ⛔ Confirmed and Likely LOOK DIFFERENT everywhere: confirmed = a solid chip with a tick; likely = a
      dashed amber chip that says "likely". "Needs checking" is never a link here — it points to the panel.
   SocialProfilesPanel (the popup's Prospect tab) is where a person reviews: every profile with where it
   came from, Confirm / Not them, paste a link, Find socials, Search LinkedIn. All writes go through fn
   social-profiles; nothing here decides a grade. */

export interface SocialLeadFields {
  id: string;
  business_name?: string | null;
  derived_town?: string | null;
  search_location?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  facebook_status?: string | null;
  instagram_status?: string | null;
  linkedin_status?: string | null;
}

const ICON: Record<string, typeof Facebook> = {
  facebook: Facebook, instagram: Instagram, linkedin: Linkedin, linkedin_company: Linkedin, linkedin_person: Linkedin,
  youtube: Youtube, x: Twitter, tiktok: Music2,
};
const TINT: Record<string, string> = {
  facebook: 'text-blue-600 dark:text-blue-400', instagram: 'text-pink-600 dark:text-pink-400', linkedin: 'text-sky-700 dark:text-sky-400',
  linkedin_company: 'text-sky-700 dark:text-sky-400', linkedin_person: 'text-sky-700 dark:text-sky-400',
};
const NAME: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' };

export const socialProfilesKey = (leadId: string) => ['social-profiles', leadId] as const;

type FindAnswer = { ok: boolean; rows?: SocialProfileRow[]; summary?: string; site_note?: string | null; error?: string; detail?: string };

/** Every profile row of one lead (RLS: admin, or a salesperson on their own lead). */
export function useSocialProfiles(leadId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: socialProfilesKey(leadId ?? ''),
    enabled: !!leadId && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('lead_social_profiles' as never)
        .select('id, platform, url, confidence, source, state, is_canonical, evidence, confirmed_by, updated_at')
        .eq('lead_id', leadId!).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SocialProfileRow[];
    },
  });
}

function useSocialAction(leadId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return async (body: Record<string, unknown>): Promise<FindAnswer | null> => {
    try {
      const r = await invokeEdge<FindAnswer>('social-profiles', { lead_id: leadId, ...body });
      if (!r?.ok) { toast({ title: 'Not saved', description: r?.detail ?? r?.error ?? 'Try again', variant: 'destructive' }); return r ?? null; }
      if (r.rows) qc.setQueryData(socialProfilesKey(leadId), r.rows);
      notifyLeadChanged(leadId);
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      return r;
    } catch (e) {
      toast({ title: 'Could not reach the server', description: edgeErrorMessage(e), variant: 'destructive' });
      return null;
    }
  };
}

/** FIND SOCIALS — both roles, a lead they work. Free: our records, then their own website. It always
 *  ends with one line naming each network ("Facebook confirmed · No Instagram found · LinkedIn
 *  uncertain — check below"); it never leaves a spinner running. */
export function FindSocialsButton({ leadId, className, label = 'Find socials', onFound }: { leadId: string; className?: string; label?: string; onFound?: (summary: string) => void }) {
  const { toast } = useToast();
  const act = useSocialAction(leadId);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await act({ action: 'find' });
      if (r?.ok) {
        const summary = r.summary ?? socialOutcomeSentence(socialOutcomes(r.rows ?? []));
        toast({ title: 'Socials checked', description: [summary, r.site_note].filter(Boolean).join(' — ') });
        onFound?.(summary);
      }
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={() => void run()} disabled={busy} data-testid="find-socials"
      title="Look for their Facebook, Instagram and LinkedIn in our records, then on their own website (free)"
      className={cn('inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-60', className)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchCheck className="h-3.5 w-3.5" />}{busy ? 'Looking…' : label}
    </button>
  );
}

/** Bulk Find socials is the ADMIN's (Outreach selection) and capped per run — a salesperson finds one
 *  lead at a time, and nobody fires it at thousands by accident. Free, but it fetches websites, so the
 *  server's per-hour usage guard (site_scrape) still bounds it. */
export const SOCIAL_BULK_MAX = 50;
const SOCIAL_BULK_PARALLEL = 3;

/** Find socials for several leads, a few at a time. Resolves with how many were checked, how many now
 *  have at least one profile, and how many failed — never throws. */
export async function findSocialsForLeads(leadIds: readonly string[], onProgress?: (done: number, total: number) => void): Promise<{ checked: number; withProfile: number; failed: number }> {
  const ids = leadIds.slice(0, SOCIAL_BULK_MAX);
  let next = 0; let done = 0; let withProfile = 0; let failed = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const r = await invokeEdge<FindAnswer>('social-profiles', { action: 'find', lead_id: id });
        if (r?.ok) { if ((r.rows ?? []).some((x) => x.is_canonical)) withProfile++; notifyLeadChanged(id); } else failed++;
      } catch { failed++; }
      done++; onProgress?.(done, ids.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SOCIAL_BULK_PARALLEL, ids.length) }, worker));
  return { checked: done, withProfile, failed };
}

function Chip({ platform, url, status, size }: { platform: 'facebook' | 'instagram' | 'linkedin'; url: string; status: string | null | undefined; size: 'xs' | 'sm' }) {
  const Icon = ICON[platform];
  const confirmed = status === 'confirmed';
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" data-testid={`social-${platform}`} data-confidence={confirmed ? 'confirmed' : 'likely'}
      title={`${NAME[platform]} — ${confirmed ? 'confirmed' : 'likely, not confirmed'}: ${url}`}
      className={cn('inline-flex items-center gap-1 rounded-full border font-medium hover:bg-muted',
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        confirmed ? 'border-border/70' : 'border-dashed border-amber-500/70')}>
      <Icon className={cn(size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5', TINT[platform])} />
      {size === 'sm' && <span>{NAME[platform]}</span>}
      {confirmed ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-label="confirmed" /> : <span className="text-amber-600 dark:text-amber-400">likely</span>}
    </a>
  );
}

/** The compact Socials line. `withFind` adds Find socials when a priority network is still unknown;
 *  `withSearch` adds Search LinkedIn when there is no LinkedIn. `size="xs"` is the Outreach row. */
export function SocialLinks({ lead, size = 'sm', withFind = false, withSearch = false, className }: {
  lead: SocialLeadFields; size?: 'xs' | 'sm'; withFind?: boolean; withSearch?: boolean; className?: string;
}) {
  const items = ([
    ['facebook', lead.facebook_url, lead.facebook_status],
    ['instagram', lead.instagram_url, lead.instagram_status],
    ['linkedin', lead.linkedin_url, lead.linkedin_status],
  ] as const);
  const shown = items.filter(([, url]) => !!url);
  const review = items.filter(([, url, st]) => !url && st === 'review').map(([p]) => NAME[p]);
  const search = withSearch && !lead.linkedin_url ? linkedInSearchUrl(lead.business_name, lead.derived_town || lead.search_location) : null;
  if (!shown.length && !review.length && !withFind && !search) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-testid="social-links">
      {shown.map(([p, url, st]) => <Chip key={p} platform={p} url={url!} status={st} size={size} />)}
      {review.length > 0 && size === 'sm' && (
        <span className="text-[11px] text-amber-600 dark:text-amber-400" title="More than one possible profile, or a weak match — check them on the Prospect tab">
          {review.join(' / ')}: to check
        </span>
      )}
      {withFind && (!lead.facebook_url || !lead.instagram_url || !lead.linkedin_url) && <FindSocialsButton leadId={lead.id} />}
      {search && (
        <a href={search} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" data-testid="search-linkedin"
          title="Search LinkedIn for the business or its owner — paste the right profile on the Prospect tab">
          <Search className="h-3.5 w-3.5" />Search LinkedIn
        </a>
      )}
    </span>
  );
}

const BADGE: Record<SocialConfidence, string> = {
  confirmed: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
  likely: 'border-dashed border-amber-500/70 text-amber-700 dark:text-amber-400',
  unverified: 'border-dashed border-muted-foreground/40 text-muted-foreground',
};

/** The review panel (the popup's Prospect tab): every profile, where it came from, Confirm / Not them,
 *  paste a link, Find socials, Search LinkedIn. */
export function SocialProfilesPanel({ lead }: { lead: SocialLeadFields }) {
  const q = useSocialProfiles(lead.id);
  const act = useSocialAction(lead.id);
  const { toast } = useToast();
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const rows = q.data ?? [];
  const active = rows.filter((r) => r.state === 'active');
  const rejected = rows.length - active.length;
  const ordered = [...active].sort((a, b) => Number(b.is_canonical) - Number(a.is_canonical));
  const search = linkedInSearchUrl(lead.business_name, lead.derived_town || lead.search_location);
  const run = async (key: string, body: Record<string, unknown>, done?: (r: FindAnswer) => void) => {
    setBusy(key);
    try { const r = await act(body); if (r?.ok) done?.(r); } finally { setBusy(null); }
  };
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm" data-testid="social-profiles-panel">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Social profiles</span>
        <span className="inline-flex flex-wrap items-center gap-3">
          <FindSocialsButton leadId={lead.id} onFound={setSaid} />
          {search && <a href={search} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Search className="h-3.5 w-3.5" />Search LinkedIn</a>}
        </span>
      </div>
      {said && <p className="mb-2 text-[11px] text-muted-foreground" data-testid="social-find-summary">{said}</p>}
      {q.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : q.isError ? <p className="text-xs text-destructive">Could not load the social profiles. Close and open the lead again.</p>
        : ordered.length === 0 ? <p className="text-xs text-muted-foreground">None saved yet. Press Find socials, or paste a profile below.</p>
        : (
          <ul className="space-y-1.5">
            {ordered.map((r) => {
              const conf = (r.confidence as SocialConfidence) ?? 'unverified';
              const Icon = ICON[r.platform] ?? Search;
              const why = typeof r.evidence?.why === 'string' ? r.evidence.why : null;
              const human = r.source === 'manual' || !!r.confirmed_by;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="social-profile-row" data-confidence={conf}>
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', TINT[r.platform] ?? 'text-muted-foreground')} />
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 max-w-full truncate font-medium hover:underline">{r.url.replace(/^https?:\/\/(www\.)?/, '')}</a>
                  <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-semibold', BADGE[conf])}>
                    {r.is_canonical ? SOCIAL_CONFIDENCE_LABEL[conf] : conf === 'unverified' ? 'Possible match' : `${SOCIAL_CONFIDENCE_LABEL[conf]} · not in use`}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{socialPlatformLabel(r.platform)} · {human ? 'confirmed by a person' : SOCIAL_SOURCE_LABEL[r.source as SocialSource] ?? r.source}{why && !human ? ` — ${why}` : ''}</span>
                  <span className="ml-auto inline-flex gap-1">
                    {!(r.is_canonical && conf === 'confirmed') && (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy !== null} onClick={() => void run(`c${r.id}`, { action: 'confirm', profile_id: r.id })}>
                        {busy === `c${r.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}It's them
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground" disabled={busy !== null} onClick={() => void run(`r${r.id}`, { action: 'reject', profile_id: r.id })}>
                      {busy === `r${r.id}` ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <X className="mr-1 h-3 w-3" />}Not them
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      {rejected > 0 && <p className="mt-1.5 text-[11px] text-muted-foreground">{rejected} marked not them (kept, so a later search never brings {rejected === 1 ? 'it' : 'them'} back).</p>}
      <form className="mt-2.5 flex gap-1.5" onSubmit={(e) => {
        e.preventDefault();
        if (!paste.trim()) return;
        void run('add', { action: 'add', url: paste.trim() }, (r) => { setPaste(''); toast({ title: 'Profile saved', description: `${String((r as { saved?: string }).saved ?? 'Profile')} confirmed by you — it now beats any automated match.` }); });
      }}>
        <Input value={paste} onChange={(e) => setPaste(e.target.value)} className="h-8 text-xs" placeholder="Paste a Facebook, Instagram or LinkedIn profile link" aria-label="Paste a profile link" />
        <Button type="submit" size="sm" className="h-8 text-xs" disabled={busy !== null || !paste.trim()}>{busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}</Button>
      </form>
    </section>
  );
}
