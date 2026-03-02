import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { LANG_STORAGE_KEY } from '@/i18n';

export type SupportedLanguage = 'en' | 'hi' | 'ur';

export const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string; nativeLabel: string }[] = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { value: 'ur', label: 'Urdu', nativeLabel: 'اردو' },
];

export function useLanguage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [dbLanguage, setDbLanguage] = useState<string | null>(null);

  // On mount / user change: load language from DB, then localStorage, then default
  useEffect(() => {
    let cancelled = false;

    async function loadLanguage() {
      if (user?.id) {
        try {
          const { data } = await supabase
            .from('user_trials')
            .select('preferred_language' as any)
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (!cancelled && data && (data as any).preferred_language) {
            const lang = (data as any).preferred_language as string;
            setDbLanguage(lang);
            i18n.changeLanguage(lang);
            try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {}
            setIsLoading(false);
            return;
          }
        } catch {
          // Fall through to localStorage
        }
      }

      // Fallback to localStorage
      try {
        const stored = localStorage.getItem(LANG_STORAGE_KEY);
        if (stored && !cancelled) {
          i18n.changeLanguage(stored);
        }
      } catch {}

      if (!cancelled) setIsLoading(false);
    }

    loadLanguage();
    return () => { cancelled = true; };
  }, [user?.id, i18n]);

  const changeLanguage = useCallback(async (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {}
    setDbLanguage(lang);

    if (user?.id) {
      // Update DB
      try {
        await supabase.functions.invoke('ensure-trial', {
          body: { action: 'set_language', language: lang },
        });
      } catch {
        // Non-critical
      }
    }
  }, [i18n, user?.id]);

  const needsLanguageSelection = user?.id && !isLoading && !dbLanguage;

  return {
    currentLanguage: i18n.language as SupportedLanguage,
    changeLanguage,
    isLoading,
    needsLanguageSelection,
    LANGUAGE_OPTIONS,
  };
}
