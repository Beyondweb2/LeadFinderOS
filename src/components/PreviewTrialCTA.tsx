import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PreviewTrialCTA() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center gap-3 py-4 px-4 bg-primary/5 border border-primary/15 rounded-lg text-center">
      <p className="text-sm text-muted-foreground">
        Want to save leads, contact businesses, and track your outreach?
      </p>
      <Button
        className="gap-2"
        onClick={() => navigate('/start-free-trial')}
      >
        <Sparkles className="h-4 w-4" />
        Start free trial to get full access
      </Button>
    </div>
  );
}
