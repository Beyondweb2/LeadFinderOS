// Meta Pixel helper – fires events only when fbq is loaded
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackFBEvent(eventName: string, eventId?: string) {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    if (eventId) {
      window.fbq('track', eventName, {}, { eventID: eventId });
    } else {
      window.fbq('track', eventName);
    }
    console.log(`[Meta Pixel] Tracked: ${eventName}${eventId ? ` (eventID: ${eventId})` : ''}`);
  }
}

export const trackLead = () => trackFBEvent('Lead');
export const trackStartTrial = (eventId?: string) => trackFBEvent('StartTrial', eventId);
export const trackCompleteRegistration = () => trackFBEvent('CompleteRegistration');
