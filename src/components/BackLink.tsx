import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * BACK NAVIGATION for the two operator detail views — /playbook/:id and /baseline/:auditId.
 *
 * There was no house pattern to copy: /baseline/:auditId had no back link at all in its success
 * state, only one in its error branch. The five Admin pages all do
 * `history.length > 1 ? navigate(-1) : navigate(fallback)`, so that is the shape used here — the
 * browser's own back stack does the work, and a fresh tab or a pasted URL still has somewhere to go.
 *
 * ONE COMPONENT, BOTH PAGES, deliberately. Two copies would drift, and the whole point of the brief
 * was that these two views should behave the same way.
 *
 * The LABEL comes from router `state` set by whichever row or dialog linked here, so the operator is
 * told where they are going back TO rather than a generic "Back". Absent when the URL was typed or
 * bookmarked, hence the fallback.
 *
 * KNOWN LIMIT, accepted: coming from the lead detail dialog returns you to the Outreach LIST, not to
 * the reopened dialog. The dialog's open state is component state in OutreachTable, not in the URL,
 * so there is nothing for a back navigation to restore. Making it URL-addressable is a bigger change
 * than this is worth.
 */

/** Set via `<Link state={...}>` by every entry point. */
export interface BackNavState {
  /** Path to fall back to when there is no history to pop (fresh tab, pasted URL). */
  from?: string;
  /** Human name of where we came from, e.g. "Outreach". */
  fromLabel?: string;
}

export function BackLink({
  fallback = '/ai-audit',
  fallbackLabel = 'AI Audit',
  className = '',
}: {
  fallback?: string;
  fallbackLabel?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as BackNavState;
  const target = state.from ?? fallback;
  const label = state.fromLabel ?? fallbackLabel;
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(target))}
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to {label}
    </button>
  );
}
