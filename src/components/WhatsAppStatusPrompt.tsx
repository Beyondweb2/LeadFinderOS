import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageSquare, Check, X } from 'lucide-react';

interface WhatsAppStatusPromptProps {
  open: boolean;
  businessName: string;
  onConfirm: (hasWhatsApp: boolean) => void;
}

export function WhatsAppStatusPrompt({ open, businessName, onConfirm }: WhatsAppStatusPromptProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-xs" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-green-500" />
            WhatsApp Check
          </DialogTitle>
          <DialogDescription className="text-sm">
            Did <span className="font-semibold text-foreground">{businessName}</span> have WhatsApp?
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => onConfirm(true)}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4 mr-1.5" />
            Yes
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            className="flex-1"
          >
            <X className="h-4 w-4 mr-1.5" />
            No
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
