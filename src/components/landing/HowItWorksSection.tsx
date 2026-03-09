import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Search,
  ClipboardList,
  MessageSquare,
  BarChart3,
  X,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

// Import how-to images
import step1Image from '@/assets/howto-step1-search.png';
import step2Image from '@/assets/howto-step2-results.png';
import step3Image from '@/assets/howto-step3-whatsapp-dialog.png';
import step4Image from '@/assets/howto-step3-outreach-crm.png';

interface StepData {
  icon: typeof Search;
  title: string;
  mobileTitle?: string;
  description: string;
  images: string[];
  badge: string;
  blueWord: string;
}

const renderTitle = (title: string, blueWord: string) => {
  const idx = title.indexOf(blueWord);
  if (idx === -1) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="text-gradient-primary">{blueWord}</span>
      {title.slice(idx + blueWord.length)}
    </>
  );
};

const STEPS: StepData[] = [
  {
    icon: Search,
    title: 'Find Businesses That Actually Need You',
    description: 'Instantly uncover businesses without websites so you\'re never pitching blind.',
    images: [step1Image],
    badge: '20+ Countries',
    blueWord: 'Businesses',
  },
  {
    icon: ClipboardList,
    title: 'Build Your Pipeline',
    description: 'Save high potential businesses and organise your outreach so nothing slips through.',
    images: [step2Image],
    badge: 'Instant Save',
    blueWord: 'Pipeline',
  },
  {
    icon: MessageSquare,
    title: 'Start Conversations',
    description: 'Send personalised WhatsApp or SMS messages in seconds.',
    images: [step3Image],
    badge: 'Direct Outreach',
    blueWord: 'Conversations',
  },
  {
    icon: BarChart3,
    title: 'Track & Close Deals',
    description: 'Track every lead from first message to paid client so your outreach turns into income.',
    images: [step4Image],
    badge: 'Full Pipeline',
    blueWord: 'Close',
  },
];

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

const StepImage = ({ 
  src, 
  alt, 
  onClick 
}: { 
  src: string; 
  alt: string; 
  onClick: () => void;
}) => (
  <div 
    className="relative group cursor-pointer w-full"
    onClick={onClick}
  >
    <div 
      className="absolute -inset-2 rounded-2xl blur-xl opacity-30 group-hover:opacity-40 transition-opacity duration-300"
      style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
    />
    <div 
      className="absolute -inset-px rounded-2xl"
      style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.1), transparent)' }}
    />
    <div 
      className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9] transition-transform duration-300 group-hover:scale-[1.01]"
      style={{ 
        border: '1px solid hsl(210 100% 50% / 0.2)',
        boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
      }}
    >
      <img 
        src={src} 
        alt={alt}
        loading="lazy"
        decoding="async"
        width={640}
        height={360}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
      </div>
    </div>
  </div>
);

export const HowItWorksSection = ({ ScrollReveal }: { ScrollReveal: React.ComponentType<ScrollRevealProps> }) => {
  const [expandedImage, setExpandedImage] = useState<{ src: string; title: string } | null>(null);
  const isMobile = useIsMobile();

  return (
    <section id="how-it-works" className="relative z-10 py-8 sm:py-14 md:py-20 lg:py-24 px-3 sm:px-4">
      {/* Image Modal */}
      <Dialog open={!!expandedImage} onOpenChange={() => setExpandedImage(null)}>
        <DialogContent className="max-w-5xl w-[95vw] p-0 bg-card/95 backdrop-blur-xl border-white/10">
          <div className="relative">
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-white/10 text-foreground hover:bg-background transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            {expandedImage && (
              <div className="p-2">
                <img 
                  src={expandedImage.src} 
                  alt={expandedImage.title}
                  className="w-full h-auto rounded-lg"
                />
                <p className="text-center text-lg font-semibold mt-4 pb-2">{expandedImage.title}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto">
        <ScrollReveal className="text-center mb-8 sm:mb-10 md:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 sm:mb-4 tracking-tight leading-[1.1] px-2">
            How It <span className="text-gradient-primary">Works</span>
          </h2>
          <p className="hidden sm:block text-muted-foreground/70 max-w-xl mx-auto text-base md:text-lg leading-[1.6] px-2">
            From search to sale in four simple steps
          </p>
        </ScrollReveal>
        
        {/* Mobile Layout */}
        {isMobile ? (
          <div className="px-1 space-y-10">
            {STEPS.map((step, index) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                <span 
                  className="text-lg font-bold mb-1"
                  style={{ color: 'hsl(210 100% 60%)' }}
                >
                  {index + 1}.
                </span>
                <h3 className="text-xl font-bold tracking-tight leading-[1.15] whitespace-nowrap mb-2">{renderTitle(step.mobileTitle || step.title, step.blueWord)}</h3>
                
                <p className="text-muted-foreground/70 text-sm leading-[1.6] mb-4 max-w-xs">
                  {step.description}
                </p>
                
                {/* Images - stack vertically for multi-image steps */}
                <div className="w-full space-y-3">
                  {step.images.map((img, imgIdx) => (
                    <div 
                      key={imgIdx}
                      className="relative w-full cursor-pointer"
                      onClick={() => setExpandedImage({ src: img, title: step.title })}
                    >
                      <div 
                        className="relative rounded-lg overflow-hidden bg-card/80 aspect-[16/10]"
                        style={{ 
                          border: '1px solid hsl(210 100% 50% / 0.15)',
                          boxShadow: '0 0 12px hsl(210 100% 50% / 0.08)'
                        }}
                      >
                        <img 
                          src={img} 
                          alt={`${step.title} ${step.images.length > 1 ? imgIdx + 1 : ''}`}
                          loading="lazy"
                          decoding="async"
                          width={640}
                          height={400}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 right-2 p-1.5 rounded-md bg-background/70 backdrop-blur-sm">
                          <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Desktop Layout — Title first, image below */
          <div className="max-w-4xl mx-auto space-y-16 md:space-y-20">
            {STEPS.map((step, index) => (
              <ScrollReveal key={step.title} className="w-full" delay={(index + 1) * 100} direction="up">
                <div className="text-center mb-5 sm:mb-6">
                  <div className="flex items-center gap-3 justify-center mb-2 sm:mb-2.5">
                    <span 
                      className="inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-lg font-bold text-base sm:text-lg lg:text-xl"
                      style={{ 
                        background: 'hsl(210 100% 50% / 0.15)',
                        color: 'hsl(210 100% 60%)',
                        border: '1px solid hsl(210 100% 50% / 0.3)'
                      }}
                    >
                      {index + 1}
                    </span>
                    <h3 className="text-xl sm:text-2xl md:text-4xl lg:text-[2.75rem] font-bold tracking-tight">{renderTitle(step.title, step.blueWord)}</h3>
                  </div>
                  <p className="text-muted-foreground/70 text-sm sm:text-base md:text-lg lg:text-xl leading-[1.5] max-w-xl mx-auto">
                    {step.description}
                  </p>
                </div>
                <div 
                  className="relative group cursor-pointer max-w-3xl mx-auto"
                  onClick={() => setExpandedImage({ src: step.images[0], title: step.title })}
                >
                  <div 
                    className="absolute -inset-2 rounded-2xl blur-xl opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                    style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.2), hsl(220 80% 45% / 0.1))' }}
                  />
                  <div 
                    className="absolute -inset-px rounded-2xl"
                    style={{ background: 'linear-gradient(to bottom right, hsl(210 100% 50% / 0.3), hsl(210 100% 50% / 0.1), transparent)' }}
                  />
                  <div 
                    className="relative rounded-2xl overflow-hidden bg-card/80 backdrop-blur-sm aspect-[16/9] transition-transform duration-300 group-hover:scale-[1.01]"
                    style={{ 
                      border: '1px solid hsl(210 100% 50% / 0.2)',
                      boxShadow: '0 0 20px hsl(210 100% 50% / 0.1), 0 0 40px hsl(210 100% 50% / 0.05)'
                    }}
                  >
                    <img 
                      src={step.images[0]} 
                      alt={step.title}
                      loading="lazy"
                      decoding="async"
                      width={640}
                      height={360}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 p-1.5 sm:p-2 rounded-lg bg-background/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-foreground" />
                    </div>
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
              </ScrollReveal>
            ))}
          </div>
        )}

      </div>
    </section>
  );
};