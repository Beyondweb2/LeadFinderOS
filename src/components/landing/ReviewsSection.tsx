import { Star, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { useState, useEffect, useRef } from 'react';

interface Review {
  name: string;
  role: string;
  country: string;
  content: string;
  avatar: string;
  stars: number;
}

const REVIEWS: Review[] = [
  {
    name: 'Chris P.',
    role: 'Freelance Designer',
    country: 'UK',
    content: "Within about 10 minutes I had found 30 solid businesses without websites. It took me another 10 minutes to message them all inside the app.\n\nThat alone sold me.",
    avatar: 'CP',
    stars: 5,
  },
  {
    name: 'Tom H.',
    role: 'Web Developer',
    country: 'Australia',
    content: "What I like most is being able to tweak the outreach templates quickly.\n\nI can adjust the message slightly and send it out without rewriting everything each time.",
    avatar: 'TH',
    stars: 5,
  },
  {
    name: 'Alex M.',
    role: 'WordPress Freelancer',
    country: 'Canada',
    content: "I used to bounce between Google Maps, notes and WhatsApp.\n\nNow I can search, message and track everything in one place and it just feels organised.",
    avatar: 'AM',
    stars: 5,
  },
  {
    name: 'Daniel S.',
    role: 'Agency Owner',
    country: 'US',
    content: "Fair play, this is well built.\n\nFinding leads fast and keeping all my outreach tracked properly makes it way easier to stay consistent.",
    avatar: 'DS',
    stars: 5,
  },
];

const Stars = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-7 w-7',
  }[size];

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star key={i} className={`${sizeClass} fill-yellow-400 text-yellow-400`} />
      ))}
    </div>
  );
};

const TestimonialCard = ({ review }: { review: Review }) => (
  <div className="h-full flex flex-col bg-card/60 border border-border/40 rounded-xl px-5 py-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
    <Stars size="sm" />
    <div className="mt-4 flex-1">
      {review.content.split('\n\n').map((paragraph, i) => (
        <p
          key={i}
          className={`text-foreground/80 text-[15px] leading-[1.7] ${i > 0 ? 'mt-3' : ''}`}
        >
          {i === 0 ? `"${paragraph}` : paragraph}
          {i === review.content.split('\n\n').length - 1 ? '"' : ''}
        </p>
      ))}
    </div>
    <div className="mt-5 pt-4 border-t border-border/30">
      <p className="text-foreground text-sm font-semibold">{review.name}</p>
      <p className="text-muted-foreground text-xs mt-0.5">
        {review.role}
        <span className="text-muted-foreground/40 ml-1.5">· {review.country}</span>
      </p>
    </div>
  </div>
);

/* ─── Authority block (left side on desktop, top on mobile) ─── */
const TrustAnchor = () => (
  <div className="flex flex-col items-center lg:items-start justify-center text-center lg:text-left">
    {/* Glow behind rating */}
    <div className="relative">
      <div
        className="absolute -inset-8 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(45 100% 50% / 0.35), transparent 70%)' }}
      />
      <div className="relative">
        <span className="text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight text-foreground leading-none">
          4.9
        </span>
        <span className="text-2xl sm:text-3xl lg:text-4xl font-bold text-muted-foreground/50 ml-1">/5</span>
      </div>
    </div>

    <Stars size="xl" />

    <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground mt-5 leading-snug max-w-xs">
      Rated 4.9/5 by Freelancers and Agencies
    </h3>

    <p className="text-muted-foreground/60 text-sm mt-3 max-w-[280px] leading-relaxed">
      Over 100+ web professionals use LeadFinder to generate clients consistently.
    </p>

    <Button
      variant="outline"
      className="border-border/30 hover:border-border/50 text-sm rounded-full px-5 mt-6"
      asChild
    >
      <Link to="/feedback">
        <MessageSquare className="mr-2 h-4 w-4" />
        Leave a Review
      </Link>
    </Button>
  </div>
);

/* ─── Desktop carousel (2.5–3 cards visible) ─── */
const DesktopCarousel = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const autoplayPlugin = useRef(Autoplay({ delay: 6000, stopOnInteraction: true }));

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div>
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'start' }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {REVIEWS.map((review, index) => (
            <CarouselItem key={index} className="pl-4 basis-[85%] sm:basis-[48%] lg:basis-[42%]">
              <TestimonialCard review={review} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="flex items-center justify-center lg:justify-start gap-1.5 mt-5">
        {REVIEWS.map((_, index) => (
          <button
            key={index}
            onClick={() => api?.scrollTo(index)}
            className={`rounded-full transition-all duration-300 ${
              index === current
                ? 'w-6 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

/* ─── Mobile carousel (full-width swipeable) ─── */
const MobileCarousel = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const autoplayPlugin = useRef(Autoplay({ delay: 6000, stopOnInteraction: true }));

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div>
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'center' }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-3">
          {REVIEWS.map((review, index) => (
            <CarouselItem key={index} className="pl-3 basis-[90%]">
              <TestimonialCard review={review} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="flex items-center justify-center gap-1.5 mt-4">
        {REVIEWS.map((_, index) => (
          <button
            key={index}
            onClick={() => api?.scrollTo(index)}
            className={`rounded-full transition-all duration-300 ${
              index === current
                ? 'w-6 h-2 bg-primary'
                : 'w-2 h-2 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export const ReviewsSection = () => {
  const isMobile = useIsMobile();

  return (
    <section className="relative z-10 py-12 sm:py-20 md:py-24 lg:py-28 px-4">
      {/* Subtle background separation */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, hsl(var(--card) / 0.3) 15%, hsl(var(--card) / 0.5) 50%, hsl(var(--card) / 0.3) 85%, transparent 100%)',
        }}
      />

      <div className="container mx-auto max-w-6xl">
        {isMobile ? (
          /* ─── Mobile: stacked ─── */
          <div className="space-y-8">
            <TrustAnchor />
            <MobileCarousel />
          </div>
        ) : (
          /* ─── Desktop: split layout ─── */
          <div className="grid grid-cols-[2fr_3fr] gap-12 lg:gap-16 items-center">
            <TrustAnchor />
            <DesktopCarousel />
          </div>
        )}
      </div>
    </section>
  );
};
