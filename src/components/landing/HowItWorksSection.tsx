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
  },
  {
    icon: ClipboardList,
    title: 'Copy Numbers',
    description: 'Add leads to your CRM and bulk-copy phone numbers for outreach',
    image: step2Image,
  },
  {
    icon: MessageSquare,
    title: 'Send Texts',
    description: 'Use a bulk messenger app to reach hundreds of businesses at once',
    image: step3Image,
  },
  {
    icon: Users,
    title: 'Track Outreach',
    description: 'Manage responses and track interested leads through your sales pipeline',
    image: step4Image,
    cropStyle: 'object-[55%_52%] scale-[1.6]', // Center both business cards
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
        <ScrollReveal className="text-center mb-12 sm:mb-16 md:mb-20">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        <div className="max-w-6xl mx-auto space-y-12 sm:space-y-16 md:space-y-20">
          {STEPS.map((step, index) => {
            const isEven = index % 2 === 0;
            return (
              <ScrollReveal key={step.title} delay={(index + 1) * 100}>
                <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-8 lg:gap-12`}>
                  {/* Image Side - Fixed aspect ratio for consistent sizing */}
                  <div className="flex-1 w-full">
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
                        className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/10]"
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
                      </div>
                    </div>
                  </div>
                  
                  {/* Content Side */}
                  <div className={`flex-1 w-full ${isEven ? 'lg:pl-4' : 'lg:pr-4'}`}>
                    <div className="text-center lg:text-left">
                      {/* Step number badge */}
                      <div 
                        className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl font-bold text-lg sm:text-xl mb-4 sm:mb-6"
                        style={{ 
                          background: 'linear-gradient(135deg, hsl(210 100% 50%), hsl(220 80% 45%))',
                          color: 'hsl(220 40% 4%)',
                          boxShadow: '0 0 30px hsl(210 100% 50% / 0.4)'
                        }}
                      >
                        {index + 1}
                      </div>
                      
                      {/* Icon and title row */}
                      <div className="flex items-center gap-3 justify-center lg:justify-start mb-3 sm:mb-4">
                        <div 
                          className="p-2.5 rounded-xl"
                          style={{ 
                            background: 'hsl(210 100% 50% / 0.1)',
                            border: '1px solid hsl(210 100% 50% / 0.2)'
                          }}
                        >
                          <step.icon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: 'hsl(210 100% 50%)' }} />
                        </div>
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{step.title}</h3>
                      </div>
                      
                      <p className="text-muted-foreground text-sm sm:text-base md:text-lg leading-relaxed max-w-md mx-auto lg:mx-0">
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
