/* ════════════════════════════════════════════════════════════════════════════════════════════════
   UNSAVED DRAFTS IN THE LEAD WORKSPACE (final sales release, 2026-10-05).
   The bug: Escape (or a click outside, the X, Previous / Next) closed the lead popup and threw away a
   note the person had typed but not saved — silently.
   The rule: a field holding typed-but-unsaved text MARKS itself (useUnsavedDraft). Every way of LEAVING
   the lead the person did not ask to save through goes through ONE guard (useDraftGuard().guard): nothing
   marked → it happens at once, exactly as before (no prompt when nothing changed); something marked →
   "Discard unsaved changes?" with Keep editing as the default (focused first, and what Escape picks).
   ⛔ A save that closes the popup (Mark paid, Remove from my leads) is not a leave and is not guarded.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
// (useCallback: the guard keeps one identity so the stepper and Radix handlers never go stale.)
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

/** Pure: does leaving now need the person's say-so? Positive match on a marked draft. */
export function leaveNeedsConfirm(dirtyKeys: ReadonlySet<string> | readonly string[]): boolean {
  return (Array.isArray(dirtyKeys) ? dirtyKeys.length : (dirtyKeys as ReadonlySet<string>).size) > 0;
}

/** An input whose own Escape cancels just its edit (business name, a contact field) carries this
 *  attribute; Escape inside it never closes the popup. */
export const ESCAPE_CANCELS_EDIT = 'data-escape-cancels-edit';
export function escapeBelongsToField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(`[${ESCAPE_CANCELS_EDIT}]`);
}

interface DraftRegistry { mark: (key: string, dirty: boolean) => void }

/** Pure ledger behind the hook (tested without a DOM): marks, and the one leave decision. `ask` is called
 *  instead of `go` while anything is marked; `discard` clears the marks and then leaves. */
export function makeDraftLedger() {
  const dirty = new Set<string>();
  return {
    mark: (key: string, d: boolean) => { if (d) dirty.add(key); else dirty.delete(key); },
    dirtyKeys: () => [...dirty],
    leave: (go: () => void, ask: (go: () => void) => void) => { if (leaveNeedsConfirm(dirty)) ask(go); else go(); },
    discard: (go: () => void) => { dirty.clear(); go(); },
  };
}
const DraftContext = createContext<DraftRegistry | null>(null);

/** A field with unsaved text says so while it holds it. Outside a guarded workspace it does nothing. */
export function useUnsavedDraft(key: string, dirty: boolean) {
  const reg = useContext(DraftContext);
  useEffect(() => {
    if (!reg) return;
    reg.mark(key, dirty);
    return () => reg.mark(key, false);
  }, [reg, key, dirty]);
}

/** The owner of the popup: provides the registry, the ONE guard and the confirm dialog. */
export function useDraftGuard() {
  const ledger = useRef(makeDraftLedger()).current;
  const [pending, setPending] = useState<null | { go: () => void }>(null);
  const registry = useMemo<DraftRegistry>(() => ({ mark: ledger.mark }), [ledger]);
  const guard = useCallback((go: () => void) => ledger.leave(go, (g) => setPending({ go: g })), [ledger]);
  const confirm = (
    <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
      <AlertDialogContent className="max-w-sm" data-testid="discard-draft-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>You have typed something on this lead that is not saved yet.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus data-testid="keep-editing">Keep editing</AlertDialogCancel>
          <AlertDialogAction data-testid="discard-draft"
            className={buttonVariants({ variant: 'destructive' })}
            onClick={() => { const p = pending; setPending(null); if (p) ledger.discard(p.go); }}>
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  /* While the prompt shows, the popup underneath must not treat Escape or a click as another "leave" (seen in the
     QA harness: the lead popup took the prompt's Escape and asked again). Escape there = Keep editing. */
  const asking = !!pending;
  const keepEditing = useCallback(() => setPending(null), []);
  return { guard, confirm, registry, asking, keepEditing };
}

/** Wraps the workspace body so its fields can mark their drafts. */
export function DraftRegistryProvider({ registry, children }: { registry: DraftRegistry; children: ReactNode }) {
  return <DraftContext.Provider value={registry}>{children}</DraftContext.Provider>;
}
