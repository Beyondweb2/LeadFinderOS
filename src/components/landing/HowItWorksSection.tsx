import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Search,
  ClipboardList,
  MessageSquare,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const STEPS = [
  {
    icon: Search,
    title: 'Find Leads',
    description: 'Search by business type and location to find companies without websites',
  },
  {
    icon: ClipboardList,
    title: 'Copy Numbers',
    description: 'Add leads to your CRM and bulk-copy phone numbers for outreach',
  },
  {
    icon: MessageSquare,
    title: 'Send Texts',
    description: 'Use a bulk messenger app to reach hundreds of businesses at once',
  },
  {
    icon: CheckCircle,
    title: 'Close Deals',
    description: 'Track interested leads through your pipeline to paid clients',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  return (
    <section className="relative z-10 py-16 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <ScrollReveal className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-6xl mx-auto">
          {STEPS.map((step, index) => (
            <ScrollReveal key={step.title} delay={(index + 1) * 100}>
              <div className="relative group">
                {/* Step number */}
                <div 
                  className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm sm:text-base"
                  style={{ 
                    background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
                    color: 'hsl(220 40% 4%)',
                    boxShadow: '0 0 20px hsl(210 100% 50% / 0.4)'
                  }}
                >
                  {index + 1}
                </div>
                <div 
                  className="relative rounded-2xl p-5 sm:p-6 pt-8 sm:pt-10 text-center h-full backdrop-blur-sm"
                  style={{ 
                    background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.05), hsl(220 80% 45% / 0.02))',
                    border: '1px solid hsl(210 100% 50% / 0.15)'
                  }}
                >
                  <div 
                    className="mx-auto mb-4 p-3 rounded-xl w-fit"
                    style={{ 
                      background: 'hsl(210 100% 50% / 0.1)',
                      border: '1px solid hsl(210 100% 50% / 0.2)'
                    }}
                  >
                    <step.icon className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: 'hsl(210 100% 50%)' }} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-2 tracking-tight">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Link to full guide */}
        <ScrollReveal delay={500} className="text-center mt-10 sm:mt-14">
          <Button variant="outline" size="lg" className="border-white/10 bg-white/[0.03] hover:bg-white/[0.06]" asChild>
            <Link to="/guide">
              View Detailed Guide
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </ScrollReveal>
      </div>
    </section>
  );
};
