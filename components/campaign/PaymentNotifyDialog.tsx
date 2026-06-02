'use client';

/**
 * PaymentNotifyDialog — confirmation step before sending a payment
 * notification to a KOL's Telegram chat. Fires after the Record
 * Payment / Edit Payment flows detect a KOL with a linked TG chat +
 * wallet + non-zero amount on a payment-date set.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. State
 * for the confirmation (pendingPaymentNotification + the editable
 * message body) is owned by the page since the notification trigger
 * comes from another component via `triggerPaymentNotification`.
 * This dialog just reads + writes back to that page-owned slice
 * via props.
 */

import { useState } from 'react';
import { Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PaymentNotifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** KOL name shown in the title. */
  kolName?: string;
  /** Chat title shown under the message preview. */
  chatTitle?: string | null;
  /** Editable message body. */
  message: string;
  onMessageChange: (next: string) => void;
  sending: boolean;
  onSend: () => void;
  onSkip: () => void;
}

export function PaymentNotifyDialog({
  open,
  onOpenChange,
  kolName,
  chatTitle,
  message,
  onMessageChange,
  sending,
  onSend,
  onSkip,
}: PaymentNotifyDialogProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>Send Payment Notification?</DialogTitle>
          <DialogDescription>
            Send a payment notification to {kolName}'s Telegram chat?
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-cream-50 rounded-lg p-4 space-y-2 overflow-hidden">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-warm-700">{isEditing ? 'Edit message:' : 'Message preview:'}</p>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-sm text-brand hover:underline flex items-center gap-1"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
            </div>
            {isEditing ? (
              <Textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                className="focus-brand min-h-[100px] text-sm"
                autoFocus
              />
            ) : (
              <p className="font-medium text-ink-warm-900 break-words whitespace-pre-line">{message}</p>
            )}
          </div>
          {chatTitle && (
            <p className="text-xs text-ink-warm-500 mt-2 break-words">Will be sent to: {chatTitle}</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0 border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={onSkip} disabled={sending}>
            Skip
          </Button>
          {isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(false)} disabled={sending}>
              Done Editing
            </Button>
          )}
          <Button variant="brand" onClick={onSend} disabled={sending || !message.trim()}>
            {sending ? 'Sending...' : 'Send Notification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
