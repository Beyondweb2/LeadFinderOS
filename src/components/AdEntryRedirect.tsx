import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Sets adEntryAccess session flag and redirects to /find-leads.
 * Only rendered on the /ads route.
 */
export default function AdEntryRedirect() {
  const navigate = useNavigate();

  // Set flag synchronously during render so ProtectedRoute sees it immediately
  try {
    sessionStorage.setItem('adEntryAccess', 'true');
  } catch {}

  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
}
