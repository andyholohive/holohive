'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  Plus, Search, Edit, Trash2, UserPlus,
  DollarSign, ArrowRight, MoreHorizontal, Users,
  History, TrendingUp, Target, Award, X, Link as LinkIcon,
  Building2, ChevronRight, ChevronDown, LayoutGrid, TableIcon, GripVertical,
  Mail, MessageSquare, Filter, Phone, ArrowUpDown, Handshake
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CRMService,
  CRMOpportunity,
  CRMAffiliate,
  CRMContact,
  CRMContactLink,
  CRMStageHistory,
  CreateOpportunityData,
  CreateContactData,
  OpportunityStage
} from '@/lib/crmService';
import { UserService } from '@/lib/userService';
import { ClientService, ClientWithAccess } from '@/lib/clientService';

export default function PipelinePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);
  const [clients, setClients] = useState<ClientWithAccess[]>([]);
  const [allContactLinks, setAllContactLinks] = useState<CRMContactLink[]>([]);
  const [isNewOpportunityOpen, setIsNewOpportunityOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<CRMOpportunity | null>(null);
  const [opportunityForm, setOpportunityForm] = useState<CreateOpportunityData>({
    name: '',
    stage: 'new',
    source: undefined,
  });
  const [opportunityType, setOpportunityType] = useState<'lead' | 'deal'>('lead');
  const [activeTab, setActiveTab] = useState<'outreach' | 'leads' | 'deals' | 'accounts'>('leads');
  const [outreachViewMode, setOutreachViewMode] = useState<'kanban' | 'table'>('table');
  const [leadsViewMode, setLeadsViewMode] = useState<'kanban' | 'table'>('table');
  const [dealsViewMode, setDealsViewMode] = useState<'kanban' | 'table'>('table');
  const [accountsViewMode, setAccountsViewMode] = useState<'kanban' | 'table'>('table');

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Affiliate combobox state
  const [affiliatePopoverOpen, setAffiliatePopoverOpen] = useState<string | null>(null);

  // Contact linking state
  const [isContactLinkOpen, setIsContactLinkOpen] = useState(false);
  const [linkingOpportunity, setLinkingOpportunity] = useState<CRMOpportunity | null>(null);
  const [opportunityContacts, setOpportunityContacts] = useState<CRMContactLink[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactRole, setContactRole] = useState<string>('');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);

  // New contact creation state (within manage contacts dialog)
  const [contactMode, setContactMode] = useState<'link' | 'create'>('link');
  const [newContactForm, setNewContactForm] = useState<CreateContactData>({ name: '' });

  // Stage history state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyOpportunity, setHistoryOpportunity] = useState<CRMOpportunity | null>(null);
  const [stageHistory, setStageHistory] = useState<CRMStageHistory[]>([]);

  // Delete confirmation dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [opportunityToDelete, setOpportunityToDelete] = useState<{ id: string; name: string } | null>(null);

  // Convert to deal dialog state
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [opportunityToConvert, setOpportunityToConvert] = useState<CRMOpportunity | null>(null);

  // Convert to account dialog state
  const [isConvertToAccountDialogOpen, setIsConvertToAccountDialogOpen] = useState(false);
  const [dealToConvertToAccount, setDealToConvertToAccount] = useState<CRMOpportunity | null>(null);

  // Analytics state
  const [metrics, setMetrics] = useState<{
    totalLeads: number;
    totalDeals: number;
    totalValue: number;
    wonValue: number;
    conversionRate: number;
  } | null>(null);

  // Filter state
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterAccountType, setFilterAccountType] = useState<string>('all');
  const [filterAffiliate, setFilterAffiliate] = useState<string>('all');

  // Sort state
  const [sortBy, setSortBy] = useState<string>('position');

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeOpportunity, setActiveOpportunity] = useState<CRMOpportunity | null>(null);

  // Collapsed stages state (dead is collapsed by default)
  const [collapsedStages, setCollapsedStages] = useState<Set<OpportunityStage>>(new Set(['dead']));

  // Adding new row state
  const [addingToStage, setAddingToStage] = useState<OpportunityStage | null>(null);
  const [newRowName, setNewRowName] = useState('');
  const savedScrollPositionRef = useRef<number>(0);

  // Bulk edit state
  const [selectedOpportunities, setSelectedOpportunities] = useState<string[]>([]);
  const [bulkEdit, setBulkEdit] = useState<Partial<CRMOpportunity>>({});

  // Helper to get scroll container
  const getScrollContainer = () => {
    return document.querySelector('[data-radix-scroll-area-viewport]') || document.scrollingElement;
  };

  // Helper to restore scroll position
  const restoreScrollPosition = () => {
    const scrollContainer = getScrollContainer();
    if (scrollContainer) {
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = savedScrollPositionRef.current;
      });
    }
  };

  const handleAddNewRow = (stage: OpportunityStage) => {
    // Capture scroll position before any state changes
    const scrollContainer = getScrollContainer();
    savedScrollPositionRef.current = scrollContainer?.scrollTop || 0;

    // Expand the stage if collapsed
    if (collapsedStages.has(stage)) {
      setCollapsedStages(prev => {
        const newSet = new Set(prev);
        newSet.delete(stage);
        return newSet;
      });
    }
    setAddingToStage(stage);
    setNewRowName('');

    // Restore scroll position after React renders
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollContainer) scrollContainer.scrollTop = savedScrollPositionRef.current;
      });
    });
  };

  const handleSaveNewRow = async () => {
    if (!addingToStage || !newRowName.trim()) {
      setAddingToStage(null);
      setNewRowName('');
      restoreScrollPosition();
      return;
    }

    const stageSaving = addingToStage;
    const nameSaving = newRowName.trim();

    // Clear input states first
    setAddingToStage(null);
    setNewRowName('');
    restoreScrollPosition();

    try {
      const newOpp = await CRMService.createOpportunity({
        name: nameSaving,
        stage: stageSaving,
        owner_id: user?.id,
        // For outreach tab, set source to cold_outreach
        source: activeTab === 'outreach' ? 'cold_outreach' : undefined
      });

      // Optimistic update - add to state directly
      if (newOpp) {
        setOpportunities(prev => [newOpp, ...prev]);
        restoreScrollPosition();
      }
    } catch (error) {
      console.error('Error creating opportunity:', error);
    }
  };

  const handleNewRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewRow();
    } else if (e.key === 'Escape') {
      setAddingToStage(null);
      setNewRowName('');
      restoreScrollPosition();
    }
  };

  const toggleStageCollapse = (stage: OpportunityStage) => {
    setCollapsedStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      return newSet;
    });
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const outreachStages: OpportunityStage[] = ['new'];  // Outreach shows only 'new' stage with source 'cold_outreach'
  const leadStages: OpportunityStage[] = ['new', 'contacted', 'qualified', 'unqualified', 'nurture', 'dead'];
  const dealStages: OpportunityStage[] = ['deal_qualified', 'proposal', 'negotiation', 'contract', 'closed_won', 'closed_lost'];
  const accountStages: OpportunityStage[] = ['account_active', 'account_churned'];
  const sourceOptions = ['referral', 'inbound', 'event', 'cold_outreach'];
  const accountTypeOptions = ['general', 'channel', 'campaign', 'lite', 'ad_hoc'];
  const scopeOptions = [
    { value: 'fundraising', label: 'Fundraising' },
    { value: 'advisory', label: 'Advisory' },
    { value: 'kol_activation', label: 'KOL Activation' },
    { value: 'gtm', label: 'GTM' },
    { value: 'bd_partnerships', label: 'BD/Partnerships' },
    { value: 'apac', label: 'APAC' },
  ];

  const stageLabels: Record<OpportunityStage, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    unqualified: 'Unqualified',
    nurture: 'Nurture',
    dead: 'Dead',
    deal_qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    contract: 'Contract',
    closed_won: 'Won',
    closed_lost: 'Lost',
    account_active: 'Active',
    account_at_risk: 'At Risk',
    account_churned: 'Churned'
  };

  const stageColors: Record<OpportunityStage, { bg: string; text: string; border: string; solid: string }> = {
    new: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', solid: 'bg-blue-500' },
    contacted: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', solid: 'bg-indigo-500' },
    qualified: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', solid: 'bg-green-500' },
    unqualified: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', solid: 'bg-gray-400' },
    nurture: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', solid: 'bg-amber-500' },
    dead: { bg: 'bg-stone-100', text: 'text-stone-600', border: 'border-stone-300', solid: 'bg-stone-500' },
    deal_qualified: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', solid: 'bg-green-500' },
    proposal: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', solid: 'bg-purple-500' },
    negotiation: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', solid: 'bg-orange-500' },
    contract: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', solid: 'bg-cyan-500' },
    closed_won: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', solid: 'bg-emerald-500' },
    closed_lost: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', solid: 'bg-red-500' },
    account_active: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', solid: 'bg-teal-500' },
    account_at_risk: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', solid: 'bg-yellow-500' },
    account_churned: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', solid: 'bg-slate-500' }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [opps, affs, conts, metricsData, contactLinks, allUsers, allClients] = await Promise.all([
        CRMService.getAllOpportunities(),
        CRMService.getAllAffiliates(),
        CRMService.getAllContacts(),
        CRMService.getOpportunityMetrics(),
        CRMService.getAllContactLinks(),
        UserService.getAllUsers(),
        ClientService.getAllClients()
      ]);
      setOpportunities(opps);
      setAffiliates(affs);
      setContacts(conts);
      setMetrics(metricsData);
      setAllContactLinks(contactLinks);
      setUsers(allUsers);
      setClients(allClients);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpportunity = async () => {
    if (!opportunityForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingOpportunity) {
        await CRMService.updateOpportunity(editingOpportunity.id, opportunityForm);
      } else {
        await CRMService.createOpportunity({
          ...opportunityForm,
          owner_id: user?.id
        });
      }
      setIsNewOpportunityOpen(false);
      setEditingOpportunity(null);
      setOpportunityForm({ name: '', stage: 'new' });
      fetchData();
    } catch (error) {
      console.error('Error saving opportunity:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOpportunity = (opp: CRMOpportunity) => {
    setEditingOpportunity(opp);
    const isDeal = dealStages.includes(opp.stage) || accountStages.includes(opp.stage);
    setOpportunityType(isDeal ? 'deal' : 'lead');
    setOpportunityForm({
      name: opp.name,
      stage: opp.stage,
      account_type: opp.account_type || undefined,
      deal_value: opp.deal_value || undefined,
      currency: opp.currency,
      source: opp.source || undefined,
      referrer: opp.referrer || undefined,
      gc: opp.gc || undefined,
      affiliate_id: opp.affiliate_id || undefined,
      client_id: opp.client_id || undefined,
      scope: opp.scope || undefined,
      notes: opp.notes || undefined
    });
    setIsNewOpportunityOpen(true);
  };

  const handleDeleteOpportunity = (opp: CRMOpportunity) => {
    setOpportunityToDelete({ id: opp.id, name: opp.name });
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteOpportunity = async () => {
    if (!opportunityToDelete) return;
    try {
      await CRMService.deleteOpportunity(opportunityToDelete.id);
      setIsDeleteDialogOpen(false);
      setOpportunityToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting opportunity:', error);
    }
  };

  const handleMoveStage = async (opp: CRMOpportunity, newStage: OpportunityStage) => {
    // If moving to qualified, show convert to deal dialog
    if (newStage === 'qualified' && opp.stage !== 'qualified') {
      // First move to qualified
      await performStageMove(opp, newStage);
      // Then ask if they want to convert to deal
      setOpportunityToConvert({ ...opp, stage: 'qualified' });
      setIsConvertDialogOpen(true);
      return;
    }

    // If moving to closed_won (deal won), show convert to account dialog
    if (newStage === 'closed_won' && opp.stage !== 'closed_won' && dealStages.includes(opp.stage)) {
      // First move to closed_won
      await performStageMove(opp, newStage);
      // Then ask if they want to convert to account
      setDealToConvertToAccount({ ...opp, stage: 'closed_won' });
      setIsConvertToAccountDialogOpen(true);
      return;
    }

    await performStageMove(opp, newStage);
  };

  const performStageMove = async (opp: CRMOpportunity, newStage: OpportunityStage) => {
    const oldStage = opp.stage;

    // Preserve scroll position
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]') || document.scrollingElement;
    const scrollTop = scrollContainer?.scrollTop || 0;

    // Optimistic update - update UI immediately
    setOpportunities(prev =>
      prev.map(o => o.id === opp.id ? { ...o, stage: newStage } : o)
    );

    // Restore scroll position after React re-render
    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollTop;
      }
    });

    try {
      await CRMService.updateOpportunity(opp.id, { stage: newStage });
    } catch (error) {
      console.error('Error moving stage:', error);
      // Revert on error
      setOpportunities(prev =>
        prev.map(o => o.id === opp.id ? { ...o, stage: oldStage } : o)
      );
    }
  };

  const handleConvertToDeal = async () => {
    if (!opportunityToConvert) return;
    await performStageMove(opportunityToConvert, 'deal_qualified');
    setIsConvertDialogOpen(false);
    setOpportunityToConvert(null);
  };

  const handleKeepAsLead = () => {
    setIsConvertDialogOpen(false);
    setOpportunityToConvert(null);
  };

  const handleConvertToAccount = async () => {
    if (!dealToConvertToAccount) return;
    await performStageMove(dealToConvertToAccount, 'account_active');
    setIsConvertToAccountDialogOpen(false);
    setDealToConvertToAccount(null);
  };

  const handleKeepAsDeal = () => {
    setIsConvertToAccountDialogOpen(false);
    setDealToConvertToAccount(null);
  };

  const handleInlineUpdate = async (oppId: string, field: string, value: any) => {
    // Preserve scroll position
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]') || document.scrollingElement;
    const scrollTop = scrollContainer?.scrollTop || 0;

    try {
      setOpportunities(prev =>
        prev.map(o => {
          if (o.id !== oppId) return o;

          const updates: Partial<CRMOpportunity> = { [field]: value || null };

          // Handle related object updates for display
          if (field === 'client_id') {
            const selectedClient = clients.find(c => c.id === value);
            updates.client = selectedClient ? { id: selectedClient.id, name: selectedClient.name } : null;
          } else if (field === 'affiliate_id') {
            const selectedAffiliate = affiliates.find(a => a.id === value);
            updates.affiliate = selectedAffiliate || null;
          }

          return { ...o, ...updates };
        })
      );

      // Restore scroll position after React re-render
      requestAnimationFrame(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollTop;
        }
      });

      await CRMService.updateOpportunity(oppId, { [field]: value || null });
    } catch (error) {
      console.error('Error updating field:', error);
    }
    setEditingCell(null);
    setEditingValue('');
  };

  // Bulk update handler
  const handleBulkUpdate = async () => {
    if (selectedOpportunities.length === 0 || Object.keys(bulkEdit).length === 0) return;

    // Filter out undefined values
    const updates: Record<string, any> = {};
    Object.entries(bulkEdit).forEach(([key, value]) => {
      if (value !== undefined) {
        updates[key] = value;
      }
    });

    if (Object.keys(updates).length === 0) return;

    try {
      // Optimistic update
      setOpportunities(prev =>
        prev.map(o => selectedOpportunities.includes(o.id) ? { ...o, ...updates } : o)
      );

      // Update in database
      await Promise.all(
        selectedOpportunities.map(id => CRMService.updateOpportunity(id, updates))
      );

      // Clear selection and bulk edit
      setSelectedOpportunities([]);
      setBulkEdit({});
    } catch (error) {
      console.error('Error bulk updating:', error);
    }
  };

  const startEditing = (id: string, field: string, currentValue: string | number | null | undefined) => {
    setEditingCell({ id, field });
    setEditingValue(currentValue?.toString() || '');
  };

  const handleKeyDown = (e: React.KeyboardEvent, oppId: string, field: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = field === 'deal_value' ? (parseFloat(editingValue) || null) : editingValue;
      handleInlineUpdate(oppId, field, value);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditingValue('');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    const opp = opportunities.find(o => o.id === active.id);
    setActiveOpportunity(opp || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOpportunity(null);

    if (!over) return;

    const oppId = active.id as string;
    const newStage = over.id as OpportunityStage;

    const opp = opportunities.find(o => o.id === oppId);
    if (!opp || opp.stage === newStage) return;

    // Check if the move is valid (leads can only move to lead stages, deals to deal stages)
    const isLeadStage = leadStages.includes(newStage);
    const isDealStage = dealStages.includes(newStage);
    const oppIsLead = leadStages.includes(opp.stage);
    const oppIsDeal = dealStages.includes(opp.stage);

    // Allow moving within same category, or from qualified to deal_qualified (converting lead to deal)
    if (oppIsLead && !isLeadStage && !(opp.stage === 'qualified' && newStage === 'deal_qualified')) {
      return;
    }
    if (oppIsDeal && !isDealStage) {
      return;
    }

    // If moving to qualified, show convert to deal dialog after the move
    if (newStage === 'qualified' && opp.stage !== 'qualified') {
      await performStageMove(opp, newStage);
      setOpportunityToConvert({ ...opp, stage: 'qualified' });
      setIsConvertDialogOpen(true);
      return;
    }

    await performStageMove(opp, newStage);
  };

  // Handler for table row reordering (supports cross-stage dragging)
  const handleTableRowDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveOpportunity(null);

    if (!over) return;

    const draggedOpp = opportunities.find(o => o.id === active.id);
    if (!draggedOpp) return;

    const overId = over.id as string;

    // Check if dropped on a stage droppable (stage name)
    const isStageDroppable = currentStages.includes(overId as OpportunityStage);

    // Check if dropped on another opportunity
    const targetOpp = opportunities.find(o => o.id === overId);

    if (isStageDroppable) {
      // Dropped on a stage area - move to that stage
      const newStage = overId as OpportunityStage;
      if (draggedOpp.stage !== newStage) {
        // If moving to qualified, show convert dialog
        if (newStage === 'qualified' && draggedOpp.stage !== 'qualified') {
          await performStageMove(draggedOpp, newStage);
          setOpportunityToConvert({ ...draggedOpp, stage: 'qualified' });
          setIsConvertDialogOpen(true);
          return;
        }

        // If moving to closed_won, show convert to account dialog
        if (newStage === 'closed_won' && draggedOpp.stage !== 'closed_won' && dealStages.includes(draggedOpp.stage)) {
          await performStageMove(draggedOpp, newStage);
          setDealToConvertToAccount({ ...draggedOpp, stage: 'closed_won' });
          setIsConvertToAccountDialogOpen(true);
          return;
        }

        await performStageMove(draggedOpp, newStage);
      }
    } else if (targetOpp) {
      // Dropped on another opportunity
      const sourceStage = draggedOpp.stage;
      const targetStage = targetOpp.stage;

      if (sourceStage === targetStage) {
        // Same stage - reorder within stage
        const stageOpps = currentOpportunities.filter(o => o.stage === sourceStage);
        const oldIndex = stageOpps.findIndex(o => o.id === active.id);
        const newIndex = stageOpps.findIndex(o => o.id === over.id);

        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

        const reordered = arrayMove(stageOpps, oldIndex, newIndex);
        const positionUpdates = reordered.map((opp, index) => ({
          id: opp.id,
          position: index
        }));

        setOpportunities(prev => {
          const otherOpps = prev.filter(o => o.stage !== sourceStage);
          const updatedOpps = reordered.map((opp, index) => ({
            ...opp,
            position: index
          }));
          return [...updatedOpps, ...otherOpps];
        });

        try {
          await CRMService.updateOpportunityPositions(positionUpdates);
        } catch (error) {
          console.error('Error updating positions:', error);
          const freshData = await CRMService.getAllOpportunities();
          setOpportunities(freshData);
        }
      } else {
        // Different stage - move to target stage at target position
        // If moving to qualified, show convert dialog
        if (targetStage === 'qualified' && draggedOpp.stage !== 'qualified') {
          await performStageMove(draggedOpp, targetStage);
          setOpportunityToConvert({ ...draggedOpp, stage: 'qualified' });
          setIsConvertDialogOpen(true);
          return;
        }

        // If moving to closed_won, show convert to account dialog
        if (targetStage === 'closed_won' && draggedOpp.stage !== 'closed_won' && dealStages.includes(draggedOpp.stage)) {
          await performStageMove(draggedOpp, targetStage);
          setDealToConvertToAccount({ ...draggedOpp, stage: 'closed_won' });
          setIsConvertToAccountDialogOpen(true);
          return;
        }

        await performStageMove(draggedOpp, targetStage);
      }
    }
  };

  const handleOpenContactLink = async (opp: CRMOpportunity) => {
    setLinkingOpportunity(opp);
    setSelectedContactId('');
    setContactRole('');
    setIsPrimaryContact(false);
    try {
      const links = await CRMService.getContactsForOpportunity(opp.id);
      setOpportunityContacts(links);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setOpportunityContacts([]);
    }
    setIsContactLinkOpen(true);
  };

  const handleLinkContact = async () => {
    if (!linkingOpportunity || !selectedContactId) return;
    setIsSubmitting(true);
    try {
      await CRMService.linkContactToOpportunity(
        selectedContactId,
        linkingOpportunity.id,
        contactRole || undefined,
        isPrimaryContact
      );
      const links = await CRMService.getContactsForOpportunity(linkingOpportunity.id);
      setOpportunityContacts(links);
      setSelectedContactId('');
      setContactRole('');
      setIsPrimaryContact(false);
    } catch (error) {
      console.error('Error linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkContact = async (linkId: string) => {
    if (!linkingOpportunity) return;
    try {
      await CRMService.unlinkContact(linkId);
      const links = await CRMService.getContactsForOpportunity(linkingOpportunity.id);
      setOpportunityContacts(links);
    } catch (error) {
      console.error('Error unlinking contact:', error);
    }
  };

  const handleCreateAndLinkContact = async () => {
    if (!linkingOpportunity || !newContactForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      // Create the new contact
      const newContact = await CRMService.createContact({
        ...newContactForm,
        owner_id: user?.id
      });

      // Link the new contact to the opportunity
      await CRMService.linkContactToOpportunity(
        newContact.id,
        linkingOpportunity.id,
        contactRole || undefined,
        isPrimaryContact
      );

      // Refresh contacts list
      const [allConts, links] = await Promise.all([
        CRMService.getAllContacts(),
        CRMService.getContactsForOpportunity(linkingOpportunity.id)
      ]);
      setContacts(allConts);
      setOpportunityContacts(links);

      // Reset form
      setNewContactForm({ name: '' });
      setContactRole('');
      setIsPrimaryContact(false);
      setContactMode('link');
    } catch (error) {
      console.error('Error creating and linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenHistory = async (opp: CRMOpportunity) => {
    setHistoryOpportunity(opp);
    try {
      const history = await CRMService.getStageHistory('opportunity', opp.id);
      setStageHistory(history);
    } catch (error) {
      console.error('Error fetching history:', error);
      setStageHistory([]);
    }
    setIsHistoryOpen(true);
  };

  const filteredOpportunities = opportunities
    .filter(o => {
      // Search filter
      if (searchTerm && !o.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      // Source filter
      if (filterSource !== 'all' && o.source !== filterSource) {
        return false;
      }
      // Account type filter
      if (filterAccountType !== 'all' && o.account_type !== filterAccountType) {
        return false;
      }
      // Affiliate filter
      if (filterAffiliate !== 'all' && o.affiliate_id !== filterAffiliate) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'position':
          return (a.position || 0) - (b.position || 0);
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'value_desc':
          return (b.deal_value || 0) - (a.deal_value || 0);
        case 'value_asc':
          return (a.deal_value || 0) - (b.deal_value || 0);
        default:
          // Default to position-based ordering
          return (a.position || 0) - (b.position || 0);
      }
    });

  const getOpportunitiesByStage = (stage: OpportunityStage) =>
    filteredOpportunities.filter(o => o.stage === stage);

  // Check if any filters are active
  const hasActiveFilters = filterSource !== 'all' || filterAccountType !== 'all' || filterAffiliate !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setFilterSource('all');
    setFilterAccountType('all');
    setFilterAffiliate('all');
    setSearchTerm('');
  };

  // Mark opportunity as contacted
  const handleMarkContacted = async (oppId: string) => {
    try {
      await CRMService.updateOpportunity(oppId, {
        last_contacted_at: new Date().toISOString()
      });
      // Optimistic update
      setOpportunities(prev =>
        prev.map(o => o.id === oppId ? { ...o, last_contacted_at: new Date().toISOString() } : o)
      );
    } catch (error) {
      console.error('Error updating last contacted:', error);
    }
  };

  // Count outreach: new stage with cold_outreach source
  const totalOutreach = filteredOpportunities.filter(o => o.stage === 'new' && o.source === 'cold_outreach').length;
  // Count leads: lead stages excluding cold_outreach new leads
  const totalLeads = filteredOpportunities.filter(o => {
    if (o.stage === 'new' && o.source === 'cold_outreach') return false;
    return leadStages.includes(o.stage);
  }).length;
  const totalDeals = dealStages.reduce((sum, stage) => sum + getOpportunitiesByStage(stage).length, 0);
  const totalAccounts = accountStages.reduce((sum, stage) => sum + getOpportunitiesByStage(stage).length, 0);
  const totalDealValue = filteredOpportunities
    .filter(o => dealStages.includes(o.stage))
    .reduce((sum, o) => sum + (o.deal_value || 0), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatShortDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatSource = (source: string) => {
    return source
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getNextStage = (currentStage: OpportunityStage): OpportunityStage | null => {
    const leadIndex = leadStages.indexOf(currentStage);
    const dealIndex = dealStages.indexOf(currentStage);

    if (leadIndex >= 0 && leadIndex < leadStages.length - 1) {
      return leadStages[leadIndex + 1];
    }
    if (dealIndex >= 0 && dealIndex < dealStages.length - 1) {
      return dealStages[dealIndex + 1];
    }
    return null;
  };

  // Get linked contacts for an opportunity
  const getOpportunityContacts = (oppId: string) => {
    return allContactLinks.filter(link => link.opportunity_id === oppId);
  };

  // Get primary contact for an opportunity
  const getPrimaryContact = (oppId: string) => {
    const links = getOpportunityContacts(oppId);
    return links.find(l => l.is_primary)?.contact || links[0]?.contact || null;
  };

  // Get current stages based on active tab
  const currentStages = (() => {
    switch (activeTab) {
      case 'outreach': return outreachStages;
      case 'leads': return leadStages;
      case 'deals': return dealStages;
      case 'accounts': return accountStages;
      default: return leadStages;
    }
  })();

  // Get current view mode based on active tab
  const currentViewMode = (() => {
    switch (activeTab) {
      case 'outreach': return outreachViewMode;
      case 'leads': return leadsViewMode;
      case 'deals': return dealsViewMode;
      case 'accounts': return accountsViewMode;
      default: return leadsViewMode;
    }
  })();

  const setCurrentViewMode = (mode: 'kanban' | 'table') => {
    switch (activeTab) {
      case 'outreach': setOutreachViewMode(mode); break;
      case 'leads': setLeadsViewMode(mode); break;
      case 'deals': setDealsViewMode(mode); break;
      case 'accounts': setAccountsViewMode(mode); break;
    }
  };

  const currentOpportunities = filteredOpportunities.filter(o => {
    // Outreach tab: show only 'new' stage with source 'cold_outreach'
    if (activeTab === 'outreach') {
      return o.stage === 'new' && o.source === 'cold_outreach';
    }
    // Leads tab: show lead stages but exclude cold_outreach new leads (they're in outreach)
    if (activeTab === 'leads') {
      if (o.stage === 'new' && o.source === 'cold_outreach') {
        return false;
      }
      return leadStages.includes(o.stage);
    }
    // Deals and Accounts: filter by their respective stages
    return currentStages.includes(o.stage);
  });

  // ============================================
  // RENDER: Opportunity Card Content
  // ============================================
  const renderOpportunityCardContent = (opp: CRMOpportunity, isDeal: boolean = false, isDragging: boolean = false) => {
    const colors = stageColors[opp.stage] || stageColors.new;

    return (
      <Card
        className={`group hover:shadow-md transition-all duration-200 border-l-4 ${colors.border} ${isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Name with drag handle */}
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing" />
                <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <p className="font-medium text-gray-900 truncate">{opp.name}</p>
              </div>

              {/* Deal Value */}
              {isDeal && opp.deal_value && (
                <p className="text-lg font-semibold text-emerald-600 mt-2">
                  {formatCurrency(opp.deal_value)}
                </p>
              )}

              {/* Badges: Source, Account Type, Affiliate */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {opp.source && (
                  <Badge variant="outline" className="text-xs bg-white">
                    {formatSource(opp.source)}
                  </Badge>
                )}
                {opp.account_type && (
                  <Badge variant="outline" className="text-xs bg-white">
                    {formatSource(opp.account_type)}
                  </Badge>
                )}
                {opp.affiliate && (
                  <Badge
                    className="text-xs"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    {opp.affiliate.name}
                  </Badge>
                )}
              </div>

              {/* Details: Referrer, Group Chat, Notes */}
              <div className="mt-3 space-y-1.5 text-xs text-gray-500">
                {opp.referrer && (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 flex-shrink-0" />
                    <span>Referred by: {opp.referrer}</span>
                  </div>
                )}
                {opp.gc && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3 flex-shrink-0 text-blue-500" />
                      <span className="font-medium">TG Connected</span>
                    </div>
                    <div className="ml-4 text-xs space-y-0.5">
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>Their msg:</span>
                        <span className={opp.last_message_at ? 'text-gray-700' : 'text-gray-400'}>
                          {opp.last_message_at ? formatShortDate(opp.last_message_at) : 'No messages yet'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500">
                        <span>Our reply:</span>
                        <span className={opp.last_reply_at ? 'text-gray-700' : 'text-gray-400'}>
                          {opp.last_reply_at ? formatShortDate(opp.last_reply_at) : 'No replies yet'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {opp.notes && (
                  <div className="flex items-start gap-1.5">
                    <Edit className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{opp.notes}</span>
                  </div>
                )}
              </div>

              {/* Linked Contacts */}
              {(() => {
                const oppContacts = getOpportunityContacts(opp.id);
                if (oppContacts.length === 0) return null;
                const primaryContact = oppContacts.find(l => l.is_primary)?.contact || oppContacts[0]?.contact;
                return (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs">
                      <Users className="h-3 w-3 text-blue-500 flex-shrink-0" />
                      <span className="font-medium text-gray-700">{primaryContact?.name}</span>
                      {oppContacts.length > 1 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          +{oppContacts.length - 1}
                        </Badge>
                      )}
                    </div>
                    {primaryContact?.email && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 ml-5">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{primaryContact.email}</span>
                      </div>
                    )}
                    {primaryContact?.telegram_id && !primaryContact?.email && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 ml-5">
                        <MessageSquare className="h-3 w-3" />
                        <span>@{primaryContact.telegram_id}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>

            {!isDragging && renderActionMenu(opp)}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================
  // RENDER: Draggable Opportunity Card
  // ============================================
  const DraggableCard = ({ opp, isDeal }: { opp: CRMOpportunity; isDeal: boolean }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: opp.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {renderOpportunityCardContent(opp, isDeal, isDragging)}
      </div>
    );
  };

  // ============================================
  // RENDER: Action Menu (shared across views)
  // ============================================
  const renderActionMenu = (opp: CRMOpportunity) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => handleEditOpportunity(opp)}>
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpenContactLink(opp)}>
          <Users className="h-4 w-4 mr-2" />
          Manage Contacts
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpenHistory(opp)}>
          <History className="h-4 w-4 mr-2" />
          View History
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleMarkContacted(opp.id)}>
          <Phone className="h-4 w-4 mr-2" />
          Mark as Contacted
        </DropdownMenuItem>
        {getNextStage(opp.stage) && (
          <DropdownMenuItem onClick={() => handleMoveStage(opp, getNextStage(opp.stage)!)}>
            <ChevronRight className="h-4 w-4 mr-2" />
            Move to {stageLabels[getNextStage(opp.stage)!]}
          </DropdownMenuItem>
        )}
        {opp.stage === 'contract' && (
          <>
            <DropdownMenuItem onClick={() => handleMoveStage(opp, 'closed_won')}>
              <Award className="h-4 w-4 mr-2 text-emerald-600" />
              Mark as Won
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleMoveStage(opp, 'closed_lost')}>
              <X className="h-4 w-4 mr-2 text-red-600" />
              Mark as Lost
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          className="text-red-600"
          onClick={() => handleDeleteOpportunity(opp)}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ============================================
  // RENDER: Droppable Kanban Column
  // ============================================
  const DroppableColumn = ({ stage, isDeal }: { stage: OpportunityStage; isDeal: boolean }) => {
    const { setNodeRef, isOver } = useDroppable({ id: stage });
    const opps = getOpportunitiesByStage(stage);
    const colors = stageColors[stage];
    const stageValue = isDeal
      ? opps.reduce((sum, o) => sum + (o.deal_value || 0), 0)
      : null;
    const isCollapsed = collapsedStages.has(stage);

    return (
      <div
        key={stage}
        className={`${isCollapsed ? 'w-12' : 'flex-1 min-w-[280px] max-w-[320px]'} flex flex-col h-full transition-all duration-200`}
      >
        {/* Column Header */}
        <div
          className={`${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} px-4 py-3 ${colors.bg} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} flex-shrink-0 cursor-pointer select-none`}
          onClick={() => toggleStageCollapse(stage)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isCollapsed ? (
                <ChevronRight className={`w-4 h-4 ${colors.text}`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${colors.text}`} />
              )}
              {!isCollapsed && (
                <>
                  <h4 className={`font-semibold ${colors.text}`}>{stageLabels[stage]}</h4>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {opps.length}
                  </Badge>
                </>
              )}
            </div>
          </div>
          {!isCollapsed && isDeal && stageValue !== null && stageValue > 0 && (
            <p className="text-sm font-medium text-gray-600 mt-1">
              {formatCurrency(stageValue)}
            </p>
          )}
          {isCollapsed && (
            <div className="mt-2 flex flex-col items-center gap-1">
              <span className={`font-semibold ${colors.text}`} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                {stageLabels[stage]}
              </span>
              <Badge variant="secondary" className="text-xs font-medium mt-1">
                {opps.length}
              </Badge>
            </div>
          )}
        </div>

        {/* Column Content - Droppable Area */}
        {!isCollapsed && (
          <div
            ref={setNodeRef}
            className={`flex-1 bg-gray-50/50 border border-gray-200 border-t-0 rounded-b-lg p-3 space-y-3 overflow-y-auto transition-colors ${
              isOver ? 'bg-blue-50 border-blue-300' : ''
            }`}
          >
            <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
              {opps.length === 0 ? (
                <div className={`flex items-center justify-center h-24 text-sm ${isOver ? 'text-blue-500' : 'text-gray-400'}`}>
                  {isOver ? 'Drop here' : 'No opportunities'}
                </div>
              ) : (
                opps.map((opp) => (
                  <DraggableCard key={opp.id} opp={opp} isDeal={isDeal} />
                ))
              )}
            </SortableContext>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // RENDER: Table View
  // ============================================
  const renderTableView = () => {
    const isDeal = activeTab === 'deals' || activeTab === 'accounts';
    const isAccount = activeTab === 'accounts';
    const currentStages = isAccount ? accountStages : isDeal ? dealStages : leadStages;

    const renderEditableText = (opp: CRMOpportunity, field: string, value: string | null | undefined, className?: string) => {
      const isEditing = editingCell?.id === opp.id && editingCell?.field === field;

      if (isEditing) {
        return (
          <Input
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => handleInlineUpdate(opp.id, field, editingValue)}
            onKeyDown={(e) => handleKeyDown(e, opp.id, field)}
            className="h-8 text-sm auth-input"
            autoFocus
          />
        );
      }

      return (
        <div
          onClick={() => startEditing(opp.id, field, value)}
          className={`cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center ${className || ''}`}
        >
          {value || <span className="text-gray-400">-</span>}
        </div>
      );
    };

    const renderEditableNumber = (opp: CRMOpportunity, field: string, value: number | null | undefined) => {
      const isEditing = editingCell?.id === opp.id && editingCell?.field === field;

      if (isEditing) {
        return (
          <Input
            type="number"
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => handleInlineUpdate(opp.id, field, parseFloat(editingValue) || null)}
            onKeyDown={(e) => handleKeyDown(e, opp.id, field)}
            className="h-8 text-sm text-right auth-input"
            autoFocus
          />
        );
      }

      return (
        <div
          onClick={() => startEditing(opp.id, field, value)}
          className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 min-h-[28px] flex items-center justify-end"
        >
          {value ? (
            <span className="font-semibold text-emerald-600">{formatCurrency(value)}</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      );
    };

    // Draggable table row component
    const DraggableTableRow = ({ opp, index }: { opp: CRMOpportunity; index: number }) => {
      const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
      } = useSortable({ id: opp.id });

      const style: React.CSSProperties = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 1 : 0,
      };

      return (
        <TableRow ref={setNodeRef} style={style} className={`group hover:bg-gray-50 ${isDragging ? 'bg-blue-50 shadow-lg' : ''}`}>
          <TableCell className="w-10">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
            >
              <GripVertical className="h-4 w-4 text-gray-400" />
            </div>
          </TableCell>
          <TableCell className="text-gray-500 text-sm w-10">
            {(() => {
              const isChecked = selectedOpportunities.includes(opp.id);
              return (
                <div className="flex items-center justify-center">
                  {isChecked ? (
                    <Checkbox
                      checked={true}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedOpportunities(prev => [...prev, opp.id]);
                        } else {
                          setSelectedOpportunities(prev => prev.filter(id => id !== opp.id));
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="block group-hover:hidden">{index + 1}</span>
                      <span className="hidden group-hover:flex">
                        <Checkbox
                          checked={false}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedOpportunities(prev => [...prev, opp.id]);
                            }
                          }}
                        />
                      </span>
                    </>
                  )}
                </div>
              );
            })()}
          </TableCell>
          <TableCell>
            {editingCell?.id === opp.id && editingCell?.field === 'name' ? (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={() => handleInlineUpdate(opp.id, 'name', editingValue)}
                onKeyDown={(e) => handleKeyDown(e, opp.id, 'name')}
                className="h-8 text-sm font-medium auth-input"
                autoFocus
              />
            ) : (
              <div
                onClick={() => startEditing(opp.id, 'name', opp.name)}
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1"
              >
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{opp.name}</span>
              </div>
            )}
          </TableCell>
          <TableCell>
            <Select
              value={opp.stage}
              onValueChange={(v) => handleMoveStage(opp, v as OpportunityStage)}
            >
              <SelectTrigger className={`w-32 h-8 ${stageColors[opp.stage].bg} ${stageColors[opp.stage].text} border-none text-xs font-medium`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currentStages.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stageLabels[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            <Select
              value={opp.owner_id || 'none'}
              onValueChange={(v) => handleInlineUpdate(opp.id, 'owner_id', v === 'none' ? null : v)}
            >
              <SelectTrigger className="w-32 h-8 text-xs auth-input">
                <SelectValue placeholder="Select">
                  {opp.owner_id ? (users.find(u => u.id === opp.owner_id)?.name || users.find(u => u.id === opp.owner_id)?.email || '-') : <span className="text-gray-400">-</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell>
            <Select
              value={opp.source || 'none'}
              onValueChange={(v) => handleInlineUpdate(opp.id, 'source', v === 'none' ? null : v)}
            >
              <SelectTrigger className="w-32 h-8 text-xs auth-input">
                <SelectValue placeholder="Select">
                  {opp.source ? formatSource(opp.source) : <span className="text-gray-400">-</span>}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {sourceOptions.map((source) => (
                  <SelectItem key={source} value={source}>
                    {formatSource(source)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
          {isDeal && (
            <TableCell>
              <Select
                value={opp.account_type || 'none'}
                onValueChange={(v) => handleInlineUpdate(opp.id, 'account_type', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-28 h-8 text-xs auth-input">
                  <SelectValue placeholder="Select">
                    {opp.account_type ? formatSource(opp.account_type) : <span className="text-gray-400">-</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {accountTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatSource(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          )}
          <TableCell>
            <Popover open={affiliatePopoverOpen === opp.id} onOpenChange={(open) => setAffiliatePopoverOpen(open ? opp.id : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={affiliatePopoverOpen === opp.id}
                  className="w-32 h-8 justify-between text-xs auth-input"
                >
                  {opp.affiliate ? (
                    <Badge className="text-xs truncate" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                      {opp.affiliate.name}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                  <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search affiliate..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No affiliate found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          handleInlineUpdate(opp.id, 'affiliate_id', null);
                          setAffiliatePopoverOpen(null);
                        }}
                      >
                        <Check className={`mr-2 h-4 w-4 ${!opp.affiliate_id ? 'opacity-100' : 'opacity-0'}`} />
                        None
                      </CommandItem>
                      {affiliates.map((aff) => (
                        <CommandItem
                          key={aff.id}
                          value={aff.name}
                          onSelect={() => {
                            handleInlineUpdate(opp.id, 'affiliate_id', aff.id);
                            setAffiliatePopoverOpen(null);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${opp.affiliate_id === aff.id ? 'opacity-100' : 'opacity-0'}`} />
                          {aff.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </TableCell>
          {isAccount && (
            <TableCell>
              <Select
                value={opp.client_id || 'none'}
                onValueChange={(v) => handleInlineUpdate(opp.id, 'client_id', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-32 h-8 text-xs auth-input">
                  <SelectValue placeholder="Select">
                    {opp.client ? (
                      <span className="truncate">{opp.client.name}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          )}
          {isAccount && (
            <TableCell>
              <Select
                value={opp.scope || 'none'}
                onValueChange={(v) => handleInlineUpdate(opp.id, 'scope', v === 'none' ? null : v)}
              >
                <SelectTrigger className="w-32 h-8 text-xs auth-input">
                  <SelectValue placeholder="Select">
                    {opp.scope ? (
                      <span className="truncate">{scopeOptions.find(s => s.value === opp.scope)?.label || opp.scope}</span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {scopeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
          )}
          <TableCell>
            {(() => {
              const oppContacts = getOpportunityContacts(opp.id);
              if (oppContacts.length === 0) return <span className="text-gray-400">-</span>;
              const primaryContact = oppContacts.find(l => l.is_primary)?.contact || oppContacts[0]?.contact;
              const primaryLink = oppContacts.find(l => l.is_primary) || oppContacts[0];
              return (
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <div className="flex items-center gap-2 cursor-pointer">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium hover:text-blue-600">{primaryContact?.name}</span>
                        {primaryContact?.email && (
                          <span className="text-xs text-gray-500">{primaryContact.email}</span>
                        )}
                        {primaryContact?.telegram_id && !primaryContact?.email && (
                          <span className="text-xs text-gray-500">@{primaryContact.telegram_id}</span>
                        )}
                      </div>
                      {oppContacts.length > 1 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          +{oppContacts.length - 1}
                        </Badge>
                      )}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent className="w-72" align="start">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{primaryContact?.name}</p>
                          {primaryLink?.role && (
                            <p className="text-xs text-gray-500">{primaryLink.role}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        {primaryContact?.email && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Mail className="h-3.5 w-3.5" />
                            <span>{primaryContact.email}</span>
                          </div>
                        )}
                        {primaryContact?.telegram_id && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>@{primaryContact.telegram_id}</span>
                          </div>
                        )}
                        {primaryContact?.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="h-3.5 w-3.5" />
                            <span>{primaryContact.phone}</span>
                          </div>
                        )}
                      </div>
                      {oppContacts.length > 1 && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-gray-500">
                            +{oppContacts.length - 1} more contact{oppContacts.length > 2 ? 's' : ''}
                          </p>
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })()}
          </TableCell>
          <TableCell>
            {renderEditableText(opp, 'referrer', opp.referrer, 'text-sm text-gray-600')}
          </TableCell>
          {activeTab !== 'accounts' && (
            <TableCell className="text-sm text-gray-500">
              {opp.last_contacted_at ? formatShortDate(opp.last_contacted_at) : '-'}
            </TableCell>
          )}
          <TableCell className="text-sm text-gray-500">
            {opp.created_at ? formatShortDate(opp.created_at) : '-'}
          </TableCell>
          <TableCell>
            {renderActionMenu(opp)}
          </TableCell>
        </TableRow>
      );
    };

    // Droppable stage table component
    const DroppableStageTable = ({ stage }: { stage: OpportunityStage }) => {
      const { setNodeRef, isOver } = useDroppable({ id: stage });
      const stageOpps = currentOpportunities.filter(o => o.stage === stage);
      const colors = stageColors[stage];
      const stageValue = isDeal ? stageOpps.reduce((sum, o) => sum + (o.deal_value || 0), 0) : null;
      const isCollapsed = collapsedStages.has(stage);

      return (
        <div key={stage} className="mb-4">
          {/* Stage Header */}
          <div
            className={`flex items-center justify-between px-4 py-3 ${colors.bg} ${isCollapsed ? 'rounded-lg' : 'rounded-t-lg'} border ${colors.border} ${isCollapsed ? '' : 'border-b-0'} cursor-pointer select-none transition-all ${isOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}
            onClick={() => toggleStageCollapse(stage)}
          >
            <div className="flex items-center gap-3">
              {isCollapsed ? (
                <ChevronRight className={`w-4 h-4 ${colors.text}`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${colors.text}`} />
              )}
              <div className={`w-3 h-3 rounded-full ${colors.solid}`} />
              <h3 className={`font-semibold ${colors.text}`}>{stageLabels[stage]}</h3>
              <Badge variant="secondary" className="text-xs font-medium">
                {stageOpps.length}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {isDeal && stageValue !== null && stageValue > 0 && (
                <span className="text-sm font-medium text-gray-600">
                  {formatCurrency(stageValue)}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 px-2 ${colors.text} hover:bg-black/10`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddNewRow(stage);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stage Table (collapsible) */}
          {!isCollapsed && (
            <div
              ref={setNodeRef}
              className={`bg-white rounded-b-lg border border-gray-200 border-t-0 overflow-hidden transition-all ${isOver ? 'bg-blue-50' : ''}`}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Source</TableHead>
                    {isDeal && <TableHead>Account Type</TableHead>}
                    <TableHead>Affiliate</TableHead>
                    {isAccount && <TableHead>Client</TableHead>}
                    {isAccount && <TableHead>Scope</TableHead>}
                    <TableHead>Contact</TableHead>
                    <TableHead>Referrer</TableHead>
                    {activeTab !== 'accounts' && <TableHead>Last Contacted</TableHead>}
                    <TableHead>Created</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* New row input */}
                  {addingToStage === stage && (
                    <TableRow className="bg-blue-50/50">
                      <TableCell className="w-10">
                        <div className="p-1">
                          <GripVertical className="h-4 w-4 text-gray-300" />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm w-10">•</TableCell>
                      <TableCell>
                        <Input
                          value={newRowName}
                          onChange={(e) => setNewRowName(e.target.value)}
                          onBlur={handleSaveNewRow}
                          onKeyDown={handleNewRowKeyDown}
                          placeholder="Enter opportunity name..."
                          className="h-8 text-sm font-medium auth-input"
                          autoFocus
                        />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}>
                          {stageLabels[stage]}
                        </span>
                      </TableCell>
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      {isDeal && <TableCell><span className="text-gray-400">-</span></TableCell>}
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      {isAccount && <TableCell><span className="text-gray-400">-</span></TableCell>}
                      {isAccount && <TableCell><span className="text-gray-400">-</span></TableCell>}
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      {activeTab !== 'accounts' && <TableCell><span className="text-gray-400">-</span></TableCell>}
                      <TableCell><span className="text-gray-400">-</span></TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                          onClick={() => {
                            setAddingToStage(null);
                            setNewRowName('');
                            restoreScrollPosition();
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                  {stageOpps.length === 0 && addingToStage !== stage ? (
                    <TableRow>
                      <TableCell colSpan={isAccount ? 14 : isDeal ? 13 : 12} className="text-center py-6 text-gray-400 text-sm">
                        {isOver ? 'Drop here to move to this stage' : `No ${activeTab} in this stage`}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <SortableContext items={stageOpps.map(o => o.id)} strategy={verticalListSortingStrategy}>
                      {stageOpps.map((opp, index) => (
                        <DraggableTableRow key={opp.id} opp={opp} index={index + (addingToStage === stage ? 1 : 0)} />
                      ))}
                    </SortableContext>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="pb-8">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleTableRowDragEnd}
        >
          {currentStages.map((stage) => (
            <DroppableStageTable key={stage} stage={stage} />
          ))}
          <DragOverlay>
            {activeOpportunity ? (
              <div className="bg-white border border-gray-300 shadow-lg rounded px-4 py-2 flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-gray-400" />
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{activeOpportunity.name}</span>
                <Badge className={`text-xs ${stageColors[activeOpportunity.stage].bg} ${stageColors[activeOpportunity.stage].text}`}>
                  {stageLabels[activeOpportunity.stage]}
                </Badge>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    );
  };

  // ============================================
  // RENDER: Kanban View
  // ============================================
  const renderKanbanView = () => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {currentStages.map((stage) => (
          <DroppableColumn key={stage} stage={stage} isDeal={activeTab === 'deals' || activeTab === 'accounts'} />
        ))}
      </div>
      <DragOverlay>
        {activeOpportunity ? (
          <div className="w-[280px]">
            {renderOpportunityCardContent(activeOpportunity, activeTab === 'deals' || activeTab === 'accounts', true)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  if (loading) {
    return (
      <div className="flex flex-col h-full gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-64 rounded-md" />
            <Skeleton className="h-10 w-36 rounded-md" />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-6 w-px" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>

        {/* Tabs and Table */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-10 w-56 rounded-md" />
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
          <div className="space-y-6 overflow-auto flex-1">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-12 w-full rounded-t-lg" />
                <div className="bg-white rounded-b-lg border border-gray-200 border-t-0 p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(2)].map((_, j) => (
                    <Skeleton key={j} className="h-14 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pipeline</h2>
          <p className="text-gray-600">Manage your leads and deals</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search opportunities..."
              className="pl-10 w-64 auth-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setEditingOpportunity(null);
              // Set opportunity type and default stage based on active tab
              const typeAndStage = (() => {
                switch (activeTab) {
                  case 'outreach': return { type: 'lead' as const, stage: 'new' as OpportunityStage, source: 'cold_outreach' as const };
                  case 'leads': return { type: 'lead' as const, stage: 'new' as OpportunityStage };
                  case 'deals': return { type: 'deal' as const, stage: 'deal_qualified' as OpportunityStage };
                  case 'accounts': return { type: 'deal' as const, stage: 'account_active' as OpportunityStage };
                  default: return { type: 'lead' as const, stage: 'new' as OpportunityStage };
                }
              })();
              setOpportunityType(typeAndStage.type);
              setOpportunityForm({
                name: '',
                stage: typeAndStage.stage,
                source: typeAndStage.source
              });
              setIsNewOpportunityOpen(true);
            }}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Opportunity
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Leads</p>
                <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
              </div>
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <UserPlus className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Active Deals</p>
                <p className="text-2xl font-bold text-gray-900">{totalDeals}</p>
              </div>
              <div className="p-2.5 bg-purple-100 rounded-lg">
                <Handshake className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-50 to-white border-cyan-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-600">Outreach</p>
                <p className="text-2xl font-bold text-gray-900">{totalOutreach}</p>
              </div>
              <div className="p-2.5 bg-cyan-100 rounded-lg">
                <Mail className="h-5 w-5 text-cyan-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600">Accounts</p>
                <p className="text-2xl font-bold text-gray-900">{totalAccounts}</p>
              </div>
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600">Win Rate</p>
                <p className="text-2xl font-bold text-gray-900">{(metrics?.conversionRate || 0).toFixed(1)}%</p>
              </div>
              <div className="p-2.5 bg-amber-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">Filters:</span>
        </div>
        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-36 h-9 text-sm auth-input">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourceOptions.map(src => (
              <SelectItem key={src} value={src}>{formatSource(src)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAccountType} onValueChange={setFilterAccountType}>
          <SelectTrigger className="w-40 h-9 text-sm auth-input">
            <SelectValue placeholder="Account Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Account Types</SelectItem>
            {accountTypeOptions.map(type => (
              <SelectItem key={type} value={type}>{formatSource(type)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAffiliate} onValueChange={setFilterAffiliate}>
          <SelectTrigger className="w-36 h-9 text-sm auth-input">
            <SelectValue placeholder="Affiliate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Affiliates</SelectItem>
            {affiliates.map(aff => (
              <SelectItem key={aff.id} value={aff.id}>{aff.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="h-6 w-px bg-gray-300" />
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">Sort:</span>
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40 h-9 text-sm auth-input">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="position">Custom Order</SelectItem>
            <SelectItem value="created_desc">Newest First</SelectItem>
            <SelectItem value="created_asc">Oldest First</SelectItem>
            <SelectItem value="name_asc">Name A-Z</SelectItem>
            <SelectItem value="name_desc">Name Z-A</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedOpportunities.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
              <span className="text-sm font-semibold text-gray-700">{selectedOpportunities.length} opportunit{selectedOpportunities.length !== 1 ? 'ies' : 'y'} selected</span>
            </div>
            <div className="h-4 w-px bg-gray-300"></div>
            <span className="text-xs text-gray-600 font-medium">Bulk Edit Fields</span>
          </div>
          <div className="mb-4 pb-4 border-b border-gray-200">
            <Button
              size="sm"
              variant="outline"
              className="text-gray-600 border-gray-300 hover:bg-gray-50"
              onClick={() => {
                const currentOpps = currentOpportunities;
                const allIds = currentOpps.map(o => o.id);
                if (allIds.every(id => selectedOpportunities.includes(id))) {
                  setSelectedOpportunities(prev => prev.filter(id => !allIds.includes(id)));
                } else {
                  setSelectedOpportunities(prev => Array.from(new Set([...prev, ...allIds])));
                }
              }}
            >
              {currentOpportunities.length > 0 && currentOpportunities.every(o => selectedOpportunities.includes(o.id)) ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {/* Stage */}
            <div className="min-w-[120px] flex flex-col">
              <span className="text-xs text-gray-600 font-semibold mb-1">Stage</span>
              <Select value={bulkEdit.stage || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, stage: v as OpportunityStage }))}>
                <SelectTrigger className="h-8 text-xs auth-input">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {(activeTab === 'accounts' ? accountStages : activeTab === 'deals' ? dealStages : leadStages).map((stage) => (
                    <SelectItem key={stage} value={stage}>{stageLabels[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Owner */}
            <div className="min-w-[120px] flex flex-col">
              <span className="text-xs text-gray-600 font-semibold mb-1">Owner</span>
              <Select value={bulkEdit.owner_id || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, owner_id: v === 'none' ? null : v }))}>
                <SelectTrigger className="h-8 text-xs auth-input">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Source */}
            <div className="min-w-[120px] flex flex-col">
              <span className="text-xs text-gray-600 font-semibold mb-1">Source</span>
              <Select value={bulkEdit.source || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, source: v === 'none' ? null : v }))}>
                <SelectTrigger className="h-8 text-xs auth-input">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {sourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>{formatSource(source)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Account Type (for deals/accounts) */}
            {(activeTab === 'deals' || activeTab === 'accounts') && (
              <div className="min-w-[120px] flex flex-col">
                <span className="text-xs text-gray-600 font-semibold mb-1">Account Type</span>
                <Select value={bulkEdit.account_type || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, account_type: v === 'none' ? null : v }))}>
                  <SelectTrigger className="h-8 text-xs auth-input">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {accountTypeOptions.map((type) => (
                      <SelectItem key={type} value={type}>{formatSource(type)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Affiliate */}
            <div className="min-w-[120px] flex flex-col">
              <span className="text-xs text-gray-600 font-semibold mb-1">Affiliate</span>
              <Select value={bulkEdit.affiliate_id || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, affiliate_id: v === 'none' ? null : v }))}>
                <SelectTrigger className="h-8 text-xs auth-input">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {affiliates.map((aff) => (
                    <SelectItem key={aff.id} value={aff.id}>{aff.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Client (for accounts) */}
            {activeTab === 'accounts' && (
              <div className="min-w-[120px] flex flex-col">
                <span className="text-xs text-gray-600 font-semibold mb-1">Client</span>
                <Select value={bulkEdit.client_id || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, client_id: v === 'none' ? null : v }))}>
                  <SelectTrigger className="h-8 text-xs auth-input">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Scope (for accounts) */}
            {activeTab === 'accounts' && (
              <div className="min-w-[120px] flex flex-col">
                <span className="text-xs text-gray-600 font-semibold mb-1">Scope</span>
                <Select value={bulkEdit.scope || ''} onValueChange={(v) => setBulkEdit(prev => ({ ...prev, scope: v === 'none' ? null : v }))}>
                  <SelectTrigger className="h-8 text-xs auth-input">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {scopeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Apply Button */}
            <Button
              size="sm"
              onClick={handleBulkUpdate}
              disabled={Object.keys(bulkEdit).length === 0}
              className="h-8 hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              Apply Changes
            </Button>
            {/* Cancel Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedOpportunities([]);
                setBulkEdit({});
              }}
              className="h-8"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Tabs for Outreach, Leads, Deals, and Accounts */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'outreach' | 'leads' | 'deals' | 'accounts')}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="outreach" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Outreach
              <Badge variant="secondary" className="ml-1">{totalOutreach}</Badge>
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Leads
              <Badge variant="secondary" className="ml-1">{totalLeads}</Badge>
            </TabsTrigger>
            <TabsTrigger value="deals" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Deals
              <Badge variant="secondary" className="ml-1">{totalDeals}</Badge>
            </TabsTrigger>
            <TabsTrigger value="accounts" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Accounts
              <Badge variant="secondary" className="ml-1">{totalAccounts}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* View Toggle for current tab */}
          <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <div
              onClick={() => setCurrentViewMode('table')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${currentViewMode === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
            >
              <TableIcon className="h-4 w-4 mr-2" />
              Table
            </div>
            <div
              onClick={() => setCurrentViewMode('kanban')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${currentViewMode === 'kanban' ? 'bg-background text-foreground shadow-sm' : ''}`}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </div>
          </div>
        </div>

        <TabsContent value="outreach" className="mt-0">
          {outreachViewMode === 'kanban' && renderKanbanView()}
          {outreachViewMode === 'table' && renderTableView()}
        </TabsContent>

        <TabsContent value="leads" className="mt-0">
          {leadsViewMode === 'kanban' && renderKanbanView()}
          {leadsViewMode === 'table' && renderTableView()}
        </TabsContent>

        <TabsContent value="deals" className="mt-0">
          {dealsViewMode === 'kanban' && renderKanbanView()}
          {dealsViewMode === 'table' && renderTableView()}
        </TabsContent>

        <TabsContent value="accounts" className="mt-0">
          {accountsViewMode === 'kanban' && renderKanbanView()}
          {accountsViewMode === 'table' && renderTableView()}
        </TabsContent>
      </Tabs>

      {/* Opportunity Dialog */}
      <Dialog open={isNewOpportunityOpen} onOpenChange={setIsNewOpportunityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOpportunity ? 'Edit Opportunity' : 'Add New Opportunity'}</DialogTitle>
            <DialogDescription>
              {editingOpportunity ? 'Update opportunity details.' : 'Create a new lead or deal.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateOpportunity(); }}>
            <div className="grid gap-4 py-4">
              {/* Type Selector */}
              <div className="grid gap-2">
                <Label>Type</Label>
                <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => {
                      setOpportunityType('lead');
                      setOpportunityForm({ ...opportunityForm, stage: 'new' });
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      opportunityType === 'lead'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Lead
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpportunityType('deal');
                      setOpportunityForm({ ...opportunityForm, stage: 'deal_qualified' });
                    }}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                      opportunityType === 'deal'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Deal
                  </button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="opp-name">Name *</Label>
                <Input
                  id="opp-name"
                  value={opportunityForm.name}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, name: e.target.value })}
                  placeholder="Company or opportunity name"
                  className="auth-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="opp-stage">Stage</Label>
                  <Select
                    value={opportunityForm.stage}
                    onValueChange={(v) => setOpportunityForm({ ...opportunityForm, stage: v as OpportunityStage })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {opportunityType === 'lead' ? (
                        <>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="contacted">Contacted</SelectItem>
                          <SelectItem value="qualified">Qualified</SelectItem>
                          <SelectItem value="unqualified">Unqualified</SelectItem>
                          <SelectItem value="nurture">Nurture</SelectItem>
                          <SelectItem value="dead">Dead</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="deal_qualified">Qualified</SelectItem>
                          <SelectItem value="proposal">Proposal</SelectItem>
                          <SelectItem value="negotiation">Negotiation</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="closed_won">Closed Won</SelectItem>
                          <SelectItem value="closed_lost">Closed Lost</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="opp-source">Source</Label>
                  <Select
                    value={opportunityForm.source || ''}
                    onValueChange={(v) => setOpportunityForm({ ...opportunityForm, source: v as any })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="referral">Referral</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="cold_outreach">Cold Outreach</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Affiliate Selector */}
              <div className="grid gap-2">
                <Label htmlFor="opp-affiliate">Affiliate</Label>
                <Select
                  value={opportunityForm.affiliate_id || 'none'}
                  onValueChange={(v) => setOpportunityForm({ ...opportunityForm, affiliate_id: v === 'none' ? undefined : v })}
                >
                  <SelectTrigger className="auth-input">
                    <SelectValue placeholder="Select affiliate (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No affiliate</SelectItem>
                    {affiliates.map((aff) => (
                      <SelectItem key={aff.id} value={aff.id}>
                        {aff.name} {aff.affiliation ? `(${aff.affiliation})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {opportunityType === 'deal' && (
                <div className="grid gap-2">
                  <Label htmlFor="opp-type">Account Type</Label>
                  <Select
                    value={opportunityForm.account_type || ''}
                    onValueChange={(v) => setOpportunityForm({ ...opportunityForm, account_type: v as any })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="channel">Channel</SelectItem>
                      <SelectItem value="campaign">Campaign</SelectItem>
                      <SelectItem value="lite">Lite</SelectItem>
                      <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {accountStages.includes(opportunityForm.stage as OpportunityStage) && (
                <div className="grid gap-2">
                  <Label htmlFor="opp-client">Linked Client</Label>
                  <Select
                    value={opportunityForm.client_id || 'none'}
                    onValueChange={(v) => setOpportunityForm({ ...opportunityForm, client_id: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No client linked</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {accountStages.includes(opportunityForm.stage as OpportunityStage) && (
                <div className="grid gap-2">
                  <Label htmlFor="opp-scope">Scope</Label>
                  <Select
                    value={opportunityForm.scope || 'none'}
                    onValueChange={(v) => setOpportunityForm({ ...opportunityForm, scope: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {scopeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="opp-referrer">Referrer</Label>
                <Input
                  id="opp-referrer"
                  value={opportunityForm.referrer || ''}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, referrer: e.target.value })}
                  placeholder="Who referred them?"
                  className="auth-input"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-gc">Telegram Chat ID</Label>
                <Input
                  id="opp-gc"
                  value={opportunityForm.gc || ''}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, gc: e.target.value })}
                  placeholder="-1001234567890"
                  className="auth-input"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the Telegram group chat ID to track message activity
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="opp-notes">Notes</Label>
                <Textarea
                  id="opp-notes"
                  value={opportunityForm.notes || ''}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="auth-input"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewOpportunityOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !opportunityForm.name.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isSubmitting ? 'Saving...' : editingOpportunity ? 'Save Changes' : 'Create Opportunity'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Contact Link Dialog */}
      <Dialog open={isContactLinkOpen} onOpenChange={(open) => {
        setIsContactLinkOpen(open);
        if (!open) {
          setContactMode('link');
          setNewContactForm({ name: '' });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Contacts</DialogTitle>
            <DialogDescription>
              Link contacts to {linkingOpportunity?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {opportunityContacts.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Contacts</Label>
                <div className="border rounded-lg divide-y">
                  {opportunityContacts.map((link) => (
                    <div key={link.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{link.contact?.name}</p>
                          <div className="flex items-center gap-2">
                            {link.role && (
                              <span className="text-xs text-gray-500">{link.role}</span>
                            )}
                            {link.is_primary && (
                              <Badge variant="secondary" className="text-xs">Primary</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlinkContact(link.id)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label>Add Contact</Label>
              {/* Toggle between Link and Create */}
              <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setContactMode('link')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    contactMode === 'link'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Link Existing
                </button>
                <button
                  type="button"
                  onClick={() => setContactMode('create')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    contactMode === 'create'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Create New
                </button>
              </div>

              {contactMode === 'link' ? (
                <>
                  <Select
                    value={selectedContactId}
                    onValueChange={setSelectedContactId}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select a contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {contacts
                        .filter(c => !opportunityContacts.some(oc => oc.contact_id === c.id))
                        .map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            {contact.name} {contact.email ? `(${contact.email})` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Role (e.g., Decision Maker, Technical Lead)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is-primary"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="is-primary" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleLinkContact}
                    disabled={!selectedContactId || isSubmitting}
                    className="w-full hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    Link Contact
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={newContactForm.name}
                    onChange={(e) => setNewContactForm({ ...newContactForm, name: e.target.value })}
                    placeholder="Contact name *"
                    className="auth-input"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="email"
                      value={newContactForm.email || ''}
                      onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })}
                      placeholder="Email"
                      className="auth-input"
                    />
                    <Input
                      value={newContactForm.telegram_id || ''}
                      onChange={(e) => setNewContactForm({ ...newContactForm, telegram_id: e.target.value })}
                      placeholder="Telegram @username"
                      className="auth-input"
                    />
                  </div>
                  <Input
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Role (e.g., Decision Maker, Technical Lead)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="is-primary-new"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="is-primary-new" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleCreateAndLinkContact}
                    disabled={!newContactForm.name.trim() || isSubmitting}
                    className="w-full hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isSubmitting ? 'Creating...' : 'Create & Link Contact'}
                  </Button>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContactLinkOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Stage History</DialogTitle>
            <DialogDescription>
              History for {historyOpportunity?.name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 py-4">
              {stageHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No history available</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

                  {stageHistory.map((entry) => (
                    <div key={entry.id} className="relative pl-10 pb-4">
                      <div className="absolute left-2.5 w-3 h-3 bg-white border-2 border-gray-400 rounded-full" />

                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {entry.from_stage ? (
                            <>
                              <Badge variant="outline" className="text-xs">
                                {stageLabels[entry.from_stage as OpportunityStage] || entry.from_stage}
                              </Badge>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <Badge
                                className="text-xs"
                                style={{ backgroundColor: '#3e8692', color: 'white' }}
                              >
                                {stageLabels[entry.to_stage as OpportunityStage] || entry.to_stage}
                              </Badge>
                            </>
                          ) : (
                            <Badge
                              className="text-xs"
                              style={{ backgroundColor: '#3e8692', color: 'white' }}
                            >
                              Created as {stageLabels[entry.to_stage as OpportunityStage] || entry.to_stage}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatDate(entry.changed_at)}
                        </p>
                        {entry.notes && (
                          <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Opportunity Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Opportunity</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{opportunityToDelete?.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteOpportunity}
            >
              Delete Opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Deal Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert to Deal?</DialogTitle>
            <DialogDescription>
              <strong>{opportunityToConvert?.name}</strong> has been qualified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Would you like to convert this lead into a deal? This will move it to the Deals pipeline.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleKeepAsLead}>
              Keep as Lead
            </Button>
            <Button
              onClick={handleConvertToDeal}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              Convert to Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Account Dialog */}
      <Dialog open={isConvertToAccountDialogOpen} onOpenChange={setIsConvertToAccountDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert to Account?</DialogTitle>
            <DialogDescription>
              <strong>{dealToConvertToAccount?.name}</strong> deal has been won!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Would you like to convert this deal into an account? This will move it to the Accounts pipeline.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleKeepAsDeal}>
              Keep as Deal
            </Button>
            <Button
              onClick={handleConvertToAccount}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              Convert to Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
