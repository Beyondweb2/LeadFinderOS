import { useState, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Affiliate storage keys
const AFFILIATE_STORAGE_KEY = 'leadfinder_affiliate_code';
const AFFILIATE_EXPIRY_KEY = 'leadfinder_affiliate_expiry';

// Acquisition tracking storage key (for ads, whatsapp, etc.)
const REF_SOURCE_STORAGE_KEY = 'leadfinder_ref_source';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Get the stored affiliate code if not expired
 */
function getStoredAffiliateCode(): string | null {
  const code = localStorage.getItem(AFFILIATE_STORAGE_KEY);
  const expiry = localStorage.getItem(AFFILIATE_EXPIRY_KEY);
  
  if (!code || !expiry) return null;
  
  const expiryDate = new Date(expiry);
  if (new Date() > expiryDate) {
    localStorage.removeItem(AFFILIATE_STORAGE_KEY);
    localStorage.removeItem(AFFILIATE_EXPIRY_KEY);
    return null;
  }
  
  return code;
}

/**
 * Get and clear the stored ref_source for acquisition tracking
 */
function getAndClearRefSource(): string | null {
  try {
    const refSource = localStorage.getItem(REF_SOURCE_STORAGE_KEY);
    if (refSource) {
      localStorage.removeItem(REF_SOURCE_STORAGE_KEY);
    }
    return refSource;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track user ID to prevent unnecessary re-renders on token refresh
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        const newUserId = newSession?.user?.id ?? null;
        const userChanged = currentUserIdRef.current !== newUserId;
        
        // Only update state if user actually changed (not just token refresh)
        if (userChanged || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          currentUserIdRef.current = newUserId;
          setSession(newSession);
          setUser(newSession?.user ?? null);
        }
        
        setIsLoading(false);
        
        // On new signup, attach affiliate code and ref_source if present
        if (event === 'SIGNED_IN' && newSession?.user) {
          const affiliateCode = getStoredAffiliateCode();
          const refSource = getAndClearRefSource();
          
          // Build update object with only non-null values
          const updateData: Record<string, string> = {};
          if (affiliateCode) {
            updateData.affiliate_code = affiliateCode;
            updateData.affiliate_attributed_at = new Date().toISOString();
          }
          if (refSource) {
            updateData.ref_source = refSource;
          }
          
          // Only update if we have something to set
          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('user_trials')
              .update(updateData)
              .eq('user_id', newSession.user.id)
              .is('affiliate_code', null); // Only if not already attributed
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      const userId = initialSession?.user?.id ?? null;
      currentUserIdRef.current = userId;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

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
    await supabase.auth.signOut();
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
