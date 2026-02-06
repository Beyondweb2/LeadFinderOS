import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

const FIRST_LOGIN_KEY = 'leadfinder_first_login_completed';

export function useFirstTimeUser() {
  const { user } = useAuth();
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setHasChecked(true);
      return;
    }

    // Check if this user has completed their first login
    const key = `${FIRST_LOGIN_KEY}_${user.id}`;
    const hasCompletedFirstLogin = localStorage.getItem(key) === 'true';
    
    setIsFirstTime(!hasCompletedFirstLogin);
    setHasChecked(true);
  }, [user?.id]);

  const markFirstLoginComplete = useCallback(() => {
    if (!user?.id) return;
    
    const key = `${FIRST_LOGIN_KEY}_${user.id}`;
    localStorage.setItem(key, 'true');
    setIsFirstTime(false);
  }, [user?.id]);

  return {
    isFirstTime,
    hasChecked,
    markFirstLoginComplete,
  };
}
