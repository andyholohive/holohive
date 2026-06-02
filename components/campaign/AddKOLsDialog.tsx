'use client';

/**
 * AddKOLsDialog — extracted from `app/campaigns/[id]/page.tsx` on
 * 2026-06-02 as the first step of breaking the 11,800-line page
 * apart. Owns its own form state internally; reads campaign +
 * availableKOLs from `useCampaignDetail()` and calls the fetchers +
 * toast through the same context. The page renders the trigger
 * button and this component side-by-side, then passes `open` /
 * `onOpenChange` down — that keeps the trigger inside the page's
 * toolbar layout while letting this component own the form.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar as CalendarIcon } from 'lucide-react';
import { KOLService } from '@/lib/kolService';
import { CampaignKOLService } from '@/lib/campaignKolService';
import {
  formatDateLocal,
  formatDisplayDate,
  getRegionIcon,
  getPlatformIcon,
  getCreatorTypeColor,
  getContentTypeColor,
  getNewContentTypeColor,
  getPricingColor,
} from '@/lib/campaignHelpers';
import { useCampaignDetail } from '@/contexts/CampaignDetailContext';

interface AddKOLsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_FORM = {
  selectedKOLs: [] as string[],
  hh_status: 'Curated' as const,
  notes: '',
  createPayment: false,
  payment_amount: 0,
  payment_date: '',
  payment_method: 'Fiat',
};

export function AddKOLsDialog({ open, onOpenChange }: AddKOLsDialogProps) {
  const {
    campaign,
    availableKOLs,
    fetchCampaignKOLs,
    fetchAvailableKOLs,
    toast,
  } = useCampaignDetail();

  const [newKOLData, setNewKOLData] = useState(DEFAULT_FORM);
  const [kolSearchTerm, setKolSearchTerm] = useState('');
  const [isAddingKOLs, setIsAddingKOLs] = useState(false);

  const filteredAvailableKOLs = availableKOLs.filter((kol: any) =>
    kol.name.toLowerCase().includes(kolSearchTerm.toLowerCase()) ||
    (kol.region && kol.region.toLowerCase().includes(kolSearchTerm.toLowerCase())) ||
    (Array.isArray(kol.platform) && kol.platform.some((p: string) => p.toLowerCase().includes(kolSearchTerm.toLowerCase())))
  );

  const handleAddKOLs = async () => {
    if (!campaign || newKOLData.selectedKOLs.length === 0) return;
    setIsAddingKOLs(true);
    try {
      const addedKOLs = await Promise.all(
        newKOLData.selectedKOLs.map(kolId =>
          CampaignKOLService.addCampaignKOL(
            campaign.id,
            kolId,
            newKOLData.hh_status,
            newKOLData.notes,
          ),
        ),
      );

      // Payment records are now created when content is added, not
      // when KOLs are added. The createPayment / payment_amount /
      // payment_date / payment_method fields on the form are retained
      // for a potential future "initial payment" flow but are
      // intentionally not consumed here today.
      toast({
        title: 'Success',
        description: `${addedKOLs.length} KOL(s) added successfully.`,
      });

      setNewKOLData(DEFAULT_FORM);
      setKolSearchTerm('');
      onOpenChange(false);
      fetchCampaignKOLs();
      fetchAvailableKOLs();
    } catch (error) {
      console.error('Error adding KOLs:', error);
    } finally {
      setIsAddingKOLs(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add KOLs to Campaign</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
          <div className="grid gap-2">
            <Label>Select KOLs ({newKOLData.selectedKOLs.length} selected)</Label>
            <div className="flex items-center max-w-sm w-full mb-2">
              <Input
                placeholder="Search KOLs by name, region, or platform..."
                className="focus-brand"
                value={kolSearchTerm}
                onChange={e => setKolSearchTerm(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mb-2 w-fit"
              onClick={() => {
                const allIds = filteredAvailableKOLs.map((kol: any) => kol.id);
                if (allIds.every((id: string) => newKOLData.selectedKOLs.includes(id))) {
                  setNewKOLData(prev => ({ ...prev, selectedKOLs: prev.selectedKOLs.filter(id => !allIds.includes(id)) }));
                } else {
                  setNewKOLData(prev => ({ ...prev, selectedKOLs: Array.from(new Set([...prev.selectedKOLs, ...allIds])) }));
                }
              }}
            >
              {filteredAvailableKOLs.length > 0 && filteredAvailableKOLs.every((kol: any) => newKOLData.selectedKOLs.includes(kol.id)) ? 'Deselect All' : 'Select All'}
            </Button>
            <div className="border border-cream-200 rounded-[14px] overflow-hidden mt-2 shadow-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-cream-50/80 hover:bg-cream-50/80 border-b border-cream-200">
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 w-12">Select</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Name</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Followers</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Region</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Platform</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Creator Type</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Content Type</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500">Deliverables</TableHead>
                    <TableHead className="py-2.5 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-warm-500 whitespace-nowrap">Pricing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAvailableKOLs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-ink-warm-500">
                        No KOLs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAvailableKOLs.map((kol: any) => (
                      <TableRow key={kol.id}>
                        <TableCell>
                          <Checkbox
                            checked={newKOLData.selectedKOLs.includes(kol.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNewKOLData(prev => ({
                                  ...prev,
                                  selectedKOLs: [...prev.selectedKOLs, kol.id],
                                }));
                              } else {
                                setNewKOLData(prev => ({
                                  ...prev,
                                  selectedKOLs: prev.selectedKOLs.filter(id => id !== kol.id),
                                }));
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{kol.name}</div>
                            {kol.link && (
                              <a
                                href={kol.link || ''}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-brand hover:text-brand-dark"
                              >
                                View Profile
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {kol.followers ? KOLService.formatFollowers(kol.followers) : '-'}
                        </TableCell>
                        <TableCell>
                          {kol.region ? (
                            <div className="flex items-center space-x-1">
                              <span>{getRegionIcon(kol.region).flag}</span>
                              <span>{kol.region}</span>
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {Array.isArray(kol.platform) ? (
                            <div className="flex gap-1">
                              {kol.platform.map((platform: string, index: number) => (
                                <div key={index} className="flex items-center justify-center h-5 w-5" title={platform}>
                                  {getPlatformIcon(platform)}
                                </div>
                              ))}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {Array.isArray(kol.creator_type) ? (
                            <div className="flex flex-wrap gap-1">
                              {kol.creator_type.map((type: string, index: number) => (
                                <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getCreatorTypeColor(type)}`}>
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {Array.isArray(kol.content_type) ? (
                            <div className="flex flex-wrap gap-1">
                              {kol.content_type.map((type: string, index: number) => (
                                <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getContentTypeColor(type)}`}>
                                  {type}
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {Array.isArray(kol.deliverables) ? (
                            <div className="flex flex-wrap gap-1">
                              {(() => {
                                const counts = kol.deliverables.reduce((acc: { [key: string]: number }, deliverable: string) => {
                                  acc[deliverable] = (acc[deliverable] || 0) + 1;
                                  return acc;
                                }, {});

                                return Object.entries(counts).map(([deliverable, count]: [string, any], index: number) => (
                                  <span key={index} className={`px-2 py-1 rounded-md text-xs font-medium ${getNewContentTypeColor(deliverable)}`}>
                                    {count > 1 ? `${count} ${deliverable}s` : deliverable}
                                  </span>
                                ));
                              })()}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {kol.pricing ? (
                            <span className={`px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${getPricingColor(kol.pricing)}`}>
                              {kol.pricing}
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="grid gap-2 w-64">
            <Label htmlFor="status-select">Default Status</Label>
            <Select
              value={newKOLData.hh_status}
              onValueChange={(value) => setNewKOLData(prev => ({ ...prev, hh_status: value as any }))}
            >
              <SelectTrigger className="focus-brand">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CampaignKOLService.getHHStatusOptions().map((status) => (
                  <SelectItem key={status} value={status || ''}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="notes">Default Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add notes for selected KOLs..."
              value={newKOLData.notes}
              onChange={(e) => setNewKOLData(prev => ({ ...prev, notes: e.target.value }))}
              className="focus-brand"
            />
          </div>

          <div className="border-t pt-4 max-w-md">
            <div className="flex items-center space-x-2 mb-4">
              <Checkbox
                id="create-payment"
                checked={newKOLData.createPayment}
                onCheckedChange={(checked) => setNewKOLData(prev => ({ ...prev, createPayment: !!checked }))}
              />
              <Label htmlFor="create-payment" className="cursor-pointer text-sm font-medium text-ink-warm-900">
                Create initial payment record for selected KOLs
              </Label>
            </div>

            {newKOLData.createPayment && (
              <div className="grid gap-4 pl-6">
                <div className="grid gap-2">
                  <Label htmlFor="payment-amount">Payment Amount (USD)</Label>
                  <div className="relative w-full">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                    <Input
                      id="payment-amount"
                      type="number"
                      min={0}
                      className="focus-brand pl-6 w-full"
                      value={newKOLData.payment_amount || ''}
                      onChange={(e) => setNewKOLData(prev => ({ ...prev, payment_amount: Number(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-date-kol">Payment Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`focus-brand justify-start text-left font-normal h-9 ${newKOLData.payment_date ? 'text-ink-warm-900' : 'text-ink-warm-400'}`}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newKOLData.payment_date ? formatDisplayDate(newKOLData.payment_date) : "Select payment date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="!bg-white border shadow-md w-auto p-0 z-50" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={newKOLData.payment_date ? new Date(newKOLData.payment_date) : undefined}
                        onSelect={date => setNewKOLData(prev => ({
                          ...prev,
                          payment_date: date ? formatDateLocal(date) : '',
                        }))}
                        initialFocus
                        classNames={{
                          day_selected: "text-white hover:text-white focus:text-white",
                        }}
                        modifiersStyles={{
                          selected: { backgroundColor: "#3e8692" },
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment-method-kol">Payment Method</Label>
                  <Select
                    value={newKOLData.payment_method}
                    onValueChange={(value) => setNewKOLData(prev => ({ ...prev, payment_method: value }))}
                  >
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Token">Token</SelectItem>
                      <SelectItem value="Fiat">Fiat</SelectItem>
                      <SelectItem value="WL">WL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" onClick={handleAddKOLs} disabled={newKOLData.selectedKOLs.length === 0 || isAddingKOLs}>
            {isAddingKOLs ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <>Add {newKOLData.selectedKOLs.length} KOL{newKOLData.selectedKOLs.length !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
