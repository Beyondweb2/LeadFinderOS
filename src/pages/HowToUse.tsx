import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Search,
  ClipboardList,
  MessageSquare,
  CheckCircle,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
} from 'lucide-react';
import step1Search from '@/assets/howto-step1-search.png';
import step2Results from '@/assets/howto-step2-results.png';
import step3Crm from '@/assets/howto-step3-crm.png';
import step4Whatsapp from '@/assets/howto-step4-whatsapp.png';
import step5Bulksend from '@/assets/howto-step5-bulksend.png';
import step6Contacted from '@/assets/howto-step6-contacted.png';
import step7Potential from '@/assets/howto-step7-potential.png';

const STEPS = [
  {
    number: 1,
    icon: Search,
    title: 'Search for Businesses',
    description: 'Enter a business type (e.g., "cafe") and select a location. Use the country and city options to narrow down your search. Set your search radius and click "Search".',
    image: step1Search,
    tip: 'Use specific business types for better results. Try "plumber", "restaurant", "gym", etc.',
  },
  {
    number: 2,
    icon: ClipboardList,
    title: 'Review Search Results',
    description: 'Browse the list of businesses. Green "No Website" badges indicate hot leads - businesses without websites who might need your services. Click "Add to CRM" to save leads you want to contact.',
    image: step2Results,
    tip: 'Focus on businesses with high ratings and many reviews - they\'re established but still need a website.',
  },
  {
    number: 3,
    icon: ClipboardList,
    title: 'Copy Phone Numbers',
    description: 'Go to the Outreach CRM page. Select the businesses you want to contact by clicking the checkboxes, then click "Copy" to copy all selected phone numbers to your clipboard.',
    image: step3Crm,
    tip: 'Having numbers ready makes it easy to cold call or text leads one by one.',
  },
  {
    number: 4,
    icon: MessageSquare,
    title: 'Start Your Outreach',
    description: 'Cold call businesses directly from your list, or send personalised text messages. A direct phone call often gets the best response - introduce yourself and your services.',
    image: step4Whatsapp,
    tip: 'Prepare a short pitch before calling. Keep it friendly and focus on how you can help their business.',
  },
  {
    number: 5,
    icon: MessageSquare,
    title: 'Send Personalised Messages',
    description: 'For text outreach, send individual messages to each lead. A personal touch goes a long way - mention their business name and keep your message short and friendly.',
    image: step5Bulksend,
    tip: 'Something like "Hi! I noticed [Business Name] doesn\'t have a website yet - I\'d love to help!" works well.',
  },
  {
    number: 6,
    icon: CheckCircle,
    title: 'Track Interested Replies',
    description: 'When someone responds positively, go to the "Contacted" page in LeadFinder. Search by their phone number, then click the "Interested" button to move them to your Potential Work pipeline.',
    image: step6Contacted,
    tip: 'Check your messages regularly. Quick responses to interested leads lead to more conversions.',
  },
  {
    number: 7,
    icon: CheckCircle,
    title: 'Manage Your Pipeline',
    description: 'The Potential Work page shows all interested leads. Track their status, add notes, schedule follow-ups, and move them through your sales pipeline until they become paid clients.',
    image: step7Potential,
    tip: 'Set next actions and dates to stay organized. Use notes to remember conversation details.',
  },
];

const HowToUse = () => {
  const location = useLocation();
  // If accessed via /guide (public route), show sign-up CTA
  const isPublicGuide = location.pathname === '/guide';
  
  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8 md:mb-12">
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight mb-3">
          How to Use <span className="text-primary">LeadFinder Pro</span>
        </h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
          Follow this step-by-step guide to find businesses without websites, 
          send bulk messages, and convert responses into paying clients.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-6 md:space-y-8">
        {STEPS.map((step, index) => (
          <div key={step.number}>
            <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-start gap-4">
                  {/* Step number */}
                  <div className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <span className="text-lg md:text-xl font-bold text-primary">{step.number}</span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg md:text-xl flex items-center gap-2 mb-2">
                      <step.icon className="h-5 w-5 text-primary flex-shrink-0" />
                      {step.title}
                    </CardTitle>
                    <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {/* Screenshot */}
                <div className="rounded-lg overflow-hidden border border-border/30 mb-4">
                  <img 
                    src={step.image} 
                    alt={step.title}
                    className="w-full h-auto"
                  />
                </div>
                
                {/* Tip */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-primary text-xs font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5">
                    💡 Tip:
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {step.tip}
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {/* Arrow between steps */}
            {index < STEPS.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowDown className="h-6 w-6 text-muted-foreground/50" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <Card className="mt-8 md:mt-12 border-primary/20 bg-primary/5">
        <CardContent className="py-6 md:py-8">
          <h2 className="text-lg md:text-xl font-semibold mb-3">
            🎉 That's the Complete Workflow!
          </h2>
          <p className="text-muted-foreground text-sm md:text-base mb-4 max-w-2xl">
            You've learned how to find leads, bulk copy their numbers, send messages, 
            and track interested prospects through your sales pipeline. Now start finding your next client!
          </p>
          <div className="flex flex-wrap gap-3">
            {isPublicGuide ? (
              <>
                <Button asChild>
                  <Link to="/auth">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/landing">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Home
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild>
                  <Link to="/">
                    Start Finding Leads
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/templates">
                    View Message Templates
                  </Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HowToUse;
