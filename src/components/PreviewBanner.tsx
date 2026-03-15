import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PreviewBanner() {
  const navigate = useNavigate();

  return (
    <div className="w-full bg-primary/10 border-b border-primary/20 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>Preview Mode</span>
        <span className="text-muted-foreground font-normal">— Try the app before starting your free trial</span>
      </div>
      <Button
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={() => navigate('/start-free-trial')}
      >
        Start free trial to get full access
      </Button>
    </div>
  );
}
