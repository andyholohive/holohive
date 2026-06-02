'use client';

/**
 * ShareCampaignDialog — copies a public link to the campaign and
 * gates a few "share with client" flags on the campaign row
 * (`share_creator_type`, `share_kol_notes`, `share_content_notes`).
 * The public view at `/public/campaigns/[id]` consumes those flags.
 *
 * Extracted from `app/campaigns/[id]/page.tsx` on 2026-06-02. No
 * internal form state — the checkbox toggles write back to the
 * campaign row immediately. Reads `campaign`, writes via
 * `setCampaign` + `CampaignService.updateCampaign`.
 */

import { Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CampaignService } from '@/lib/campaignService';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

interface ShareCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCampaignDialog({ open, onOpenChange }: ShareCampaignDialogProps) {
  const { campaign, setCampaign, toast } = useCampaignDetail();

  const updateShareFlag = async <K extends string>(field: K, value: boolean) => {
    if (!campaign?.id) return;
    try {
      await CampaignService.updateCampaign(campaign.id, { [field]: value } as any);
      setCampaign({ ...campaign, [field]: value } as any);
    } catch (error) {
      console.error('Error updating campaign:', error);
    }
  };

  const shareUrl = typeof window !== 'undefined' && campaign?.id
    ? `${window.location.origin}/public/campaigns/${campaign.id}`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Campaign: {campaign?.name}</DialogTitle>
          <DialogDescription>
            Share this campaign by copying the link below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Campaign Details</Label>
            <div className="bg-cream-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-2">
                <span className="font-medium">Client:</span>
                <span>{campaign?.client_name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="font-medium">Budget:</span>
                <span>{CampaignService.formatCurrency(campaign?.total_budget || 0)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="font-medium">Dates:</span>
                <span>
                  {campaign ? new Date(campaign.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} - {campaign?.end_date ? new Date(campaign.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Status:</span>
                <span>{campaign?.status}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="public-password">Password for Public View</Label>
            <div className="bg-sky-50 rounded-lg p-3 text-sm border border-sky-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-sky-900">Client Email:</span>
                <span className="text-sm font-mono text-sky-700">{campaign?.client_email || 'N/A'}</span>
              </div>
              <p className="text-xs text-brand mt-2">Use the client's email address as the password to access the public campaign view</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-creator-type"
                checked={campaign?.share_creator_type || false}
                onCheckedChange={(checked) => updateShareFlag('share_creator_type', !!checked)}
              />
              <Label htmlFor="share-creator-type" className="text-sm font-medium cursor-pointer">
                Share Creator Type for KOLs
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-kol-notes"
                checked={(campaign as any)?.share_kol_notes || false}
                onCheckedChange={(checked) => updateShareFlag('share_kol_notes', !!checked)}
              />
              <Label htmlFor="share-kol-notes" className="text-sm font-medium cursor-pointer">
                Share KOL Notes
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-content-notes"
                checked={(campaign as any)?.share_content_notes || false}
                onCheckedChange={(checked) => updateShareFlag('share_content_notes', !!checked)}
              />
              <Label htmlFor="share-content-notes" className="text-sm font-medium cursor-pointer">
                Share Notes on Content Pieces
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="share-campaign-link">Share Link</Label>
            <div className="flex gap-2">
              <Input
                id="share-campaign-link"
                value={shareUrl}
                readOnly
                className="flex-1 focus-brand"
              />
              <Button
                variant="outline"
                className="h-10"
                onClick={() => {
                  if (shareUrl) {
                    navigator.clipboard.writeText(shareUrl);
                    toast({
                      title: 'Link Copied',
                      description: 'Campaign link has been copied to clipboard',
                    });
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => {
                  if (shareUrl) window.open(shareUrl, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
