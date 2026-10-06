/* The app-wide protected-function invoker, bound to the real Supabase client. The logic and its
   reasons live in edgeInvokeCore.ts (pure, testable); this file only supplies the dependencies. */
import { supabase } from '@/integrations/supabase/client';
import { EdgeFunctionError, createEdgeInvoker, edgeErrorMessage as coreEdgeErrorMessage, type EdgeInvokeResult } from './edgeInvokeCore';
import { myReadinessSnapshot, notReadyMessage, onboardingWordsForPausedRefusal } from './readinessWords';

export { EdgeAuthError, EdgeFunctionError, createEdgeInvoker } from './edgeInvokeCore';

/** edgeErrorMessage, plus the real cause for a salesperson whose sales access is restricted (since 2026-10-06 an
 *  account restriction only, never the onboarding checklist): a function answering 'not_ready_to_sell' — or an older
 *  deploy's 'usage_paused' while the person's own server-read status says not ready and not suspended — reads
 *  "Your sales access is not active … Speak to Paul." (readinessWords.notReadyMessage).
 *  Every other refusal keeps its words (readinessWords.ts). */
export function edgeErrorMessage(e: unknown, fallback?: string): string {
  if (e instanceof EdgeFunctionError) {
    if (e.code === 'not_ready_to_sell') { const s = myReadinessSnapshot(); return notReadyMessage(null, s?.missing ?? [], s?.startsOn ?? null); }
    if (e.code === 'usage_paused') { const w = onboardingWordsForPausedRefusal(); if (w) return w; }
  }
  return coreEdgeErrorMessage(e, fallback);
}
export type { EdgeInvokerDeps, EdgeSession, EdgeInvokeResult } from './edgeInvokeCore';

export const invokeEdge = createEdgeInvoker({
  getSession: async () => (await supabase.auth.getSession()).data.session,
  refreshSession: async () => (await supabase.auth.refreshSession()).data.session,
  invoke: (name, options) => supabase.functions.invoke(name, options) as Promise<EdgeInvokeResult>,
  signOutLocal: async () => { await supabase.auth.signOut({ scope: 'local' }); },
});
