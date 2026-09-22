/* The app-wide protected-function invoker, bound to the real Supabase client. The logic and its
   reasons live in edgeInvokeCore.ts (pure, testable); this file only supplies the dependencies. */
import { supabase } from '@/integrations/supabase/client';
import { createEdgeInvoker, type EdgeInvokeResult } from './edgeInvokeCore';

export { EdgeAuthError, EdgeFunctionError, createEdgeInvoker, edgeErrorMessage } from './edgeInvokeCore';
export type { EdgeInvokerDeps, EdgeSession, EdgeInvokeResult } from './edgeInvokeCore';

export const invokeEdge = createEdgeInvoker({
  getSession: async () => (await supabase.auth.getSession()).data.session,
  refreshSession: async () => (await supabase.auth.refreshSession()).data.session,
  invoke: (name, options) => supabase.functions.invoke(name, options) as Promise<EdgeInvokeResult>,
  signOutLocal: async () => { await supabase.auth.signOut({ scope: 'local' }); },
});
