import { Facebook, Instagram } from 'lucide-react';

interface SocialLinksProps {
  /** REAL, verified URLs only (stored enrichment values). Absent → not rendered. */
  facebookUrl?: string;
  instagramUrl?: string;
  /**
   * Visual treatment for the placement:
   *  - 'header'  → bare icons (sit in a nav/contact-bar icon row)
   *  - 'footer'  → bare icons, muted, for the footer row
   * Both are intentionally minimal; templates wrap/position via `className`.
   */
  variant?: 'header' | 'footer';
  className?: string;
}

/**
 * Renders Facebook / Instagram icon links for a generated site — HONESTY: only
 * when a REAL stored URL exists (no fabricated/guessed links, no dead links).
 *
 * Returns null when neither URL is present, so adding <SocialLinks> to a template
 * is byte-identical for every existing site that has no socials (empty render =
 * no DOM, and flex `gap` only applies between rendered children → no layout shift).
 */
export function SocialLinks({ facebookUrl, instagramUrl, variant = 'footer', className }: SocialLinksProps) {
  if (!facebookUrl && !instagramUrl) return null;

  const size = variant === 'header' ? 'h-4 w-4' : 'h-4 w-4';
  const links = [
    facebookUrl ? { key: 'facebook', Icon: Facebook, href: facebookUrl, label: 'Facebook' } : null,
    instagramUrl ? { key: 'instagram', Icon: Instagram, href: instagramUrl, label: 'Instagram' } : null,
  ].filter(Boolean) as { key: string; Icon: typeof Facebook; href: string; label: string }[];

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {links.map(({ key, Icon, href, label }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="inline-grid place-items-center opacity-70 transition-opacity hover:opacity-100"
        >
          <Icon className={size} />
        </a>
      ))}
    </div>
  );
}
