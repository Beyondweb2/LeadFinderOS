/* create-ai-audit through invokeEdge (CLAUDE.md: protected calls go through invokeEdge) — v1-audits-always-finish, 2026-11-18.
   The same { data, error } shape the old supabase.functions.invoke calls read, but a refusal now carries the server's own
   sentence ("This lead already has several hook audits today …", "The prospecting budget is used …") instead of
   "Edge Function returned a non-2xx status code", which is all a rep saw on 18 Nov. */
import { invokeEdge, edgeErrorMessage } from './edgeInvoke';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers read the server's loose JSON, as before
export type CreateAuditData = any;

export async function invokeCreateAudit(opts: { body: Record<string, unknown> }): Promise<{ data: CreateAuditData; error: { message: string } | null }> {
  try {
    return { data: await invokeEdge<CreateAuditData>('create-ai-audit', opts.body), error: null };
  } catch (e) {
    return { data: null, error: { message: edgeErrorMessage(e, 'The audit could not be started. Try again.') } };
  }
}
