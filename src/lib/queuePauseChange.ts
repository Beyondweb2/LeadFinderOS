/* WHO LAST PAUSED / RESUMED THE WHATSAPP QUEUE, AND WHEN (2026-10-15). The server stores it on whatsapp_outreach_state
   (pause_changed_at / _by / _source) and appends every change to whatsapp_queue_pause_log; this is the one line the
   queue panel says about it. Before 2026-10-15 nothing was recorded, so an older pause says only "not recorded". */

export interface PauseChange {
  at: string | null;
  byUserId: string | null;
  byName: string | null;
  /** 'person' | 'auto' */
  source: string | null;
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export function pauseChangeLine(change: PauseChange | null | undefined, paused: boolean): string | null {
  const verb = paused ? 'Paused' : 'Resumed';
  if (!change?.at) return paused ? 'Paused — who and when was not recorded (before 15 Oct)' : null;
  const at = when(change.at);
  if (change.source === 'auto') return `${verb} automatically ${at}`;
  return `${verb} by ${change.byName ?? 'a team member'} ${at}`;
}
