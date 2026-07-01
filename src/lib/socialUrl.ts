/**
 * Social-URL detection shared by the Find Leads views and the contact-icon row.
 * Mirrors the backend social denylist (aggregators.ts) so a listing "website" that
 * is really a Facebook/Instagram link is shown with the right icon, never the
 * generic website (Globe) icon.
 */

/** Lowercased registrable host of a URL, minus leading www. '' when unparseable. */
export function domainOf(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Which social network a URL points at — robust to subdomains (m.facebook.com)
 *  and short domains (fb.com, instagr.am). null = a real website / other. */
export function socialKindOf(url?: string | null): 'facebook' | 'instagram' | null {
  const d = domainOf(url);
  if (!d) return null;
  if (d === 'facebook.com' || d.endsWith('.facebook.com') || d === 'fb.com' || d === 'fb.me' || d === 'fb.watch' || d === 'm.me') return 'facebook';
  if (d === 'instagram.com' || d.endsWith('.instagram.com') || d === 'instagr.am') return 'instagram';
  return null;
}
