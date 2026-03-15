import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { markAdEntryAccess } from '@/lib/adEntryAccess';

/**
 * Sets adEntryAccess flag and redirects to /dashboard.
 * Only rendered on the /ads route.
 */
export default function AdEntryRedirect() {
  const navigate = useNavigate();

  // Set flag synchronously during render so ProtectedRoute sees it immediately
  markAdEntryAccess();

  useEffect(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
}
