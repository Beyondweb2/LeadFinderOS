import type { OutreachLead } from '@/types/outreach';

/**
 * 3 realistic example leads shown to new users on the Outreach page,
 * plus 1 tracked lead for the Track Leads page.
 * These are client-side only and never persisted to the database.
 * IDs are prefixed with "demo-" to distinguish them.
 */
export const DEMO_LEAD_IDS = ['demo-lead-1', 'demo-lead-2', 'demo-lead-3', 'demo-lead-tracked'];

export function isDemoLead(id: string): boolean {
  return id.startsWith('demo-');
}

export function createDemoLeads(userId: string): OutreachLead[] {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return [
    {
      id: 'demo-lead-1',
      user_id: userId,
      business_name: 'Brighton Roofing Co.',
      phone: '+44 7700 912 345',
      email: null,
      google_maps_url: null,
      address: '14 Marine Parade, Brighton BN2 1TL',
      category: 'Roofing',
      status: 'waiting',
      next_action: 'send_follow_up',
      next_action_date: null,
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: twoDaysAgo,
      updated_at: yesterday,
      is_archived: false,
      is_potential_work: false,
      contact_method: 'facebook_msg',
      outreach_attempts: 1,
      last_outreach_attempt_at: yesterday,
    },
    {
      id: 'demo-lead-2',
      user_id: userId,
      business_name: 'Elmwood Gardening Services',
      phone: '+44 7911 234 567',
      email: null,
      google_maps_url: null,
      address: '8 Oak Lane, Leeds LS6 2PQ',
      category: 'Landscaping',
      status: 'contacted',
      next_action: 'call',
      next_action_date: null,
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: twoDaysAgo,
      updated_at: yesterday,
      is_archived: false,
      is_potential_work: false,
      contact_method: 'sms',
      outreach_attempts: 2,
      last_outreach_attempt_at: yesterday,
    },
    {
      id: 'demo-lead-3',
      user_id: userId,
      business_name: 'Hartfield Kitchen Fitters',
      phone: '+44 7456 789 012',
      email: null,
      google_maps_url: null,
      address: '22 Station Road, Manchester M1 4JN',
      category: 'Kitchen Fitting',
      status: 'replied',
      next_action: 'send_follow_up',
      next_action_date: null,
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: twoDaysAgo,
      updated_at: now,
      is_archived: false,
      is_potential_work: true,
      contact_method: 'whatsapp',
      outreach_attempts: 3,
      last_outreach_attempt_at: now,
    },
  ];
}

/**
 * Rich demo tracked lead shown on the Track Leads page for new users.
 */
export function createDemoTrackedLead(userId: string): OutreachLead {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return {
    id: 'demo-lead-tracked',
    user_id: userId,
    business_name: 'Greenfield Plumbing & Heating',
    phone: '+44 7890 123 456',
    email: 'info@greenfieldplumbing.co.uk',
    google_maps_url: null,
    address: '45 Church Street, Bristol BS1 3NE',
    category: 'Plumbing & Heating',
    status: 'interested' as const,
    next_action: 'send_draft' as const,
    next_action_date: tomorrow,
    notes: 'Spoke with Dave — interested in a 5-page website with booking form. Wants to see a draft by Friday. Budget around £800.',
    country: 'UK' as const,
    list_type: 'no_website' as const,
    created_at: twoDaysAgo,
    updated_at: now,
    is_archived: false,
    is_potential_work: true,
    contact_method: 'whatsapp',
    outreach_attempts: 3,
    last_outreach_attempt_at: yesterday,
    potential_revenue: 800,
    services_included: ['Website Design', 'Hosting', 'SEO'],
    project_overview: '5-page brochure website with online booking form',
    project_status: 'not_started',
    contact_name: 'Dave Greenfield',
  };
}

const DEMO_DISMISSED_KEY = 'leadfinder_demo_leads_dismissed';

export function isDemoDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(`${DEMO_DISMISSED_KEY}:${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function dismissDemoLeads(userId: string) {
  try {
    localStorage.setItem(`${DEMO_DISMISSED_KEY}:${userId}`, 'true');
  } catch {}
}
