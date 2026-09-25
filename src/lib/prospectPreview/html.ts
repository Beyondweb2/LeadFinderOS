/* PROSPECT PREVIEW — HTML helpers shared by the templates and the evidence card. Pure. */

import type { IconName } from './trades.ts';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** An http(s) URL for an attribute, or '' — never javascript:, never data: from outside. */
export function safeHref(u: string | null | undefined): string {
  const v = (u ?? '').trim();
  return /^https?:\/\//i.test(v) ? esc(v) : '';
}

export function telHref(phone: string): string {
  const d = phone.replace(/[^\d+]/g, '');
  return d ? `tel:${esc(d)}` : '';
}

const PATHS: Record<IconName, string> = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  plug: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4',
  light: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  drop: 'M12 2.7C8 7.5 6 11 6 14a6 6 0 0 0 12 0c0-3-2-6.5-6-11.3z',
  flame: 'M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1.2 3 2.5 3-1-3 0-6 0-9z',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v4h3v-2h2v2h3.1A4 4 0 0 1 15 7zM17 11h.01',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  home: 'M3 11 12 3l9 8M5 10v10h14V10M10 20v-6h4v6',
  roof: 'M2 12 12 4l10 8M6 10v10h12V10',
  hammer: 'M14 4l6 6-3 3-6-6zM11 7 3 15l3 3 8-8',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
  car: 'M5 16h14M6 16v2M18 16v2M4 16l2-6h12l2 6v-1H4zM8 13h.01M16 13h.01',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  check: 'M4 12.5 9 17.5 20 6.5',
  default: 'M4 12.5 9 17.5 20 6.5',
};

export function icon(name: IconName | 'phone' | 'mail' | 'pin' | 'clock' | 'star' | 'arrow' | 'x' | 'alert', size = 24, stroke = 'currentColor'): string {
  const extra: Record<string, string> = {
    phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
    mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
    pin: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    star: 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    x: 'M6 6l12 12M18 6 6 18',
    alert: 'M12 8v5M12 16.5h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  };
  const d = (PATHS as Record<string, string>)[name] ?? extra[name] ?? PATHS.default;
  const fill = name === 'star' ? stroke : 'none';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export const FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">';

export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
