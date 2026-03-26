import type { OutreachLead } from '@/types/outreach';
import demoKitchenImage from '@/assets/demo-kitchen-fitters.jpg';

/**
 * 3 realistic example leads shown to new users on the Outreach page.
 * These are client-side only and never persisted to the database.
 * IDs are prefixed with "demo-" to distinguish them.
 */
export const DEMO_LEAD_IDS = ['demo-lead-1', 'demo-lead-2', 'demo-lead-3'];

export function isDemoLead(id: string): boolean {
  return id.startsWith('demo-');
}

// Fixed dates relative to "today" so every new user sees consistent examples
function demoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export function createDemoLeads(userId: string): OutreachLead[] {
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
      next_action_date: futureDate(1),
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: demoDate(2),
      updated_at: demoDate(1),
      is_archived: false,
      is_potential_work: false,
      contact_method: 'facebook_msg',
      outreach_attempts: 1,
      last_outreach_attempt_at: demoDate(1),
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
      next_action_date: futureDate(2),
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: demoDate(2),
      updated_at: demoDate(1),
      is_archived: false,
      is_potential_work: false,
      contact_method: 'sms',
      outreach_attempts: 2,
      last_outreach_attempt_at: demoDate(1),
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
      next_action_date: futureDate(3),
      notes: null,
      country: 'UK',
      list_type: 'no_website',
      created_at: demoDate(2),
      updated_at: demoDate(0),
      is_archived: false,
      is_potential_work: true,
      contact_method: 'whatsapp',
      outreach_attempts: 3,
      last_outreach_attempt_at: demoDate(0),
      image_url: demoKitchenImage,
    },
  ];
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
