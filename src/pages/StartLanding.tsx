import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Star, Check, MessageSquare } from 'lucide-react';
import appLogo from '@/assets/logo.png';

// Reuse existing app screenshots (not removing from landing)
import searchResults from '@/assets/howto-step2-results.png';
import whatsappTemplate from '@/assets/howto-step3-whatsapp-dialog.png';
import crmTracking from '@/assets/howto-step3-crm.png';

export default function StartLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/start" className="flex items-center gap-2">
            <img src={appLogo} alt="LeadFinder" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-lg">LeadFinder</span>
          </Link>
          <Link to="/auth">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 sm:py-24 px-4">
        <div className="container max-w-2xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            Try LeadFinder free
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Find businesses without websites, open WhatsApp or SMS instantly with templates, and track every step of your outreach in one clear system.
          </p>
          <Link to="/auth?intent=signup">
            <Button size="lg" className="text-base px-8 py-6 rounded-xl font-semibold">
              Create free account
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            No card required · Full access · Takes 30 seconds
          </p>
        </div>
      </section>

      {/* Product Preview */}
      <section className="py-14 px-4 bg-muted/30">
        <div className="container max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
            See how it works
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { src: searchResults, alt: 'Search results showing businesses without websites' },
              { src: whatsappTemplate, alt: 'WhatsApp message template ready to send' },
              { src: crmTracking, alt: 'CRM tracking view of outreach progress' },
            ].map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-border shadow-sm bg-card">
                <img src={img.src} alt={img.alt} className="w-full h-auto" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-14 px-4">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Trusted by freelancers and agencies
          </h2>
          <div className="flex justify-center gap-1 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-6 w-6 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <blockquote className="text-muted-foreground italic text-base sm:text-lg mb-3">
            "Cut my prospecting time in half. Everything finally feels organised."
          </blockquote>
          <p className="text-sm font-medium">– Alex M., WordPress Freelancer</p>
        </div>
      </section>

      {/* Trust */}
      <section className="py-14 px-4 bg-muted/30">
        <div className="container max-w-xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            No risk. No pressure.
          </h2>
          <ul className="space-y-3 text-left inline-block mb-8">
            {[
              'No card required to start',
              'Upgrade only when you want unlimited searches',
              'Cancel anytime',
              'Real human support via WhatsApp',
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm sm:text-base">
                <Check className="h-5 w-5 text-green-500 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div>
            <a
              href="https://wa.me/message/NFDUORBWYJZOA1"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="gap-2 border-green-500 text-green-600 hover:bg-green-50">
                <MessageSquare className="h-4 w-4" />
                Message us on WhatsApp
              </Button>
            </a>
            <p className="text-xs text-muted-foreground mt-2">
              We usually reply within minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 sm:py-24 px-4">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">
            Ready to try it?
          </h2>
          <Link to="/auth?intent=signup">
            <Button size="lg" className="text-base px-8 py-6 rounded-xl font-semibold">
              Create free account
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground mt-3">
            No card required · Full access
          </p>
        </div>
      </section>
    </div>
  );
}
