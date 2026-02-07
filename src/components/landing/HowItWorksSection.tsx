import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Search,
  ClipboardList,
  MessageSquare,
  Users,
  ArrowRight,
} from 'lucide-react';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-bulksender.png';
import step4Image from '@/assets/howto-step4-track.png';

const STEPS = [
  {
    icon: Search,
    title: 'Find Leads',
    description: 'Search by business type and location to find companies without websites',
    image: step1Image,
    badge: '20+ Countries',
  },
  {
    icon: ClipboardList,
    title: 'View Lead Details',
    description: 'See business names, phone numbers, ratings, reviews, addresses, and direct Google Maps links. Filter by classification, check for websites, and add promising leads to your CRM.',
    image: step2Image,
    badge: '10+ Data Points',
  },
  {
    icon: MessageSquare,
    title: 'Copy Numbers & Send',
    description: 'Bulk-copy phone numbers in one click to paste into a bulk messenger app, or cold call businesses directly from the list.',
    image: step3Image,
    badge: 'One-Click Copy',
  },
  {
    icon: Users,
    title: 'Track Outreach',
    description: 'Manage responses and track interested leads through your sales pipeline',
    image: step4Image,
    cropStyle: 'object-[42%_58%] scale-[1.6]',
    badge: 'Full Pipeline',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  return (
    <section className="relative z-10 py-12 sm:py-16 md:py-24 lg:py-32 px-3 sm:px-4">
      <div className="container mx-auto">
        <ScrollReveal className="text-center mb-8 sm:mb-12 md:mb-20">
          <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold mb-2 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-xs sm:text-sm md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        <div className="max-w-6xl mx-auto space-y-8 sm:space-y-12 md:space-y-20">
          {STEPS.map((step, index) => {
            const isEven = index % 2 === 0;
            return (
              <ScrollReveal key={step.title} delay={(index + 1) * 100}>
                <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-4 sm:gap-6 lg:gap-12`}>
                  {/* Image Side - Larger images */}
                  <div className="flex-1 w-full lg:flex-[1.2]">
                    <div className="relative group">
                      {/* Glow effect */}
                      <div 
                        className="absolute -inset-2 rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-500"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                      />
                      <div 
                        className="absolute -inset-px rounded-2xl"
                        style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.1), transparent)' }}
                      />
                      <div 
                        className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9]"
                        style={{ 
                          border: '1px solid hsl(210 100% 50% / 0.2)',
                          boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                        }}
                      >
                        <img 
                          src={step.image} 
                          alt={step.title}
                          className={`w-full h-full object-cover ${step.cropStyle || ''}`}
                        />
                        {/* Badge */}
                        <div 
                          className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold backdrop-blur-md"
                          style={{ 
                            background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.9), hsl(220 80% 45% / 0.9))',
                            color: 'white',
                            boxShadow: '0 4px 12px hsl(210 100% 50% / 0.3)'
                          }}
                        >
                          {step.badge}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Content Side */}
                  <div className={`flex-1 w-full ${isEven ? 'lg:pl-4' : 'lg:pr-4'}`}>
                  <div className="text-center lg:text-left">
                      {/* Step number badge */}
                      <div 
                        className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg md:text-xl mb-3 sm:mb-4 md:mb-6"
                        style={{ 
                          background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
                          color: 'hsl(220 40% 4%)',
                          boxShadow: '0 0 30px hsl(210 100% 50% / 0.4)'
                        }}
                      >
                        {index + 1}
                      </div>
                      
                      {/* Icon and title row */}
                      <div className="flex items-center gap-2 sm:gap-3 justify-center lg:justify-start mb-2 sm:mb-3 md:mb-4">
                        <div 
                          className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.1)',
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <step.icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" style={{ color: 'hsl(210 100% 50%)' }} />
                        </div>
                        <h3 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">{step.title}</h3>
                      </div>
                      
                      <p className="text-muted-foreground text-xs sm:text-sm md:text-base lg:text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>

        {/* Link to full guide */}
        <ScrollReveal delay={500} className="text-center mt-12 sm:mt-16">
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
