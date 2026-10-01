import { Helmet } from 'react-helmet-async';
import { OPERATOR_APP_URL } from '@/config/operatorApp';

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  /** Kept for the existing callers. Ignored: every page of this app is noindex (below). */
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

/* ⛔ THE OPERATOR APP IS NEVER INDEXED (2026-10-01). Every route is behind sign-in except /auth
   and /set-password, so there is nothing here a search engine should list. noindex is therefore
   ALWAYS emitted, not left to each caller to remember — and public/_headers sends the same
   X-Robots-Tag on every response, so the instruction is in the HTML before any script runs.
   The canonical names the one production address (src/config/operatorApp.ts). It was the stale
   leadfinderos.pages.dev until 2026-10-01, and leadfinderapp.lovable.app before that. */
export function SEOHead({ title, description, canonical, jsonLd }: SEOHeadProps) {
  const fullCanonical = canonical ? `${OPERATOR_APP_URL}${canonical}` : undefined;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {fullCanonical && <link rel="canonical" href={fullCanonical} />}
      <meta name="robots" content="noindex,nofollow" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      {fullCanonical && <meta property="og:url" content={fullCanonical} />}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
}
