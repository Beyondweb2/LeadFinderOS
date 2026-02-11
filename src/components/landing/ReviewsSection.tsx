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
  content: string;
  avatar: string;
  stars: number;
}

const REVIEWS: Review[] = [
  {
    name: 'Chris P.',
    role: 'Freelance Designer',
    content: "was spending like an hour every morning just scrolling google maps trying to find businesses to pitch. now i get 30+ in about 10 minutes and actually have time to do the outreach.",
    avatar: 'CP',
    stars: 5,
  },
  {
    name: 'Tom H.',
    role: 'Web Developer',
    content: "honestly the main thing for me is the tracking. i always used to forget who i'd messaged and who needed a follow-up. now it's all in one place and i don't lose leads anymore.",
    avatar: 'TH',
    stars: 5,
  },
  {
    name: 'Alex M.',
    role: 'WordPress Freelancer',
    content: "got my first paying client about three weeks in. the templates made it way less stressful — i just picked one, tweaked it a bit, and sent. no more staring at a blank message.",
    avatar: 'AM',
    stars: 5,
  },
  {
    name: 'Daniel S.',
    role: 'Agency Owner',
    content: "we put the whole team on it and prospecting went from being this massive time sink to something that just gets done. follow-ups actually happen now which has been a game changer.",
    avatar: 'DS',
    stars: 5,
  },
];

const ReviewCard = ({ review, minimal }: { review: Review; minimal?: boolean }) => (
  <div className={`h-full flex flex-col justify-between ${minimal ? 'px-4 py-5' : 'rounded-xl border border-white/[0.08] bg-card/60 backdrop-blur-sm px-5 py-6 sm:px-6 sm:py-7'}`}>
    <div className="w-full">
      <div className="flex gap-0.5 mb-3">
        {[...Array(review.stars)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
      <p className="text-foreground/85 text-sm sm:text-base leading-relaxed font-normal">
        "{review.content}"
      </p>
    </div>
    <p className="text-muted-foreground/60 text-xs sm:text-sm mt-5 font-medium">{review.name} · {review.role}</p>
  </div>
);

const MobileReviewsCarousel = () => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const autoplayPlugin = useRef(Autoplay({ delay: 5000, stopOnInteraction: true }));

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <div className="max-w-md mx-auto">
      <Carousel
        setApi={setApi}
        opts={{ loop: true, align: 'center' }}
        plugins={[autoplayPlugin.current]}
        className="w-full"
      >
        <CarouselContent className="-ml-2">
          {REVIEWS.map((review, index) => (
            <CarouselItem key={index} className="pl-2">
              <ReviewCard review={review} minimal />
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
                ? 'w-6 h-2 bg-[hsl(210_100%_50%)]'
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
    <section className="relative z-10 py-10 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-3xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            Real Results from <span className="text-gradient-primary">Real Users</span>
          </h2>
          <p className="hidden sm:block text-muted-foreground max-w-xl mx-auto text-base md:text-lg px-2">
            See how freelancers and agencies are landing more clients with LeadFinder Pro
          </p>
        </div>

        {isMobile ? (
          <MobileReviewsCarousel />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {REVIEWS.map((review, index) => (
              <ReviewCard key={index} review={review} />
            ))}
          </div>
        )}

        <div className="text-center mt-8 sm:mt-10">
          <Button variant="outline" className="border-white/10 hover:border-white/20 text-sm rounded-full px-6" asChild>
            <Link to="/feedback">
              <MessageSquare className="mr-2 h-4 w-4" />
              Leave a Review
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};
