import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>;
}

/* The operator app's real host. Was leadfinderapp.lovable.app, a dead Lovable preview URL, which
   pointed every canonical and og:url tag on the site at a domain that is not this app. See
   functions/_middleware.ts, which states the operator host explicitly. */
const BASE_URL = 'https://leadfinderos.pages.dev';

export function SEOHead({ title, description, canonical, noindex, jsonLd }: SEOHeadProps) {
  const fullCanonical = canonical ? `${BASE_URL}${canonical}` : undefined;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {fullCanonical && <link rel="canonical" href={fullCanonical} />}
      {noindex && <meta name="robots" content="noindex,nofollow" />}
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
