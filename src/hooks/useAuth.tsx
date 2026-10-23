import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** Bounds the sign-in request (see signIn below) so a degraded/unresponsive auth backend
 *  cannot leave the button on "Signing in…" forever. Real observed latency on this project's
 *  token endpoint has ranged 1–35s, so this is a UX bound, not a fast one — long enough that a
 *  slow-but-genuine response usually still wins the race. */
const SIGN_IN_TIMEOUT_MS = 30000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track user ID to prevent unnecessary re-renders on token refresh
  const currentUserIdRef = useRef<string | null>(null);
  // Track whether initial session validation has completed
  const initialValidationDoneRef = useRef(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        const newUserId = newSession?.user?.id ?? null;
        const userChanged = currentUserIdRef.current !== newUserId;

        currentUserIdRef.current = newUserId;
        setSession(newSession);

        if (userChanged || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          setUser(newSession?.user ?? null);
        }

        // Only resolve isLoading from listener AFTER initial validation is done
        // This prevents a stale cached session from briefly setting user before validation
        if (initialValidationDoneRef.current) {
          setIsLoading(false);
        }

        // UTM/affiliate attribution is handled server-side via complete-signup edge function
        // (user_trials RLS blocks client-side updates)
      }
    );

    // Validate any cached session with the server to clear stale tokens automatically
    (async () => {
      try {
        const { data: { session: cachedSession } } = await supabase.auth.getSession();

        if (!cachedSession) {
          // No cached session — user is simply not logged in
          currentUserIdRef.current = null;
          setSession(null);
          setUser(null);
          return;
        }

        // Verify cached session is still valid on the server
        const { data: { user: verifiedUser }, error: verifyError } = await supabase.auth.getUser();

        if (verifyError || !verifiedUser) {
          // Stale/invalid cached session — clear it so sign-in works normally
          await supabase.auth.signOut({ scope: 'local' });
          currentUserIdRef.current = null;
          setSession(null);
          setUser(null);
          return;
        }

        // Valid session — set user state
        currentUserIdRef.current = verifiedUser.id;
        setSession(cachedSession);
        setUser(verifiedUser);
      } catch {
        // Network error during validation — use cached session as fallback
        const { data: { session: fallbackSession } } = await supabase.auth.getSession();
        const userId = fallbackSession?.user?.id ?? null;
        currentUserIdRef.current = userId;
        setSession(fallbackSession);
        setUser(fallbackSession?.user ?? null);
      } finally {
        initialValidationDoneRef.current = true;
        setIsLoading(false);
      }
    })();

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    
    return { error: error as Error | null };
  };

  /* ⛔ signInWithPassword exposes no AbortSignal (GoTrueClient's `_request` takes no cancellation
     token), and the client that calls it is the generated src/integrations/supabase/client.ts —
     not the place to bolt on a custom fetch/abort layer for one call site. So the timeout in
     signIn below can only give UP WAITING; it can never stop the real request, and a late
     success still runs supabase-js's own SIGNED_IN side effect (the onAuthStateChange listener
     above), silently signing the browser in after the user already saw a timeout error. That
     residual risk is accepted, not hidden — see the report this shipped with.
     What IS fully within our control, and is what this ref does: at most one real request is
     ever "abandoned" at a time. It is set for the whole lifetime of the REAL request (not just
     until our timeout gives up) and only clears when that request finally settles — however
     late — so a second signIn() call while one is still outstanding is refused instead of firing
     a second, overlapping request against the same account. */
  const signInRequestRef = useRef<ReturnType<typeof supabase.auth.signInWithPassword> | null>(null);

  const signIn = async (email: string, password: string) => {
    if (signInRequestRef.current) {
      return { error: new Error('A previous sign-in attempt is still finishing. Please wait a moment and try again.') };
    }

    let timedOut = false;
    const request = supabase.auth.signInWithPassword({ email, password });
    signInRequestRef.current = request;
    request
      .then(({ error }) => {
        if (timedOut) console.warn(`[auth] a sign-in request settled after this hook gave up waiting on it (${error ? `error: ${error.message}` : 'it succeeded — the session below is now signed in'})`);
      })
      .catch((err) => {
        if (timedOut) console.warn('[auth] a sign-in request rejected after this hook gave up waiting on it:', err);
      })
      .finally(() => { signInRequestRef.current = null; });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const { error } = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            reject(new Error('Sign-in is taking too long. Please check your connection and try again.'));
          }, SIGN_IN_TIMEOUT_MS);
        }),
      ]);
      return { error: error as Error | null };
    } catch (err) {
      return { error: err as Error };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  const signOut = async () => {
    try { localStorage.removeItem('leadfinder_guest_cap_reached'); } catch {}
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
