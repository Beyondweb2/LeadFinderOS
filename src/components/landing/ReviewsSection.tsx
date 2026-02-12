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
    role: 'Freelance Designer – UK',
    content: "Within about 10 minutes I had found 30 solid businesses without websites. It took me another 10 minutes to message them all inside the app.\n\nThat alone sold me.",
    avatar: 'CP',
    stars: 5,
  },
  {
    name: 'Tom H.',
    role: 'Web Developer – Australia',
    content: "What I like most is being able to tweak the outreach templates quickly.\n\nI can adjust the message slightly and send it out without rewriting everything each time.",
    avatar: 'TH',
    stars: 5,
  },
  {
    name: 'Alex M.',
    role: 'WordPress Freelancer – Canada',
    content: "I used to bounce between Google Maps, notes and WhatsApp.\n\nNow I can search, message and track everything in one place and it just feels organised.",
    avatar: 'AM',
    stars: 5,
  },
  {
    name: 'Daniel S.',
    role: 'Agency Owner – US',
    content: "Fair play, this is well built.\n\nFinding leads fast and keeping all my outreach tracked properly makes it way easier to stay consistent.",
    avatar: 'DS',
    stars: 5,
  },
];

const ReviewCard = ({ review, minimal }: { review: Review; minimal?: boolean }) => (
  <div className={`h-full flex flex-col justify-between ${minimal ? 'px-4 py-4' : 'px-1 py-1'}`}>
    <div className="w-full">
      {review.content.split('\n\n').map((paragraph, i) => (
        <p key={i} className={`text-foreground/80 text-base sm:text-lg leading-relaxed font-normal ${i > 0 ? 'mt-3' : ''}`}>
          {i === 0 ? `"${paragraph}` : paragraph}
          {i === review.content.split('\n\n').length - 1 ? '"' : ''}
        </p>
      ))}
    </div>
    <div className="mt-5">
      <p className="text-foreground/75 text-sm font-semibold">{review.name}</p>
      <p className="text-muted-foreground/50 text-xs font-medium mt-0.5">{review.role}</p>
    </div>
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
    <section className="relative z-10 py-8 sm:py-16 md:py-20 lg:py-24 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-6 sm:mb-10 md:mb-12">
          {isMobile && (
            <div className="flex items-center justify-center gap-1 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
          )}
          <p className="text-foreground/50 text-xs sm:text-sm font-medium mb-4 sm:mb-5">Rated 4.9/5 by freelancers and agencies</p>
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
