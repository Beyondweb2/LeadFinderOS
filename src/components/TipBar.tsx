import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X, Lightbulb, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TIPS = [
  "After a first reply, send a 20-second voice note introducing yourself.",
  "Send a quick 1-minute Loom video reviewing their current online presence.",
  "Cold calling between 10am–12pm often gets the best answer rates.",
  "Trades, local services, and home improvement businesses convert well.",
  "Offer a paid draft for £49 instead of building for free.",
  "Never build a full site for free before payment.",
  "Follow up after 48 hours if no reply.",
  "Ask \"Are you open to getting more enquiries online?\" instead of pitching immediately.",
  "Close faster by suggesting a quick 5-minute call instead of long messages.",
  "Mark interested leads immediately so you don't lose momentum.",
  "Don't stop at 10 messages — volume matters.",
  "If they say \"maybe later\", schedule a follow-up date.",
];

const STORAGE_KEY = 'tip_bar_dismissed_at';

export function TipBar() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      const ts = localStorage.getItem(STORAGE_KEY);
      if (!ts) return false;
      const diff = Date.now() - parseInt(ts, 10);
      return diff < 7 * 24 * 60 * 60 * 1000; // 7 days
    } catch { return false; }
  });

  const tip = useMemo(() => {
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    return TIPS[dayIndex % TIPS.length];
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, Date.now().toString()); } catch {}
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
      <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
      <span className="flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">Quick Tip:</span> {tip}
      </span>
      <Link
        to="/playbook"
        className="hidden sm:flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
      >
        All Tips <ChevronRight className="h-3 w-3" />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
