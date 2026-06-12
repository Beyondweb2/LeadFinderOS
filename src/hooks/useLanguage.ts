import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  // Track if user has manually picked a language this session to prevent DB load from overriding
  const userPickedRef = useRef(false);
  const loadedForUserRef = useRef<string | null>(null);

  // On mount / user change: load language from DB, then localStorage, then default
  useEffect(() => {
    let cancelled = false;

    async function loadLanguage() {
      // Don't reload if user already picked, or we already loaded for this user
      if (userPickedRef.current) {
        setIsLoading(false);
        return;
      }
      if (user?.id && loadedForUserRef.current === user.id) {
        setIsLoading(false);
        return;
      }

      // Language preference lives in localStorage (no server-side store)
      try {
        const stored = localStorage.getItem(LANG_STORAGE_KEY);
        if (stored && !cancelled) {
          setDbLanguage(stored);
          await i18n.changeLanguage(stored);
        }
      } catch {}

      if (user?.id) loadedForUserRef.current = user.id;
      if (!cancelled) setIsLoading(false);
    }

    loadLanguage();
    return () => { cancelled = true; };
  }, [user?.id, i18n]);

  const changeLanguage = useCallback(async (lang: SupportedLanguage) => {
    // Mark as user-picked to prevent DB load from overriding
    userPickedRef.current = true;
    
    // Synchronous UI update first
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch {}
    setDbLanguage(lang);
    await i18n.changeLanguage(lang);
  }, [i18n]);

  const needsLanguageSelection = user?.id && !isLoading && !dbLanguage;

  return {
    currentLanguage: (i18n.language || 'en') as SupportedLanguage,
    changeLanguage,
    isLoading,
    needsLanguageSelection,
    LANGUAGE_OPTIONS,
  };
}
