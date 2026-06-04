'use client';

/**
 * ClosedWonDialog — the celebratory + slightly-administrative
 * prompt shown when an opportunity is marked Closed Won. Two
 * sub-modes:
 *
 *   - **new**: create a new Client record (name + optional email)
 *     and link the won opp to it.
 *   - **existing**: pick an existing Client from a searchable
 *     Popover combobox.
 *
 * A "Skip" button on the footer lets the rep close-won without any
 * client linkage — they'll be reminded when the client is created
 * later. The `confirmClosedWon` handler enforces that the chosen
 * mode has the required field filled before the Confirm button
 * un-disables.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was
 * `renderClosedWonPrompt`) on 2026-06-02 as part of Phase 3 of the
 * structural split. Consumes the ~11 `closedWon*` fields +
 * `confirmClosedWon` + `skipClosedWon` from `SalesPipelineContext`.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';

export function ClosedWonDialog() {
  const {
    closedWonPrompt,
    setClosedWonPrompt,
    closedWonMode,
    setClosedWonMode,
    closedWonEmail,
    setClosedWonEmail,
    closedWonName,
    setClosedWonName,
    closedWonClientId,
    setClosedWonClientId,
    closedWonClients,
    closedWonClientSearch,
    setClosedWonClientSearch,
    closedWonClientPopoverOpen,
    setClosedWonClientPopoverOpen,
    confirmClosedWon,
    skipClosedWon,
  } = useSalesPipeline();

  const filteredClients = closedWonClients.filter(c =>
    c.name.toLowerCase().includes(closedWonClientSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(closedWonClientSearch.toLowerCase())
  );
  const selectedClient = closedWonClients.find(c => c.id === closedWonClientId);
  const canConfirm = closedWonMode === 'new' ? closedWonName.trim() !== '' : closedWonClientId !== '';

  return (
    <Dialog open={!!closedWonPrompt} onOpenChange={open => { if (!open) setClosedWonPrompt(null); }}>
      <DialogContent className="sm:max-w-sm z-[80]">
        <DialogHeader>
          <DialogTitle>Deal Won!</DialogTitle>
          <DialogDescription>Link {closedWonPrompt?.oppName} to a client, or skip.</DialogDescription>
        </DialogHeader>
        <Select value={closedWonMode} onValueChange={v => setClosedWonMode(v as 'new' | 'existing')}>
          <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Create New Client</SelectItem>
            <SelectItem value="existing">Link Existing Client</SelectItem>
          </SelectContent>
        </Select>
        {closedWonMode === 'new' ? (
          <div className="space-y-2">
            <div>
              <Label className="text-sm font-medium">Client Name</Label>
              <Input
                value={closedWonName}
                onChange={e => setClosedWonName(e.target.value)}
                placeholder="Company or contact name"
                autoFocus
                className="focus-brand"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Email</Label>
              <Input
                value={closedWonEmail}
                onChange={e => setClosedWonEmail(e.target.value)}
                placeholder="client@example.com (optional)"
                type="email"
                className="focus-brand"
              />
            </div>
          </div>
        ) : (
          <Popover open={closedWonClientPopoverOpen} onOpenChange={setClosedWonClientPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between focus-brand">
                {selectedClient ? selectedClient.name : 'Select a client...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0 z-[90]" align="start">
              <Command>
                <CommandInput
                  placeholder="Search clients..."
                  value={closedWonClientSearch}
                  onValueChange={setClosedWonClientSearch}
                />
                <CommandList>
                  <CommandEmpty>No clients found.</CommandEmpty>
                  <CommandGroup>
                    {filteredClients.map(client => (
                      <CommandItem
                        key={client.id}
                        value={client.name}
                        onSelect={() => {
                          setClosedWonClientId(client.id);
                          setClosedWonClientPopoverOpen(false);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${closedWonClientId === client.id ? 'opacity-100' : 'opacity-0'}`} />
                        <div>
                          <div className="font-medium">{client.name}</div>
                          {client.email && <div className="text-xs text-ink-warm-500">{client.email}</div>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
          <Button variant="outline" onClick={skipClosedWon}>Skip</Button>
          <Button variant="brand" onClick={confirmClosedWon} disabled={!canConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
