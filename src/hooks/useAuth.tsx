import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Affiliate storage keys
const AFFILIATE_STORAGE_KEY = 'leadfinder_affiliate_code';
const AFFILIATE_EXPIRY_KEY = 'leadfinder_affiliate_expiry';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        
        // On new signup, attach affiliate code if present
        if (event === 'SIGNED_IN' && session?.user) {
          const affiliateCode = getStoredAffiliateCode();
          if (affiliateCode) {
            // Update user_trials with affiliate code (only if not already set)
            const { error } = await supabase
              .from('user_trials')
              .update({ 
                affiliate_code: affiliateCode,
                affiliate_attributed_at: new Date().toISOString()
              })
              .eq('user_id', session.user.id)
              .is('affiliate_code', null);
            
            // Successfully attached affiliate code (logging removed for production)
          }
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
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
