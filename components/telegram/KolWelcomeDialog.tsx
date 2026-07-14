'use client';

/**
 * KolWelcomeDialog — confirmation step before sending the Korean bot
 * onboarding message to a KOL's Telegram group chat. Fires the first
 * time an "unassigned" chat is linked to a KOL on /crm/telegram.
 *
 * Mirrors PaymentNotifyDialog: editable preview + Skip / Send. The
 * message body + send state live on the page since the trigger comes
 * from the KOL-link flow.
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

interface KolWelcomeDialogProps {
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

export function KolWelcomeDialog({
  open,
  onOpenChange,
  kolName,
  chatTitle,
  message,
  onMessageChange,
  sending,
  onSend,
  onSkip,
}: KolWelcomeDialogProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle>Send Welcome Message?</DialogTitle>
          <DialogDescription>
            {kolName
              ? `Send the onboarding welcome message to ${kolName}'s Telegram chat?`
              : "Send the onboarding welcome message to this KOL's Telegram chat?"}
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
                className="focus-brand min-h-[280px] text-sm"
                autoFocus
              />
            ) : (
              <p className="text-sm text-ink-warm-900 break-words whitespace-pre-line max-h-[320px] overflow-y-auto">
                {message}
              </p>
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
            {sending ? 'Sending...' : 'Send Welcome'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
