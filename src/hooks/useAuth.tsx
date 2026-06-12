import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';


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

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try { localStorage.removeItem('leadfinder_guest_cap_reached'); } catch {}
    await supabase.auth.signOut();
    window.location.href = '/landing';
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
