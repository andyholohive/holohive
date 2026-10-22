'use client';

/**
 * Start Client onboarding wizard — extracted from app/clients/page.tsx
 * [2026-10-22], the first cut of the 6,700-line page split. Owns the
 * multi-step form, its validation and the submit (client → access →
 * campaign → allocations). The page passes the lists it needs and a
 * reload callback; nothing else on the page read this state.
 */

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CampaignService } from '@/lib/campaignService';
import { Checkbox } from '@/components/ui/checkbox';
import { ClientService } from '@/lib/clientService';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { KOLService } from '@/lib/kolService';
import { Label } from '@/components/ui/label';
import { Plus, Edit, Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, toIsoDate } from '@/lib/dateFormat';
import { sanitizeMoneyInput, formatMoneyDisplay } from '@/lib/moneyInput';
import { useState } from 'react';

interface StartClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing clients, for the "renewing client" picker. */
  clients: any[];
  /** Team members, for the campaign-manager / supporting-members pickers. */
  allUsers: any[];
  /** Reload the page's client list after a successful start. */
  onCreated: () => Promise<void> | void;
}

export function StartClientDialog({ open, onOpenChange, clients, allUsers, onCreated }: StartClientDialogProps) {
  // Start client form state
  const [startClientForm, setStartClientForm] = useState({
    companyName: '',
    isRenewingClient: false,
    selectedExistingClient: '',
    email: '',
    location: '',
    source: 'Inbound',
    campaignName: '',
    campaignManager: '',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    region: 'apac',
    clientChoosingKols: false,
    multiActivation: false,
    totalBudget: '',
    callHeld: false,
    callDate: undefined as Date | undefined,
    proposalSent: false,
    ndaSigned: false,
    budgetType: [] as string[],
    callSupport: false,
    supportingMembers: [] as string[],
    budgetAllocations: [] as { region: string; amount: string }[],
    intro_call: false,
    intro_call_date: undefined as Date | undefined,
  });
  const [startClientStep, setStartClientStep] = useState(0);
  // Update the step order so onboarding comes before campaign details
  const startClientSections = [
    'Client Details',
    'Onboarding',
    'Campaign Details',
    'Contracting Status',
    'Support & Follow-Up'
  ];
  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };
  const isStepValid = () => {
    if (startClientStep === 0) {
      if (startClientForm.isRenewingClient) {
        return !!startClientForm.selectedExistingClient;
      } else {
        return (
          !!startClientForm.companyName.trim() &&
          !!startClientForm.email.trim() &&
          isValidEmail(startClientForm.email) &&
          !!startClientForm.source
        );
      }
    }
    if (startClientStep === 1) {
      // Onboarding step: only require call date if callHeld is checked
      if (startClientForm.callHeld) {
        return !!startClientForm.callDate;
      }
      return true;
    }
    if (startClientStep === 2) {
      // Campaign Details step: require all campaign fields except end date
      return (
        !!startClientForm.campaignName.trim() &&
        !!startClientForm.campaignManager &&
        !!startClientForm.startDate &&
        !!startClientForm.region &&
        !!startClientForm.totalBudget
      );
    }
    return true;
  };
  const [isStartClientSubmitting, setIsStartClientSubmitting] = useState(false);
  const [startClientError, setStartClientError] = useState<string | null>(null);
  const handleStartClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStartClientSubmitting(true);
    setStartClientError(null);
    try {
      let clientId = '';
      if (startClientForm.isRenewingClient) {
        clientId = startClientForm.selectedExistingClient;
      } else {
        const client = await ClientService.createClient(
          startClientForm.companyName.trim(),
          startClientForm.email.trim(),
          startClientForm.location.trim() || undefined
        );
        clientId = client.id;
        // Pre-approve holohive.io so Holo Hive staff can access the portal
        // [Andy 2026-07-16] — mirrors the Add Client flow.
        await ClientService.updateClient(clientId, { approved_domains: ['holohive.io'] } as any);
      }
      const accessUserIds = [
        startClientForm.campaignManager,
        ...startClientForm.supportingMembers.filter(id => id && id !== startClientForm.campaignManager),
      ];
      await Promise.all(accessUserIds.map((userId) =>
        userId ? ClientService.grantClientAccess(clientId, userId) : Promise.resolve()
      ));
      const campaign = await CampaignService.createCampaign({
        client_id: clientId,
        name: startClientForm.campaignName.trim(),
        total_budget: parseFloat(startClientForm.totalBudget),
        status: 'Planning',
        start_date: startClientForm.startDate ? toIsoDate(startClientForm.startDate) : '',
        end_date: startClientForm.endDate ? toIsoDate(startClientForm.endDate) : '',
        description: undefined,
        intro_call: startClientForm.intro_call,
        intro_call_date: startClientForm.intro_call_date ? toIsoDate(startClientForm.intro_call_date) : null,
        manager: startClientForm.campaignManager || null,
        call_support: startClientForm.callSupport,
        client_choosing_kols: startClientForm.clientChoosingKols,
        multi_activation: startClientForm.multiActivation,
        proposal_sent: startClientForm.proposalSent,
        nda_signed: startClientForm.ndaSigned,
        budget_type: startClientForm.budgetType,
        region: startClientForm.region,
      });
      await Promise.all(
        (startClientForm.budgetAllocations || [])
          .filter(a => a.region && a.amount)
          .map((alloc) =>
            CampaignService.addBudgetAllocation(campaign.id, alloc.region, parseFloat(alloc.amount))
          )
      );
      onOpenChange(false);
      setStartClientStep(0);
      setStartClientForm({
        companyName: '',
        isRenewingClient: false,
        selectedExistingClient: '',
        email: '',
        location: '',
        source: 'Inbound',
        campaignName: '',
        campaignManager: '',
        startDate: undefined,
        endDate: undefined,
        region: 'apac',
        clientChoosingKols: false,
        multiActivation: false,
        totalBudget: '',
        callHeld: false,
        callDate: undefined,
        proposalSent: false,
        ndaSigned: false,
        budgetType: [],
        callSupport: false,
        supportingMembers: [],
        budgetAllocations: [],
        intro_call: false,
        intro_call_date: undefined,
      });
      await onCreated();
    } catch (err: any) {
      setStartClientError(err?.message || 'Failed to start client onboarding.');
    } finally {
      setIsStartClientSubmitting(false);
    }
  };
  const regionOptions = KOLService.getFieldOptions().regions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {false && (
      <DialogTrigger asChild>
        <Button variant="brand">
          <Plus className="h-4 w-4 mr-2" />
          Start Client
        </Button>
      </DialogTrigger>
      )}
      {/* Flex-col Dialog so the body grows to fill space and
          DialogFooter stays pinned at the bottom regardless of
          viewport height. Previously DialogContent was 80vh +
          inner body 60vh — on short screens the 20vh footer
          gap collapsed and the action buttons clipped off. */}
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Start Client Onboarding</DialogTitle>
          <DialogDescription>
            Complete client onboarding and campaign setup in one workflow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 flex-1 overflow-y-auto px-1">
          {/* Step Indicator */}
          <div className="flex items-center justify-center mb-4 gap-2">
            {startClientSections.map((label, idx) => (
              <div key={label} className={`px-3 py-1 rounded-full text-xs font-medium ${idx === startClientStep ? 'bg-brand text-white' : 'bg-cream-200 text-ink-warm-700'}`}>{label}</div>
            ))}
          </div>
          {/* Section rendering */}
          {startClientStep === 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 1: Client Details</h3>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="companyName">
                    Company Name {!startClientForm.isRenewingClient && <span className="text-rose-500">*</span>}
                  </Label>
                  <Input
                    id="companyName"
                    value={startClientForm.companyName}
                    onChange={(e) => setStartClientForm({ ...startClientForm, companyName: e.target.value })}
                    placeholder="Enter company name"
                    className="focus-brand"
                    disabled={startClientForm.isRenewingClient}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="renewingClient"
                    checked={startClientForm.isRenewingClient}
                    onCheckedChange={(checked) => {
                      setStartClientForm({
                        ...startClientForm,
                        isRenewingClient: checked as boolean,
                        companyName: checked ? '' : startClientForm.companyName,
                        email: checked ? '' : startClientForm.email,
                        location: checked ? '' : startClientForm.location,
                        source: checked ? 'Renewal' : startClientForm.source
                      });
                    }}
                  />
                  <Label htmlFor="renewingClient" className="text-sm">Renewing Client</Label>
                </div>
                {startClientForm.isRenewingClient && (
                  <div className="grid gap-2">
                    <Label htmlFor="existingClient">
                      Select Existing Client <span className="text-rose-500">*</span>
                    </Label>
                    <Select value={startClientForm.selectedExistingClient} onValueChange={(value) => {
                      const selectedClient = clients.find(c => c.id === value);
                      if (selectedClient) {
                        setStartClientForm({
                          ...startClientForm,
                          selectedExistingClient: value,
                          companyName: selectedClient.name,
                          email: selectedClient.email,
                          location: selectedClient.location || '',
                          source: 'Renewal'
                        });
                      }
                    }}>
                      <SelectTrigger className="focus-brand">
                        <SelectValue placeholder="Select existing client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="email">
                    Email {!startClientForm.isRenewingClient && <span className="text-rose-500">*</span>}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={startClientForm.email}
                    onChange={(e) => setStartClientForm({ ...startClientForm, email: e.target.value })}
                    placeholder="Enter email address"
                    className="focus-brand"
                    disabled={startClientForm.isRenewingClient}
                  />
                  {/* Email format error message */}
                  {startClientForm.email && !isValidEmail(startClientForm.email) && (
                    <span className="text-xs text-rose-600">Please enter a valid email address.</span>
                  )}
                </div>
                {/* Location field hidden per May 2026 audit —
                    see the matching hide in the Add/Edit
                    Client dialog. State plumbing kept intact. */}
                {/* Source field hidden per May 2026 audit —
                    wizard's isStepValid still passes because
                    startClientForm.source defaults to
                    'Inbound'. Renewal flow still flips the
                    value to 'Renewal' via the checkbox above. */}
              </div>
            </div>
          )}
          {startClientStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 2: Onboarding</h3>
              <div className="grid gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="callHeld"
                    checked={startClientForm.callHeld}
                    onCheckedChange={(checked) => setStartClientForm({
                      ...startClientForm,
                      callHeld: checked as boolean,
                      callDate: checked ? startClientForm.callDate : undefined
                    })}
                  />
                  <Label htmlFor="callHeld" className="text-sm">Call Held?</Label>
                </div>
                {startClientForm.callHeld && (
                  <div className="grid gap-2">
                    <Label htmlFor="callDate">
                      Call Date <span className="text-rose-500">*</span>
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                          style={{
                            borderColor: '#e5e7eb',
                            backgroundColor: 'white',
                            color: startClientForm.callDate ? '#111827' : '#9ca3af'
                          }}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startClientForm.callDate ? formatDate(startClientForm.callDate) : 'Select call date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startClientForm.callDate}
                          onSelect={(date) => setStartClientForm({ ...startClientForm, callDate: date || undefined })}
                          initialFocus
                          classNames={{
                            day_selected: 'text-white hover:text-white focus:text-white',
                          }}
                          modifiersStyles={{
                            selected: { backgroundColor: '#3e8692' }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </div>
          )}
          {startClientStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 3: Campaign Details</h3>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="campaignName">
                    Campaign Name <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="campaignName"
                    value={startClientForm.campaignName}
                    onChange={(e) => setStartClientForm({ ...startClientForm, campaignName: e.target.value })}
                    placeholder="Enter campaign name"
                    className="focus-brand"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaignManager">
                    Campaign Manager <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={startClientForm.campaignManager} onValueChange={(value) => setStartClientForm({ ...startClientForm, campaignManager: value })}>
                    <SelectTrigger className="focus-brand">
                      <SelectValue placeholder="Select campaign manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">
                      Start Date <span className="text-rose-500">*</span>
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                          style={{
                            borderColor: '#e5e7eb',
                            backgroundColor: 'white',
                            color: startClientForm.startDate ? '#111827' : '#9ca3af'
                          }}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startClientForm.startDate ? formatDate(startClientForm.startDate) : 'Select start date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startClientForm.startDate}
                          onSelect={(date) => setStartClientForm({ ...startClientForm, startDate: date || undefined })}
                          initialFocus
                          classNames={{
                            day_selected: 'text-white hover:text-white focus:text-white',
                          }}
                          modifiersStyles={{
                            selected: { backgroundColor: '#3e8692' }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                          style={{
                            borderColor: '#e5e7eb',
                            backgroundColor: 'white',
                            color: startClientForm.endDate ? '#111827' : '#9ca3af'
                          }}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startClientForm.endDate ? formatDate(startClientForm.endDate) : 'Select end date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startClientForm.endDate}
                          onSelect={(date) => setStartClientForm({ ...startClientForm, endDate: date || undefined })}
                          disabled={(date) => startClientForm.startDate ? date < startClientForm.startDate : false}
                          initialFocus
                          classNames={{
                            day_selected: 'text-white hover:text-white focus:text-white',
                          }}
                          modifiersStyles={{
                            selected: { backgroundColor: '#3e8692' }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {/* Moved from old Section 5: Campaign Details 2 */}
                <div className="grid gap-2">
                  <Label htmlFor="region">
                    Region <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={startClientForm.region} onValueChange={(value) => {
                    setStartClientForm({
                      ...startClientForm,
                      region: value,
                      clientChoosingKols: value === 'global'
                    });
                  }}>
                    <SelectTrigger className="focus-brand">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apac">APAC</SelectItem>
                      <SelectItem value="global">Global</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clientChoosingKols"
                    checked={startClientForm.clientChoosingKols}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, clientChoosingKols: checked as boolean })}
                  />
                  <Label htmlFor="clientChoosingKols" className="text-sm">Is Client Choosing the KOLs?</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="multiActivation"
                    checked={startClientForm.multiActivation}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, multiActivation: checked as boolean })}
                  />
                  <Label htmlFor="multiActivation" className="text-sm">Multi-Activation Campaign</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="intro_call"
                    checked={startClientForm.intro_call}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, intro_call: checked as boolean })}
                  />
                  <Label htmlFor="intro_call" className="text-sm">Intro call held?</Label>
                </div>
                {startClientForm.intro_call && (
                  <div className="grid gap-2">
                    <Label htmlFor="intro_call_date">Intro Call Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="focus-brand justify-start text-left font-normal focus:ring-2 focus:ring-brand focus:border-brand"
                          style={{
                            borderColor: '#e5e7eb',
                            backgroundColor: 'white',
                            color: startClientForm.intro_call_date ? '#111827' : '#9ca3af'
                          }}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startClientForm.intro_call_date ? formatDate(startClientForm.intro_call_date) : 'Select intro call date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startClientForm.intro_call_date}
                          onSelect={(date) => setStartClientForm({ ...startClientForm, intro_call_date: date || undefined })}
                          initialFocus
                          classNames={{
                            day_selected: 'text-white hover:text-white focus:text-white',
                          }}
                          modifiersStyles={{
                            selected: { backgroundColor: '#3e8692' }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="totalBudget">
                    Budget <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="totalBudget"
                    type="number"
                    value={startClientForm.totalBudget}
                    onChange={(e) => {
                      const budget = e.target.value;
                      setStartClientForm({
                        ...startClientForm,
                        totalBudget: budget,
                        callSupport: budget ? parseInt(budget) >= 10000 : false
                      });
                    }}
                    placeholder="Enter total budget"
                    className="focus-brand"
                  />
                </div>
               {/* Campaign Budget Allocation Section */}
               <div className="grid gap-2">
                 <Label>Budget Allocation</Label>
                 <div className="bg-cream-50 border rounded p-3 text-sm text-ink-warm-700 space-y-2">
                   {startClientForm.budgetAllocations.length === 0 && (
                     <div className="text-ink-warm-400 text-sm">No allocations yet.</div>
                   )}
                   {startClientForm.budgetAllocations.map((alloc, idx) => {
                     // Format the amount with commas for display (decimal-aware, audit H2)
                     const formattedAmount = formatMoneyDisplay(alloc.amount);
                     return (
                       <div key={idx} className="flex items-center gap-2">
                         <Select
                           value={alloc.region}
                           onValueChange={value => {
                             const newAllocs = [...startClientForm.budgetAllocations];
                             newAllocs[idx].region = value;
                             setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                           }}
                         >
                           <SelectTrigger className="w-32 focus-brand">
                             <SelectValue placeholder="Select region" />
                           </SelectTrigger>
                           <SelectContent>
                             {regionOptions.map(region => (
                               <SelectItem key={region} value={region}>{region}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                         <div className="relative w-28">
                           <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-warm-500 pointer-events-none">$</span>
                           <Input
                             type="text"
                             inputMode="numeric"
                             pattern="[0-9,]*"
                             className="focus-brand pl-6 w-full"
                             placeholder="Amount"
                             value={formattedAmount}
                             onChange={e => {
                               // Decimal-aware sanitize (audit H2): keep the decimal so a
                               // pasted "12,500.00" stays 12500.00, not 1250000.
                               const raw = sanitizeMoneyInput(e.target.value);
                               const newAllocs = [...startClientForm.budgetAllocations];
                               newAllocs[idx].amount = raw;
                               setStartClientForm({ ...startClientForm, budgetAllocations: newAllocs });
                             }}
                           />
                         </div>
                         <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           className="text-rose-500 hover:text-rose-700"
                           onClick={() => {
                             setStartClientForm({
                               ...startClientForm,
                               budgetAllocations: startClientForm.budgetAllocations.filter((_, i) => i !== idx)
                             });
                           }}
                           aria-label="Remove allocation"
                         >
                           <Trash2 className="w-4 h-4" />
                         </Button>
                       </div>
                     );
                   })}
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     className="mt-2"
                     onClick={() => setStartClientForm({
                       ...startClientForm,
                       budgetAllocations: [
                         ...startClientForm.budgetAllocations,
                         { region: '', amount: '' }
                       ]
                     })}
                   >Add Allocation</Button>
                 </div>
               </div>
               {/* Budget Type */}
               <div className="grid gap-2">
                 <Label>Budget Type</Label>
                 <div className="flex space-x-4">
                   {['Token', 'Fiat', 'WL'].map((type) => (
                     <div key={type} className="flex items-center space-x-2">
                       <Checkbox
                         id={type}
                         checked={startClientForm.budgetType.includes(type)}
                         onCheckedChange={(checked) => {
                           if (checked) {
                             setStartClientForm({
                               ...startClientForm,
                               budgetType: [...startClientForm.budgetType, type]
                             });
                           } else {
                             setStartClientForm({
                               ...startClientForm,
                               budgetType: startClientForm.budgetType.filter(t => t !== type)
                             });
                           }
                         }}
                       />
                       <Label htmlFor={type} className="text-sm capitalize">{type}</Label>
                     </div>
                   ))}
                 </div>
               </div>
              </div>
            </div>
          )}
          {startClientStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 4: Contracting Status</h3>
              <div className="grid gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="proposalSent"
                    checked={startClientForm.proposalSent}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, proposalSent: checked as boolean })}
                  />
                  <Label htmlFor="proposalSent" className="text-sm">Proposal sent?</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ndaSigned"
                    checked={startClientForm.ndaSigned}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, ndaSigned: checked as boolean })}
                  />
                  <Label htmlFor="ndaSigned" className="text-sm">NDA signed?</Label>
                </div>
              </div>
            </div>
          )}
          {startClientStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-ink-warm-900 border-b pb-2">Section 5: Support & Follow-Up</h3>
              <div className="grid gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="callSupport"
                    checked={startClientForm.callSupport}
                    onCheckedChange={(checked) => setStartClientForm({ ...startClientForm, callSupport: checked as boolean })}
                  />
                  <Label htmlFor="callSupport" className="text-sm">Offering Call Support</Label>
                </div>
                <div className="grid gap-2">
                  <Label>Supporting Members</Label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {allUsers.filter(user => user.role !== 'client' && user.id !== startClientForm.campaignManager).map((user) => (
                      <div key={user.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`member-${user.id}`}
                          checked={startClientForm.supportingMembers.includes(user.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setStartClientForm({
                                ...startClientForm,
                                supportingMembers: [...startClientForm.supportingMembers, user.id]
                              });
                            } else {
                              setStartClientForm({
                                ...startClientForm,
                                supportingMembers: startClientForm.supportingMembers.filter(id => id !== user.id)
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`member-${user.id}`} className="text-sm">{user.name || user.email}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {startClientStep > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStartClientStep(startClientStep - 1)}
                >
                  Previous
                </Button>
              )}
              {startClientStep < startClientSections.length - 1 ? (
                <Button variant="brand" type="button" onClick={() => {
                    if (isStepValid()) {
                      setStartClientStep(startClientStep + 1);
                    }
                  }}
                  disabled={!isStepValid() || isStartClientSubmitting}
                >
                  Next
                </Button>
              ) : (
                <Button variant="brand" type="button" onClick={handleStartClientSubmit} disabled={!isStepValid() || isStartClientSubmitting}>
                  {isStartClientSubmitting ? 'Starting...' : 'Start Client'}
                </Button>
              )}
            </div>
          </DialogFooter>
        {startClientError && (
          <div className="text-rose-600 text-sm mt-2">{startClientError}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
