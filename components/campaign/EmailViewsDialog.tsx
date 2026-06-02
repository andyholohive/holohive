'use client';

/**
 * EmailViewsDialog — opens from the campaign hero's "Views" button.
 * Lists every email address that has accessed the campaign via the
 * public link, with the timestamp of the most recent view.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. The
 * `loadEmailViews` fetch was inline on the page; we pass the loaded
 * data + loading state as props rather than ship the supabase call
 * here (the page caches the views after the first open).
 */

import { Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

export type EmailViewRow = {
  id: string;
  email: string;
  viewed_at: string | null;
  user_agent: string | null;
};

interface EmailViewsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  emailViews: EmailViewRow[];
  loading: boolean;
}

export function EmailViewsDialog({ open, onOpenChange, emailViews, loading }: EmailViewsDialogProps) {
  const { campaign } = useCampaignDetail();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Email Views: {campaign?.name}
          </DialogTitle>
          <DialogDescription>
            Emails that have accessed this campaign via the public link.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand"></div>
            </div>
          ) : emailViews.length === 0 ? (
            <div className="text-center py-8 text-ink-warm-500">
              <Eye className="h-12 w-12 mx-auto mb-4 text-ink-warm-300" />
              <p>No email views recorded yet.</p>
              <p className="text-sm mt-2">Views will appear here when users access the campaign via the public link.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <div className="text-sm text-ink-warm-500 mb-3">
                {emailViews.length} view{emailViews.length !== 1 ? 's' : ''} recorded
              </div>
              {emailViews.map((view) => (
                <div
                  key={view.id}
                  className="flex items-center justify-between p-3 bg-cream-50 rounded-lg hover:bg-cream-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink-warm-900 truncate">{view.email}</p>
                    <p className="text-xs text-ink-warm-500">
                      {view.viewed_at
                        ? new Date(view.viewed_at).toLocaleString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
