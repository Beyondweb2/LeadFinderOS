import { supabase } from '@/integrations/supabase/client';

function generateErrorId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface ErrorDiagnostics {
  functionName: string;
  payload?: Record<string, unknown>;
  userId?: string | null;
  httpStatus?: number | null;
  responseBody?: string | null;
  errorMessage?: string;
  errorStack?: string;
  extra?: Record<string, unknown>;
}

export async function reportClientError(diagnostics: ErrorDiagnostics): Promise<string> {
  const errorId = generateErrorId();

  // Redact sensitive fields from payload
  const safePayload = diagnostics.payload ? { ...diagnostics.payload } : undefined;
  if (safePayload) {
    for (const key of ['password', 'token', 'secret', 'access_token', 'authorization']) {
      if (key in safePayload) safePayload[key] = '[REDACTED]';
    }
  }

  const context = {
    function_name: diagnostics.functionName,
    payload: safePayload,
    user_id: diagnostics.userId,
    timestamp: new Date().toISOString(),
    device: navigator.userAgent,
    origin: window.location.origin,
    pathname: window.location.pathname,
    http_status: diagnostics.httpStatus ?? null,
    response_body: diagnostics.responseBody?.slice(0, 4000) ?? null,
    error_message: diagnostics.errorMessage ?? null,
    error_stack: diagnostics.errorStack?.slice(0, 2000) ?? null,
    ...diagnostics.extra,
  };

  console.error(`[ClientError:${errorId}]`, context);

  try {
    await supabase.from('client_error_reports' as any).insert({
      error_id: errorId,
      user_id: diagnostics.userId ?? null,
      context,
    });
  } catch (e) {
    console.error('[ClientError] Failed to save error report:', e);
  }

  return errorId;
}
