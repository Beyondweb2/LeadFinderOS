import type { OutreachLead } from '@/types/outreach';

/**
 * Calculate a lead score based on various factors (0-100)
 * Higher scores indicate more promising leads
 */
export function calculateLeadScore(lead: OutreachLead): number {
  let score = 50; // Base score
  
  // Rating factor (0-15 points)
  // Note: We don't have rating on OutreachLead, so skip this
  
  // Has phone number (+15 points)
  if (lead.phone) {
    score += 15;
  }
  
  // Has email (+10 points)
  if (lead.email) {
    score += 10;
  }
  
  // Has Google Maps URL (+5 points) - indicates verified business
  if (lead.google_maps_url) {
    score += 5;
  }
  
  // Has address (+5 points) - easier to verify/visit
  if (lead.address) {
    score += 5;
  }
  
  // Has notes (+5 points) - shows engagement
  if (lead.notes && lead.notes.length > 10) {
    score += 5;
  }
  
  // Category bonus - certain categories are higher value
  const highValueCategories = [
    'restaurant', 'cafe', 'bar', 'hotel', 'gym', 'salon', 
    'dentist', 'doctor', 'lawyer', 'accountant', 'real estate',
    'contractor', 'plumber', 'electrician', 'auto repair'
  ];
  
  if (lead.category) {
    const categoryLower = lead.category.toLowerCase();
    if (highValueCategories.some(cat => categoryLower.includes(cat))) {
      score += 10;
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Get score label/color based on score value
 */
export function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Hot', color: 'text-status-hot' };
  if (score >= 60) return { label: 'Warm', color: 'text-yellow-500' };
  if (score >= 40) return { label: 'Cool', color: 'text-blue-500' };
  return { label: 'Cold', color: 'text-muted-foreground' };
}

/**
 * Format phone for WhatsApp link (digits only, with country code)
 */
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digits except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Remove leading + if present (WhatsApp expects digits only)
  cleaned = cleaned.replace(/^\+/, '');
  
  // If it starts with 0 (local format), try to add country code
  // Default to UK (+44) if starts with 0
  if (cleaned.startsWith('0')) {
    cleaned = '44' + cleaned.slice(1);
  }
  
  return cleaned;
}

/**
 * Generate WhatsApp web URL with pre-filled message
 */
export function generateWhatsAppUrl(phone: string, message: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
}

/**
 * Generate SMS URL with pre-filled message
 * Uses sms: protocol which opens the default SMS app
 */
export function generateSMSUrl(phone: string, message: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone); // Same phone formatting
  const encodedMessage = encodeURIComponent(message);
  // Different devices use different separators: 
  // iOS uses &body=, Android uses ?body=
  // Using & works on most modern devices
  return `sms:+${formattedPhone}?body=${encodedMessage}`;
}

// Business-name placeholder. Matches any reasonable form a saved template might
// use — {{business_name}}, {{Business name}}, {{ business name }}, {{BusinessName}}
// — case-insensitive, with a space, underscore, or nothing between the words.
// Deliberately does NOT match the separate {{name}} token. A fresh RegExp is
// built per call so the global `lastIndex` can never leak between test/replace.
const BUSINESS_NAME_TOKEN = '\\{\\{\\s*business[\\s_]*name\\s*\\}\\}';

/** True if the template contains a business-name placeholder in any form. */
export function hasBusinessNameToken(template: string): boolean {
  return new RegExp(BUSINESS_NAME_TOKEN, 'i').test(template);
}

/** Replace every business-name placeholder (any form) with the real name. */
export function fillBusinessName(template: string, businessName: string): string {
  return template.replace(new RegExp(BUSINESS_NAME_TOKEN, 'gi'), businessName);
}

// Share-link placeholder: {{link}}, {{Link}}, {{share link}}, {{share_link}},
// {{sharelink}} — case-insensitive. The barber's /s/ link substitutes in.
const LINK_TOKEN = '\\{\\{\\s*(?:share[\\s_]*)?link\\s*\\}\\}';

/** True if the template contains a share-link placeholder in any form. */
export function hasLinkToken(template: string): boolean {
  return new RegExp(LINK_TOKEN, 'i').test(template);
}

/**
 * Fill a message template's tokens. Business name is always substituted (tolerant);
 * the share link is substituted only when provided (otherwise {{link}} is left as-is
 * so an empty link never injects a broken URL).
 */
export function fillTemplate(
  template: string,
  vars: { businessName?: string | null; link?: string | null },
): string {
  let out = template;
  if (vars.businessName != null) out = fillBusinessName(out, vars.businessName);
  if (vars.link) out = out.replace(new RegExp(LINK_TOKEN, 'gi'), vars.link);
  return out;
}

/**
 * Open WhatsApp for multiple leads (opens first, queues rest)
 */
export function openBulkWhatsApp(
  leads: Array<{ phone: string; business_name: string }>,
  messageTemplate: string
): void {
  if (leads.length === 0) return;

  // Open first lead immediately
  const firstLead = leads[0];
  const message = fillBusinessName(messageTemplate, firstLead.business_name);
  const url = generateWhatsAppUrl(firstLead.phone, message);
  window.open(url, '_blank');
  
  // If more than 1, notify user to click again for next
  // We can't auto-open multiple tabs due to browser restrictions
}

/**
 * Check if a lead might be a duplicate of existing leads
 */
export function findPotentialDuplicates(
  newLead: { business_name: string; phone?: string; google_maps_url?: string },
  existingLeads: OutreachLead[]
): OutreachLead[] {
  const duplicates: OutreachLead[] = [];
  
  const normalizedNewName = newLead.business_name.toLowerCase().trim();
  const newPhone = newLead.phone?.replace(/\D/g, '');
  
  for (const existing of existingLeads) {
    let isDuplicate = false;
    
    // Exact name match
    if (existing.business_name.toLowerCase().trim() === normalizedNewName) {
      isDuplicate = true;
    }
    
    // Same Google Maps URL
    if (newLead.google_maps_url && existing.google_maps_url === newLead.google_maps_url) {
      isDuplicate = true;
    }
    
    // Same phone number
    if (newPhone && existing.phone) {
      const existingPhone = existing.phone.replace(/\D/g, '');
      if (newPhone === existingPhone || 
          (newPhone.length > 6 && existingPhone.includes(newPhone)) ||
          (existingPhone.length > 6 && newPhone.includes(existingPhone))) {
        isDuplicate = true;
      }
    }
    
    if (isDuplicate) {
      duplicates.push(existing);
    }
  }
  
  return duplicates;
}

/**
 * Parse CSV content into lead objects
 */
export function parseCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // Parse header row
  const headers = parseCSVRow(lines[0]);
  
  // Parse data rows
  const data: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    if (values.length === 0) continue;
    
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].toLowerCase().trim()] = values[j]?.trim() || '';
    }
    data.push(row);
  }
  
  return data;
}

/**
 * Parse a single CSV row (handles quoted values)
 */
function parseCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

/**
 * Map CSV columns to lead fields
 */
export function mapCSVToLead(
  row: Record<string, string>
): Partial<OutreachLead> | null {
  // Try to find business name from various column names
  const businessName = 
    row['business_name'] || row['businessname'] || row['name'] || 
    row['company'] || row['business'] || row['company_name'];
  
  if (!businessName) return null;
  
  return {
    business_name: businessName,
    phone: row['phone'] || row['telephone'] || row['tel'] || row['mobile'] || '',
    email: row['email'] || row['e-mail'] || '',
    address: row['address'] || row['location'] || '',
    google_maps_url: row['google_maps_url'] || row['maps_url'] || row['googlemapsurl'] || '',
    category: row['category'] || row['type'] || row['industry'] || '',
    notes: row['notes'] || row['note'] || row['comments'] || '',
  };
}
