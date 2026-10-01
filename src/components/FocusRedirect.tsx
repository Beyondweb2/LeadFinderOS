import { Navigate, useLocation } from 'react-router-dom';
import { outreachLeadLink } from '@/lib/salesLinks';

/** /focus (retired 2026-10-01) → Outreach. A bookmarked /focus?lead=<id> opens that lead's popup there. */
export function FocusRedirect() {
  const lead = new URLSearchParams(useLocation().search).get('lead');
  return <Navigate to={lead ? outreachLeadLink(lead) : '/outreach'} replace />;
}
