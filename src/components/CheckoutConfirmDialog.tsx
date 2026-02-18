import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, Shield } from 'lucide-react';

interface CheckoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function CheckoutConfirmDialog({ open, onOpenChange, onConfirm, isLoading }: CheckoutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
           <DialogTitle className="text-xl">
             Unlock 3 days of full access — FREE
           </DialogTitle>
           <DialogDescription className="text-base">
             £0 today · Cancel anytime · We'll email you before billing.
           </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Continue to Secure Checkout
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            No charge today. Cancel anytime from your dashboard in one click.
          </p>
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Then £19.99/month after trial.
          </p>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground"
            disabled={isLoading}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
