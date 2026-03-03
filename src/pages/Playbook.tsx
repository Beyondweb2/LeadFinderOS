import { Lightbulb, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TipItem {
  tip: string;
  why?: string;
}

interface Section {
  title: string;
  step: string;
  tips: TipItem[];
}

const SECTIONS: Section[] = [
  {
    title: 'First Contact',
    step: 'STEP 1',
    tips: [
      { tip: 'Ask "Are you open to getting more enquiries online?" instead of pitching immediately.', why: 'Opens a conversation instead of triggering a sales wall.' },
      { tip: 'Keep your first message casual — no links, no media, no pitch.' },
      { tip: 'Use WhatsApp first, then SMS, then call. This is the order of highest response rate.' },
      { tip: "Don't stop at 10 messages — volume matters early on." },
      { tip: 'Trades, local services, and home improvement businesses convert well.' },
    ],
  },
  {
    title: 'After They Reply',
    step: 'STEP 2',
    tips: [
      { tip: 'Send a 20-second voice note introducing yourself.', why: 'Voice builds trust faster than text.' },
      { tip: 'Send a quick 1-minute Loom video reviewing their current online presence.', why: 'Shows effort and expertise without a long call.' },
      { tip: 'Mark interested leads immediately so you don\'t lose momentum.' },
      { tip: 'Close faster by suggesting a quick 5-minute call instead of long messages.' },
    ],
  },
  {
    title: 'Cold Calling',
    step: 'STEP 3',
    tips: [
      { tip: 'Cold calling between 10am–12pm often gets the best answer rates.' },
      { tip: 'Have a 15-second intro ready: name, what you do, one benefit.' },
      { tip: 'If they don\'t answer, send a WhatsApp follow-up within 5 minutes.' },
    ],
  },
  {
    title: 'Handling Objections',
    step: 'STEP 4',
    tips: [
      { tip: 'If they say "maybe later", schedule a follow-up date and set a reminder.' },
      { tip: '"I already have a website" → "Great, I noticed a few things that could bring you more leads — want me to show you?"' },
      { tip: '"How much does it cost?" → Give a range, then suggest a paid draft so they can see before committing.' },
    ],
  },
  {
    title: 'Pricing Strategy',
    step: 'STEP 5',
    tips: [
      { tip: 'Offer a paid draft for £49 instead of building for free.', why: 'Filters out time-wasters and shows you value your work.' },
      { tip: 'Never build a full site for free before payment.' },
      { tip: 'Present two pricing options: a basic package and a premium one. Most will pick the middle ground.' },
    ],
  },
  {
    title: 'Follow-Up Strategy',
    step: 'STEP 6',
    tips: [
      { tip: 'Follow up after 48 hours if no reply.' },
      { tip: 'Send a maximum of 3 follow-ups, spaced 2–3 days apart.' },
      { tip: 'Your last follow-up should be a polite "closing the loop" message — it often gets a response.', why: 'Loss aversion triggers action.' },
      { tip: 'Use the "Next Action" feature to schedule every follow-up so nothing slips.' },
    ],
  },
];

const Playbook = () => {
  return (
    <div className="relative">
      {/* Sticky header — desktop only */}
      <div className="hidden md:block sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pb-4 pt-1 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Playbook</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
          Tactical tips to close more deals. Short, direct, no fluff.
        </p>
      </div>

      {/* Mobile header */}
      <div className="md:hidden text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Playbook</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          Tactical tips to close more deals. Short, direct, no fluff.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-10 sm:space-y-14 md:pt-6">
        {SECTIONS.map((section, sectionIdx) => (
          <section key={section.title}>
            {/* Section header */}
            <div className="mb-4 sm:mb-5">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-primary/70">
                {section.step}
              </span>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mt-0.5">
                {section.title}
              </h2>
              <div className="mt-2 h-px bg-border/60" />
            </div>

            {/* Tip cards */}
            <div className="space-y-3 sm:space-y-3">
              {section.tips.map((item, i) => {
                const isFirstOfFirst = sectionIdx === 0 && i === 0;
                return (
                  <div
                    key={i}
                    className={cn(
                      'group relative rounded-lg border p-4 sm:p-5 transition-all duration-200',
                      'bg-card/60 border-border/40',
                      'md:hover:bg-card md:hover:border-border/70 md:hover:shadow-[0_2px_12px_hsl(0_0%_0%/0.3)]',
                      'leading-relaxed',
                      isFirstOfFirst && 'border-l-2 border-l-primary/50 bg-card/80'
                    )}
                  >
                    <p className="text-sm sm:text-[0.9375rem] text-foreground/90 leading-relaxed">
                      {item.tip}
                    </p>
                    {item.why && (
                      <div className="flex items-start gap-1.5 mt-3 pt-2.5 border-t border-border/30">
                        <Info className="h-3 w-3 shrink-0 text-muted-foreground/60 mt-0.5" />
                        <p className="text-[11px] sm:text-xs text-muted-foreground/70 leading-relaxed">
                          {item.why}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default Playbook;
