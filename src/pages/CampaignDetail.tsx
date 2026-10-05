import { Navigate, useParams } from 'react-router-dom';

/* A campaign has no page of its own since sales workspace v2 (2026-10-05): leads are managed in Outreach.
   Old links (/campaigns/<id>, in sent notifications and bookmarks) open Outreach filtered to that campaign;
   Outreach applies the filter only for a campaign the person may use. */
export default function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  return <Navigate to={campaignId ? `/outreach?campaign=${encodeURIComponent(campaignId)}` : '/campaigns'} replace />;
}
