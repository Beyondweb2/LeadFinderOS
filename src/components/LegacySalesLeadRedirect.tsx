import { Navigate, useParams } from 'react-router-dom';
import { outreachLeadLink } from '@/lib/salesLinks';

/* An old /sales/lead/:id link (the retired My Leads lead page, 2026-09-27) opens THAT lead in the
 * normal Outreach workflow — the same `launch` intent the Manage page uses, so the lead's detail
 * opens once the list has it. Nothing is fetched here: Outreach reads the lead through the caller's
 * own permissions, so a lead that is not theirs simply is not in the list. */
export function LegacySalesLeadRedirect() {
  const { leadId } = useParams();
  if (!leadId) return <Navigate to="/outreach" replace />;
  return <Navigate to={outreachLeadLink(leadId)} replace />;
}
