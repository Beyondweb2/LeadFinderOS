import { useParams, Link } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { Button } from '@/components/ui/button';
import { ArrowRight, Search, MapPin, Check } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useLandingTheme } from '@/hooks/useLandingTheme';

const CITY_DATA: Record<string, { display: string; country: string }> = {
  london: { display: 'London', country: 'UK' },
  manchester: { display: 'Manchester', country: 'UK' },
  birmingham: { display: 'Birmingham', country: 'UK' },
  leeds: { display: 'Leeds', country: 'UK' },
  liverpool: { display: 'Liverpool', country: 'UK' },
  bristol: { display: 'Bristol', country: 'UK' },
  edinburgh: { display: 'Edinburgh', country: 'UK' },
  glasgow: { display: 'Glasgow', country: 'UK' },
  cardiff: { display: 'Cardiff', country: 'UK' },
  sheffield: { display: 'Sheffield', country: 'UK' },
  'new-york': { display: 'New York', country: 'US' },
  'los-angeles': { display: 'Los Angeles', country: 'US' },
  chicago: { display: 'Chicago', country: 'US' },
  houston: { display: 'Houston', country: 'US' },
  miami: { display: 'Miami', country: 'US' },
  dallas: { display: 'Dallas', country: 'US' },
  toronto: { display: 'Toronto', country: 'Canada' },
  vancouver: { display: 'Vancouver', country: 'Canada' },
  sydney: { display: 'Sydney', country: 'Australia' },
  melbourne: { display: 'Melbourne', country: 'Australia' },
  dubai: { display: 'Dubai', country: 'UAE' },
  singapore: { display: 'Singapore', country: 'Singapore' },
};

export const CITY_SLUGS = Object.keys(CITY_DATA);

const CityLeads = () => {
  const { city } = useParams<{ city: string }>();
  useLandingTheme();

  const cityInfo = city ? CITY_DATA[city] : null;
  const displayName = cityInfo?.display || city?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Your City';
  const country = cityInfo?.country || '';

  const title = `Find Web Design Clients in ${displayName}`;
  const description = `Discover businesses without websites in ${displayName}${country ? `, ${country}` : ''}. Find leads, contact them via WhatsApp or SMS, and close deals fast.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: `https://leadfinderapp.lovable.app/find-clients/${city}`,
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: 'LeadFinder Pro',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
    },
  };

  const otherCities = CITY_SLUGS.filter(s => s !== city).slice(0, 8);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEOHead title={title} description={description} canonical={`/find-clients/${city}`} jsonLd={jsonLd} />

      <div className="fixed inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -20%, hsl(210 100% 50% / 0.07), transparent 60%)' }} />

      <header className="relative z-20 border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link to="/landing" className="flex items-center gap-2.5">
            <img src={appLogo} alt="LeadFinder Pro" className="h-8 w-8" />
            <span className="text-lg font-bold tracking-tight">LeadFinder Pro</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
              <Link to="/auth?mode=signin">Sign in</Link>
            </Button>
            <Button size="sm" className="btn-premium font-semibold" asChild>
              <Link to="/auth?mode=signup">Try free</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="pt-16 sm:pt-24 pb-12 sm:pb-16 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 text-sm text-primary font-medium mb-4">
              <MapPin className="h-4 w-4" />
              <span>{displayName}{country ? `, ${country}` : ''}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-5">
              Businesses Without Websites{' '}
              <span className="text-primary">in {displayName}</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8">
              Hundreds of businesses in {displayName} still don't have a website. Use LeadFinder Pro to find them instantly, reach out via WhatsApp, SMS or phone, and turn them into paying clients.
            </p>
            <Button size="lg" className="btn-premium font-semibold text-base px-8 py-3.5 h-auto shadow-lg shadow-primary/20" asChild>
              <Link to="/auth?mode=signup">
                Find leads in {displayName}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground/50 mt-3">£19.99/mo · Cancel anytime</p>
          </div>
        </section>

        {/* How it works */}
        <section className="py-12 sm:py-16 px-4">
          <div className="container mx-auto max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
              How to Find Clients in {displayName}
            </h2>
            <div className="space-y-6">
              {[
                { step: '1', title: 'Search your niche', desc: `Type any business type — restaurants, salons, plumbers — and set the location to ${displayName}.` },
                { step: '2', title: 'Find businesses without websites', desc: 'LeadFinder instantly shows which businesses have no website and gives you their phone number.' },
                { step: '3', title: 'Contact and close deals', desc: 'Open WhatsApp or SMS in one click, send your pitch with a ready-made template, and track every follow-up.' },
              ].map(s => (
                <div key={s.step} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-sm flex items-center justify-center">{s.step}</div>
                  <div>
                    <h3 className="font-semibold text-base mb-1">{s.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-12 sm:py-16 px-4 border-t border-border/30">
          <div className="container mx-auto max-w-lg">
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-8">
              Why Freelancers Use LeadFinder in {displayName}
            </h2>
            <ul className="space-y-3">
              {[
                'Find businesses that need websites in seconds',
                'Contact leads via WhatsApp, SMS or phone',
                'Track every conversation and follow-up',
                'Ready-made outreach templates included',
                'Works for web design, SEO, marketing and more',
              ].map(b => (
                <li key={b} className="flex items-center gap-3">
                  <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={3} />
                  <span className="text-sm text-foreground/85">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Other cities */}
        <section className="py-12 sm:py-16 px-4 border-t border-border/30">
          <div className="container mx-auto max-w-2xl">
            <h2 className="text-xl font-bold text-center mb-6">
              Find Clients in Other Cities
            </h2>
            <nav className="flex flex-wrap justify-center gap-2" aria-label="City pages">
              {otherCities.map(slug => {
                const info = CITY_DATA[slug];
                return (
                  <Link
                    key={slug}
                    to={`/find-clients/${slug}`}
                    className="text-sm px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    {info?.display || slug}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-20 px-4">
          <div className="container mx-auto max-w-md text-center">
            <h2 className="text-xl sm:text-2xl font-bold mb-5">Ready to find clients in {displayName}?</h2>
            <Button size="lg" className="btn-premium font-semibold text-base px-8 py-3.5 h-auto shadow-lg shadow-primary/20" asChild>
              <Link to="/auth?mode=signup">
                Subscribe now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground/50 mt-3">£19.99/mo · Cancel anytime</p>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/30 py-8 px-4 text-center">
        <p className="text-xs text-muted-foreground/50">© {new Date().getFullYear()} LeadFinder Pro. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default CityLeads;
