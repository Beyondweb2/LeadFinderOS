export type BaselineRunProgress = {
  id?: unknown;
  run_number?: unknown;
  status?: unknown;
  queue_total?: number;
  queue_complete?: number;
  [key: string]: unknown;
};

export function attachPersistedQueueProgress(
  runs: BaselineRunProgress[],
  queue: Array<{ run_id: string; status: string | null }>,
): BaselineRunProgress[] {
  const counts = new Map<string, { total: number; complete: number }>();
  for (const row of queue) {
    const current = counts.get(row.run_id) ?? { total: 0, complete: 0 };
    current.total += 1;
    if (row.status === 'done') current.complete += 1;
    counts.set(row.run_id, current);
  }
  return runs.map((run) => {
    const count = counts.get(String(run.id)) ?? { total: 0, complete: 0 };
    return { ...run, queue_total: count.total, queue_complete: count.complete };
  });
}

export function formatBaselineProgress(runs: BaselineRunProgress[], targetRuns = 3): string {
  const byNumber = new Map(runs.map((run) => [Number(run.run_number), run]));
  return Array.from({ length: targetRuns }, (_, index) => {
    const number = index + 1;
    const run = byNumber.get(number);
    if (!run) return `Run ${number}: waiting`;
    const total = Number(run.queue_total) || 0;
    const complete = Number(run.queue_complete) || 0;
    return `Run ${number}: ${total ? `${complete}/${total}` : String(run.status || 'waiting')}`;
  }).join(' · ');
}
