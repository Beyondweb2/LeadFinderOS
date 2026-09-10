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

  /* 🔴 THE BUTTON USED TO SAY ONE THING AND DO ANOTHER. It rendered "Back to AI Audit" and then
     ran `window.history.length > 1 ? navigate(-1) : navigate(target)` — so in any real session,
     where history is essentially always longer than one entry, it ignored `target` completely
     and did a plain browser Back. That lands on the PREVIOUS PAGE, which is only the named
     destination when you arrived by exactly one hop. Paul, 2026-09-10: "back to ai audit page
     doesn't take back to ai audit page." It was doing what it was written to do; the label was
     a promise the code never read.

     ⛔ THE RULE: WHEN WE KNOW WHERE THE LABEL POINTS, GO THERE. `state.from` is set by the link
     that sent us here, so it is not a guess — it is the caller stating the destination, and the
     label is rendered from the same object. History-back survives only for the case the label
     is also vague about: no state at all, i.e. a pasted URL or a fresh tab, where the fallback
     is the honest best guess and going back one step is usually what a person means.
     ⚠️ `window.history.length` was never the right test either — it counts the whole tab's
     session, including a sign-in redirect, so it is > 1 on a page you arrived at directly. */
  /* 🔴 AND THE HISTORY FALLBACK WAS THE LOOP. Paul, 2026-09-10: "each back button just loops
     around." With no state, `navigate(-1)` returns you to THE PAGE YOU JUST CAME FROM — and
     when that page's own back link brings you here again, the two pages bounce forever. It is
     a real cycle in this app: /baseline has "Before and after" → /compare, and /compare has
     "← Baseline" → /baseline. Neither passed router state, so the chain from AI Audit was lost
     at the first hop and Baseline's back link fell through to history, i.e. straight back to
     Compare.

     ⛔ SO: NO STATE MEANS GO TO THE FALLBACK, NEVER BACKWARDS. The fallback is a real place
     that cannot cycle. History-back is only ever right when we know the previous entry is the
     one the label names, and if we knew that we would have state. A pasted URL or a bookmark
     lands on the fallback, which is the honest answer for "I don't know where you came from".
     ⚠️ The other half of the fix is that the Baseline↔Compare links now PASS the state through,
     so the chain survives and this fallback is rarely reached at all. */
  const go = () => navigate(state.from ?? fallback);

  return (
    <button
      type="button"
      onClick={go}
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to {label}
    </button>
  );
}
