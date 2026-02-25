import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutoRotateToggleProps {
  autoOn: boolean;
  onToggle: (on: boolean) => void;
}

export function AutoRotateToggle({ autoOn, onToggle }: AutoRotateToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!autoOn)}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border',
        autoOn
          ? 'bg-primary/15 text-primary border-primary/30'
          : 'bg-muted text-muted-foreground border-border'
      )}
    >
      <RefreshCw className={cn('h-3 w-3', autoOn && 'animate-spin [animation-duration:3s]')} />
      Auto {autoOn ? '✓' : ''}
    </button>
  );
}
