import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Sets adEntryAccess session flag and redirects to /find-leads.
 * Only rendered on the /ads route.
 */
export default function AdEntryRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    try {
      sessionStorage.setItem('adEntryAccess', 'true');
    } catch {}
    navigate('/find-leads', { replace: true });
  }, [navigate]);

  return null;
}
