import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
           <DialogTitle className="text-xl">{t('checkout.unlockUnlimited')}</DialogTitle>
           <DialogDescription className="text-base">{t('checkout.priceMonthly')}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onConfirm} disabled={isLoading} className="w-full">
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('checkout.redirecting')}</>
            ) : (
              <><CreditCard className="mr-2 h-4 w-4" />{t('checkout.continueToCheckout')}</>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">{t('checkout.cancelAnytimeNote')}</p>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full text-muted-foreground" disabled={isLoading}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
