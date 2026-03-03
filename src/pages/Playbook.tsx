import { Lightbulb } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface TipItem {
  tip: string;
  why?: string;
}

interface Section {
  title: string;
  tips: TipItem[];
}

const SECTIONS: Section[] = [
  {
    title: 'First Contact',
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
    tips: [
      { tip: 'Send a 20-second voice note introducing yourself.', why: 'Voice builds trust faster than text.' },
      { tip: 'Send a quick 1-minute Loom video reviewing their current online presence.', why: 'Shows effort and expertise without a long call.' },
      { tip: 'Mark interested leads immediately so you don\'t lose momentum.' },
      { tip: 'Close faster by suggesting a quick 5-minute call instead of long messages.' },
    ],
  },
  {
    title: 'Cold Calling',
    tips: [
      { tip: 'Cold calling between 10am–12pm often gets the best answer rates.' },
      { tip: 'Have a 15-second intro ready: name, what you do, one benefit.' },
      { tip: 'If they don\'t answer, send a WhatsApp follow-up within 5 minutes.' },
    ],
  },
  {
    title: 'Handling Objections',
    tips: [
      { tip: 'If they say "maybe later", schedule a follow-up date and set a reminder.' },
      { tip: '"I already have a website" → "Great, I noticed a few things that could bring you more leads — want me to show you?"' },
      { tip: '"How much does it cost?" → Give a range, then suggest a paid draft so they can see before committing.' },
    ],
  },
  {
    title: 'Pricing Strategy',
    tips: [
      { tip: 'Offer a paid draft for £49 instead of building for free.', why: 'Filters out time-wasters and shows you value your work.' },
      { tip: 'Never build a full site for free before payment.' },
      { tip: 'Present two pricing options: a basic package and a premium one. Most will pick the middle ground.' },
    ],
  },
  {
    title: 'Follow-Up Strategy',
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
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center sm:text-left">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Playbook</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-lg">
          Tactical tips to help you close more deals. Short, direct, no fluff.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 className="text-sm sm:text-base font-semibold mb-2 sm:mb-3">{section.title}</h2>
          <div className="space-y-2">
            {section.tips.map((item, i) => (
              <Card key={i} className="p-3 sm:p-4 border-border">
                <p className="text-sm text-foreground">{item.tip}</p>
                {item.why && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic">
                    Why this works: {item.why}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default Playbook;
