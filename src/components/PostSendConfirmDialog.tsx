import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';

interface PostSendConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onDeny: () => void;
  channel: 'sms' | 'whatsapp';
  businessName: string;
}

export function PostSendConfirmDialog({ open, onConfirm, onDeny, channel, businessName }: PostSendConfirmDialogProps) {
  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDeny(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Message sent?</DialogTitle>
          <DialogDescription className="text-center">
            Did you send the {channelLabel} message to <span className="font-semibold text-foreground">{businessName}</span>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-3 justify-center sm:justify-center">
          <Button
            variant="outline"
            onClick={onDeny}
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            No
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Yes, sent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
