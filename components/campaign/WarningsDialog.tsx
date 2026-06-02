'use client';

/**
 * WarningsDialog — opens from the page hero's amber warning chip.
 * Lists the campaign's missing/incomplete validation fields and
 * lets the user click each to jump to the relevant tab.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. Reads
 * `setActiveTab` from `useCampaignDetail()`; the missing-fields list
 * is derived on the page and passed as a prop (avoids exposing the
 * `getMissingFields` validator + all the campaign-shape checks via
 * context for one consumer).
 */

import { AlertTriangle, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

export type MissingFieldItem = { tab: string; field: string; label: string };

interface WarningsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingFields: MissingFieldItem[];
}

export function WarningsDialog({ open, onOpenChange, missingFields }: WarningsDialogProps) {
  const { setActiveTab } = useCampaignDetail();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Campaign Validation Warnings ({missingFields.length})
          </DialogTitle>
          <DialogDescription>
            The following fields are missing or incomplete. Click on any item to navigate to the relevant tab.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-1 space-y-2 py-4">
          {missingFields.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                setActiveTab(item.tab);
                onOpenChange(false);
              }}
              className="w-full text-left p-3 rounded-lg border border-cream-200 hover:border-amber-500 hover:bg-amber-50 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <div>
                    <p className="font-medium text-ink-warm-900 group-hover:text-amber-700">{item.label}</p>
                    <p className="text-sm text-ink-warm-500 capitalize">
                      {item.tab === 'information' ? 'Information' :
                       item.tab === 'kols' ? 'KOL Dashboard' :
                       item.tab === 'contents' ? 'Content Dashboard' :
                       item.tab === 'payments' ? 'Budget' :
                       item.tab}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-warm-400 group-hover:text-amber-500" />
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
