import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { readFunctionError } from '@/lib/functionError';

// Server-side bulk jobs (bulk enrich / bulk site-gen). The job runs entirely in
// the bulk-jobs edge function (chunked + self-re-invoking + cron-healed), so the
// operator can leave the page or close the browser mid-run. This hook only:
//   * creates/cancels jobs via the edge function, and
//   * READS progress from the bulk_jobs table (RLS: own rows), polling every ~4s
//     ONLY while a job is active, and
//   * on mount, resumes: surfaces a live job's progress, or a recently-finished
//     job (last 10 min) as a "finished while you were away" summary.

// bulk_jobs isn't in the generated types yet — RLS still enforces access.
const sb = supabase as unknown as { from: (t: string) => any; functions: typeof supabase.functions };

export type BulkJobType = 'enrich' | 'audit' | 'audit_and_push';

export interface BulkJob {
  id: string;
  job_type: BulkJobType;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** Per-item state (drives per-row spinners). 'running' = currently generating.
   *  `phase` is audit_and_push only: 'audit' while the lead still needs measuring, 'push' once it
   *  is ready to send. It is what lets the progress line say WHICH half is running rather than a
   *  bare fraction that stalls for nine minutes with no explanation. */
  items?: { lead_id: string; status: string; phase?: 'audit' | 'push' }[];
}

const RECENT_WINDOW_MS = 10 * 60 * 1000;
const POLL_MS = 4000;

export function useBulkJobs(onJobComplete?: (job: BulkJob) => void) {
  const { user } = useAuth();
  const [activeJob, setActiveJob] = useState<BulkJob | null>(null);
  const [recentJob, setRecentJob] = useState<BulkJob | null>(null);
  const [creating, setCreating] = useState(false);
  // Job ids we've seen active this session → detect the active→done transition
  // so the caller can refetch leads/sites exactly once per job.
  const watchedRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Set<string>>(new Set());
  const onCompleteRef = useRef(onJobComplete);
  onCompleteRef.current = onJobComplete;

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    const { data } = await sb
      .from('bulk_jobs')
      .select('id, job_type, status, total, done_count, failed_count, skipped_count, error, created_at, updated_at, items')
      .order('created_at', { ascending: false })
      .limit(5);
    const jobs = (data ?? []) as BulkJob[];
    const active = jobs.find((j) => j.status === 'queued' || j.status === 'running') ?? null;
    setActiveJob(active);
    if (active) {
      watchedRef.current.add(active.id);
      setRecentJob(null);
      return;
    }
    // No active job: surface the newest finished one — either one we watched go
    // active→done this session, or (resume case) one that finished recently
    // while the user was away. Dismissals stick for the session.
    const finished = jobs.find(
      (j) =>
        (j.status === 'done' || j.status === 'failed' || j.status === 'cancelled') &&
        !dismissedRef.current.has(j.id) &&
        (watchedRef.current.has(j.id) || Date.now() - new Date(j.updated_at).getTime() < RECENT_WINDOW_MS),
    ) ?? null;
    if (finished && watchedRef.current.has(finished.id)) {
      watchedRef.current.delete(finished.id);
      onCompleteRef.current?.(finished); // watched job just completed → refetch
    }
    setRecentJob(finished);
  }, [user]);

  // Resume on mount / user change.
  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Poll ONLY while a job is active.
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(fetchJobs, POLL_MS);
    return () => clearInterval(t);
  }, [activeJob?.id, fetchJobs]);

  const createJob = useCallback(async (
    jobType: BulkJobType,
    leadIds: string[],
    params?: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (creating) return { ok: false, error: 'busy' };
    setCreating(true);
    try {
      const { data, error } = await sb.functions.invoke('bulk-jobs', {
        body: { action: 'create', job_type: jobType, lead_ids: leadIds, params: params ?? null },
      });
      /* 🔴 THE REAL MESSAGE, NOT THE WRAPPER — and this line is why a 200-lead push read as
         "edge function error" on 2026-09-09 with nobody able to say what had gone wrong.
         supabase-js sets `error` on ANY non-2xx and its `.message` is always the same useless
         "Edge Function returned a non-2xx status code"; every refusal bulk-jobs states carefully
         ("already in Instantly", "nothing to do", "how many to send must be a whole number") was
         being thrown away here and replaced with that sentence. Fourth hand-rolled instance of the
         same gap — see src/lib/functionError.ts. */
      if (error) return { ok: false, error: await readFunctionError(error) };
      if (!data?.ok) return { ok: false, error: data?.error ?? 'create failed' };
      await fetchJobs();
      return { ok: true };
    } finally {
      setCreating(false);
    }
  }, [creating, fetchJobs]);

  const cancelJob = useCallback(async (jobId: string) => {
    await sb.functions.invoke('bulk-jobs', { body: { action: 'cancel', job_id: jobId } });
    await fetchJobs();
  }, [fetchJobs]);

  const dismissRecent = useCallback(() => {
    if (recentJob) dismissedRef.current.add(recentJob.id);
    setRecentJob(null);
  }, [recentJob]);

  return { activeJob, recentJob, creating, createJob, cancelJob, dismissRecent, refetchJobs: fetchJobs };
}
