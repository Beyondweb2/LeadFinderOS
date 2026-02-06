import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, ArrowLeft } from 'lucide-react';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[400px] opacity-50"
          style={{ background: 'var(--gradient-hero)' }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm bg-background/50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <span className="text-xl font-bold">
              Lead<span className="text-gradient-primary">Finder</span> Pro
            </span>
          </div>
          <Button variant="ghost" asChild>
            <Link to="/landing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 container mx-auto px-4 py-12 max-w-3xl">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-2xl">Terms & Conditions</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-invert max-w-none space-y-6">
            <p className="text-muted-foreground">
              Last updated: {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </p>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">1. Service Description</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                LeadFinder Pro is a lead generation tool that helps users find businesses without websites 
                using publicly available data from Google Maps. The service includes search functionality, 
                CRM features, and contact management tools.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">2. Accuracy Disclaimer</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Important:</strong> The data provided by LeadFinder Pro 
                is sourced from third-party services and AI classification. While we strive for accuracy, 
                we cannot guarantee that all information is 100% accurate or up-to-date. The service may 
                make mistakes in classifying businesses or determining website status.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Users should independently verify business information before making business decisions 
                or initiating contact. We are not liable for any inaccuracies in the data provided.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">3. Acceptable Use</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You agree to use LeadFinder Pro only for lawful business purposes. You must comply with 
                all applicable laws regarding cold calling, marketing communications, and data protection 
                (including GDPR where applicable).
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">4. Subscription & Billing</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Subscriptions are billed monthly. You may cancel at any time through your account settings. 
                Payments are processed securely via Stripe. Refunds are handled on a case-by-case basis.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">5. Limitation of Liability</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                LeadFinder Pro is provided "as is" without warranties of any kind. We are not liable for 
                any indirect, incidental, or consequential damages arising from your use of the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">6. Changes to Terms</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We reserve the right to modify these terms at any time. Continued use of the service 
                after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For questions about these terms, please contact us through the application.
              </p>
            </section>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Terms;
