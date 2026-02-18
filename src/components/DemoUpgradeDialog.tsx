import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Rocket, LogIn } from 'lucide-react';

interface DemoUpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName?: string;
}

export function DemoUpgradeDialog({ open, onOpenChange, featureName }: DemoUpgradeDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Unlock {featureName || 'this feature'}
          </DialogTitle>
          <DialogDescription>
            Upgrade to get unlimited searches, CRM, outreach tools, templates, and more.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => navigate('/subscribe')}
            className="w-full"
          >
            <Rocket className="mr-2 h-4 w-4" />
            Unlock unlimited — £19.99/month
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/auth')}
            className="w-full"
          >
            <LogIn className="mr-2 h-4 w-4" />
            Sign In
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
