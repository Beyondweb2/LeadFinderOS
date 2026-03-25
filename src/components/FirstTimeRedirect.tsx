import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const FIRST_ROUTE_KEY = 'leadfinder_first_route_done';

/**
 * For the "/" route: first-time users go to /outreach, returning users go to /dashboard.
 */
export function FirstTimeRedirect({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [checked, setChecked] = useState(false);
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setChecked(true);
      return;
    }
    const key = `${FIRST_ROUTE_KEY}:${user.id}`;
    const done = localStorage.getItem(key) === 'true';
    if (!done) {
      setIsFirst(true);
      localStorage.setItem(key, 'true');
    }
    setChecked(true);
  }, [user?.id]);

  if (!checked) return null;
  if (isFirst) return <Navigate to="/outreach" replace />;
  return <>{children}</>;
}
