// Meta Pixel helper – fires events only when fbq is loaded
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackFBEvent(eventName: string) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', eventName);
    console.log(`[Meta Pixel] Tracked: ${eventName}`);
  }
}

export const trackLead = () => trackFBEvent('Lead');
export const trackStartTrial = () => trackFBEvent('StartTrial');
