import { Star, MessageSquare, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Review {
  name: string;
  role: string;
  content: string;
  avatar: string;
  stars: number;
}

const REVIEWS: Review[] = [
  {
    name: 'James T.',
    role: 'Freelance Web Developer',
    content: "Was wasting a lot of time on Maps before this. Found a couple of solid leads in the first week. The WhatsApp flow is what made it click for me.",
    avatar: 'JT',
    stars: 5,
  },
  {
    name: 'Marcus L.',
    role: 'Web Designer',
    content: "We were doing this manually and it took ages. Now we build a list fast and run outreach in batches. Much easier to stay organised.",
    avatar: 'ML',
    stars: 5,
  },
  {
    name: 'David R.',
    role: 'WordPress Developer',
    content: "I thought the hot lead tag would be pointless, but it's been surprisingly accurate. Saves me contacting businesses that already have sites.",
    avatar: 'DR',
    stars: 5,
  },
  {
    name: 'Ryan K.',
    role: 'Freelance Web Designer',
    content: "Been using it for a few weeks. Super simple and it does what it says. Tracking from first message to outcome is the best part.",
    avatar: 'RK',
    stars: 5,
  },
];

const StarRating = ({ count }: { count: number }) => (
  <div className="flex gap-0.5">
    {[...Array(5)].map((_, i) => (
      <Star 
        key={i} 
        className={`h-3.5 w-3.5 ${i < count ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/20'}`} 
      />
    ))}
  </div>
);

const ReviewCard = ({ review }: { review: Review }) => (
  <div 
    className="relative group rounded-2xl p-[1px] transition-all duration-300"
    style={{
      background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.15), hsl(220 40% 15% / 0.3), hsl(210 100% 50% / 0.08))',
    }}
  >
    <div 
      className="relative rounded-2xl p-5 sm:p-6 h-full transition-all duration-300"
      style={{
        background: 'linear-gradient(180deg, hsl(220 40% 9% / 0.98), hsl(220 40% 6% / 0.99))',
      }}
    >
      <Quote 
        className="absolute top-4 right-4 h-8 w-8 opacity-[0.06]" 
        style={{ color: 'hsl(210 100% 50%)' }}
      />
      
      <StarRating count={review.stars} />
      
      <p className="mt-4 mb-5 text-foreground/85 text-sm sm:text-base leading-relaxed">
        "{review.content}"
      </p>
      
      <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid hsl(220 30% 15% / 0.6)' }}>
        <div 
          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold tracking-wide"
          style={{ 
            background: 'linear-gradient(135deg, hsl(210 100% 50% / 0.2), hsl(210 100% 50% / 0.08))',
            border: '1px solid hsl(210 100% 50% / 0.15)',
            color: 'hsl(210 100% 60%)'
          }}
        >
          {review.avatar}
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground/90">{review.name}</p>
          <p className="text-muted-foreground text-xs">{review.role}</p>
        </div>
      </div>
    </div>
  </div>
);

export const ReviewsSection = () => {
  return (
    <section className="relative z-10 py-12 sm:py-20 md:py-24 lg:py-32 px-4">
      <div className="container mx-auto">
        <div className="text-center mb-10 sm:mb-12 md:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4 tracking-tight px-2">
            Early users are seeing <span className="text-gradient-primary">faster outreach</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base md:text-lg px-2">
            Short, practical feedback from people using LeadFinder Pro.
          </p>
        </div>

        {/* Always stacked cards - no carousel on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 max-w-5xl mx-auto">
          {REVIEWS.map((review, index) => (
            <ReviewCard key={index} review={review} />
          ))}
        </div>

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
