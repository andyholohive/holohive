'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  Plus, Search, Edit, Trash2, Users, Handshake,
  Building2, Mail, MoreHorizontal, History, X, Link as LinkIcon, ArrowRight, MessageSquare,
  Filter, ArrowUpDown, Phone, LayoutGrid, TableIcon
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  CRMService,
  CRMPartner,
  CRMAffiliate,
  CRMContact,
  CRMContactLink,
  CRMStageHistory,
  CreatePartnerData,
  CreateAffiliateData,
  CreateContactData,
  PartnerStatus,
  AffiliateStatus
} from '@/lib/crmService';
import { UserService } from '@/lib/userService';

type NetworkTab = 'partners' | 'affiliates';

export default function NetworkPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NetworkTab>('partners');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [partners, setPartners] = useState<CRMPartner[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [allContactLinks, setAllContactLinks] = useState<CRMContactLink[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);

  const [isNewPartnerOpen, setIsNewPartnerOpen] = useState(false);
  const [isNewAffiliateOpen, setIsNewAffiliateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [editingPartner, setEditingPartner] = useState<CRMPartner | null>(null);
  const [editingAffiliate, setEditingAffiliate] = useState<CRMAffiliate | null>(null);

  const [partnerForm, setPartnerForm] = useState<CreatePartnerData>({
    name: '',
    status: 'active',
  });
  const [affiliateForm, setAffiliateForm] = useState<CreateAffiliateData>({
    name: '',
    status: 'new',
  });

  // Affiliate creation state within partner dialog
  const [partnerDialogAffiliateMode, setPartnerDialogAffiliateMode] = useState<'link' | 'create'>('link');
  const [newAffiliateInPartnerDialog, setNewAffiliateInPartnerDialog] = useState<CreateAffiliateData>({
    name: '',
    status: 'new',
  });

  // Contact linking state for Partners
  const [isPartnerContactLinkOpen, setIsPartnerContactLinkOpen] = useState(false);
  const [linkingPartner, setLinkingPartner] = useState<CRMPartner | null>(null);
  const [partnerContacts, setPartnerContacts] = useState<CRMContactLink[]>([]);

  // Contact linking state for Affiliates
  const [isAffiliateContactLinkOpen, setIsAffiliateContactLinkOpen] = useState(false);
  const [linkingAffiliate, setLinkingAffiliate] = useState<CRMAffiliate | null>(null);
  const [affiliateContacts, setAffiliateContacts] = useState<CRMContactLink[]>([]);

  // Affiliate linking state for Partners
  const [isPartnerAffiliateLinkOpen, setIsPartnerAffiliateLinkOpen] = useState(false);
  const [linkingPartnerForAffiliate, setLinkingPartnerForAffiliate] = useState<CRMPartner | null>(null);
  const [selectedAffiliateForPartner, setSelectedAffiliateForPartner] = useState<string>('');
  const [affiliateLinkMode, setAffiliateLinkMode] = useState<'link' | 'create'>('link');
  const [newAffiliateFormForPartner, setNewAffiliateFormForPartner] = useState<CreateAffiliateData>({
    name: '',
    status: 'new',
  });

  // Shared contact linking form state
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [contactRole, setContactRole] = useState<string>('');
  const [isPrimaryContact, setIsPrimaryContact] = useState(false);

  // New contact creation state (within manage contacts dialog)
  const [contactMode, setContactMode] = useState<'link' | 'create'>('link');
  const [newContactForm, setNewContactForm] = useState<CreateContactData>({ name: '' });

  // Stage history state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyType, setHistoryType] = useState<'partner' | 'affiliate'>('partner');
  const [historyEntity, setHistoryEntity] = useState<CRMPartner | CRMAffiliate | null>(null);
  const [stageHistory, setStageHistory] = useState<CRMStageHistory[]>([]);

  // Delete confirmation dialog state
  const [isDeletePartnerDialogOpen, setIsDeletePartnerDialogOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleteAffiliateDialogOpen, setIsDeleteAffiliateDialogOpen] = useState(false);
  const [affiliateToDelete, setAffiliateToDelete] = useState<{ id: string; name: string } | null>(null);

  // Filter state
  const [filterPartnerStatus, setFilterPartnerStatus] = useState<string>('all');
  const [filterAffiliateStatus, setFilterAffiliateStatus] = useState<string>('all');

  // Sort state
  const [sortBy, setSortBy] = useState<string>('created_desc');

  // View mode state
  const [partnersViewMode, setPartnersViewMode] = useState<'cards' | 'table'>('table');
  const [affiliatesViewMode, setAffiliatesViewMode] = useState<'cards' | 'table'>('table');

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: string; field: string; type: 'partner' | 'affiliate' } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  // Bulk edit state
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>([]);
  const [bulkPartnerEdit, setBulkPartnerEdit] = useState<Partial<CRMPartner>>({});
  const [bulkAffiliateEdit, setBulkAffiliateEdit] = useState<Partial<CRMAffiliate>>({});

  const partnerStatusLabels: Record<PartnerStatus, string> = {
    active: 'Active',
    inactive: 'Inactive'
  };

  const affiliateStatusLabels: Record<AffiliateStatus, string> = {
    new: 'New',
    active: 'Active',
    inactive: 'Inactive'
  };

  // Status colors matching pipeline page styling
  const partnerStatusColors: Record<PartnerStatus, { bg: string; text: string }> = {
    active: { bg: 'bg-green-50', text: 'text-green-700' },
    inactive: { bg: 'bg-gray-50', text: 'text-gray-700' }
  };

  const affiliateStatusColors: Record<AffiliateStatus, { bg: string; text: string }> = {
    new: { bg: 'bg-blue-50', text: 'text-blue-700' },
    active: { bg: 'bg-green-50', text: 'text-green-700' },
    inactive: { bg: 'bg-gray-50', text: 'text-gray-700' }
  };

  // Partner focus area options
  const partnerFocusOptions = [
    { value: 'marketing', label: 'Marketing' },
    { value: 'infrastructure', label: 'Infrastructure' },
    { value: 'creative_design', label: 'Creative/Design' },
    { value: 'kol', label: 'KOL' },
    { value: 'pr', label: 'PR' },
    { value: 'ecosystem', label: 'Ecosystem' },
    { value: 'fundraising', label: 'Fundraising' },
    { value: 'market_maker', label: 'Market Maker' },
    { value: 'launchpad', label: 'Launchpad' },
  ];

  const formatFocusLabel = (value: string | null | undefined) => {
    if (!value) return null;
    const option = partnerFocusOptions.find(o => o.value === value);
    return option?.label || value;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [parts, affs, conts, contactLinks, usersData] = await Promise.all([
        CRMService.getAllPartners(),
        CRMService.getAllAffiliates(),
        CRMService.getAllContacts(),
        CRMService.getAllContactLinks(),
        UserService.getAllUsers()
      ]);
      setPartners(parts);
      setAffiliates(affs);
      setContacts(conts);
      setAllContactLinks(contactLinks);
      setUsers(usersData.map(u => ({ id: u.id, name: u.name, email: u.email })));
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Partner handlers
  const handleCreatePartner = async () => {
    if (!partnerForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      let affiliateIdToLink = partnerForm.affiliate_id;

      // If creating a new affiliate, create it first
      if (partnerDialogAffiliateMode === 'create' && newAffiliateInPartnerDialog.name.trim()) {
        const newAffiliate = await CRMService.createAffiliate({
          ...newAffiliateInPartnerDialog,
          owner_id: user?.id
        });
        if (newAffiliate) {
          affiliateIdToLink = newAffiliate.id;
          setAffiliates(prev => [...prev, newAffiliate]);
        }
      }

      const partnerData = {
        ...partnerForm,
        affiliate_id: affiliateIdToLink,
        is_affiliate: !!affiliateIdToLink
      };

      if (editingPartner) {
        await CRMService.updatePartner(editingPartner.id, partnerData);
      } else {
        await CRMService.createPartner({
          ...partnerData,
          owner_id: user?.id
        });
      }
      setIsNewPartnerOpen(false);
      setEditingPartner(null);
      setPartnerForm({ name: '', status: 'active' });
      setPartnerDialogAffiliateMode('link');
      setNewAffiliateInPartnerDialog({ name: '', status: 'new' });
      fetchData();
    } catch (error) {
      console.error('Error saving partner:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditPartner = (partner: CRMPartner) => {
    setEditingPartner(partner);
    setPartnerForm({
      name: partner.name,
      category: partner.category || undefined,
      focus: partner.focus || undefined,
      status: partner.status,
      owner_id: partner.owner_id || undefined,
      poc_name: partner.poc_name || undefined,
      poc_email: partner.poc_email || undefined,
      poc_telegram: partner.poc_telegram || undefined,
      is_affiliate: partner.is_affiliate,
      affiliate_id: partner.affiliate_id || undefined,
      notes: partner.notes || undefined
    });
    setPartnerDialogAffiliateMode('link');
    setNewAffiliateInPartnerDialog({ name: '', status: 'new' });
    setIsNewPartnerOpen(true);
  };

  const handleDeletePartner = (partner: CRMPartner) => {
    setPartnerToDelete({ id: partner.id, name: partner.name });
    setIsDeletePartnerDialogOpen(true);
  };

  const confirmDeletePartner = async () => {
    if (!partnerToDelete) return;
    try {
      await CRMService.deletePartner(partnerToDelete.id);
      setIsDeletePartnerDialogOpen(false);
      setPartnerToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting partner:', error);
    }
  };

  // Affiliate handlers
  const handleCreateAffiliate = async () => {
    if (!affiliateForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingAffiliate) {
        await CRMService.updateAffiliate(editingAffiliate.id, affiliateForm);
      } else {
        await CRMService.createAffiliate({
          ...affiliateForm,
          owner_id: user?.id
        });
      }
      setIsNewAffiliateOpen(false);
      setEditingAffiliate(null);
      setAffiliateForm({ name: '', status: 'new' });
      fetchData();
    } catch (error) {
      console.error('Error saving affiliate:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditAffiliate = (affiliate: CRMAffiliate) => {
    setEditingAffiliate(affiliate);
    setAffiliateForm({
      name: affiliate.name,
      affiliation: affiliate.affiliation || undefined,
      category: affiliate.category || undefined,
      status: affiliate.status,
      commission_model: affiliate.commission_model || undefined,
      commission_rate: affiliate.commission_rate || undefined,
      owner_id: affiliate.owner_id || undefined,
      poc_name: affiliate.poc_name || undefined,
      poc_email: affiliate.poc_email || undefined,
      poc_telegram: affiliate.poc_telegram || undefined,
      notes: affiliate.notes || undefined
    });
    setIsNewAffiliateOpen(true);
  };

  const handleDeleteAffiliate = (affiliate: CRMAffiliate) => {
    setAffiliateToDelete({ id: affiliate.id, name: affiliate.name });
    setIsDeleteAffiliateDialogOpen(true);
  };

  const confirmDeleteAffiliate = async () => {
    if (!affiliateToDelete) return;
    try {
      await CRMService.deleteAffiliate(affiliateToDelete.id);
      setIsDeleteAffiliateDialogOpen(false);
      setAffiliateToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting affiliate:', error);
    }
  };

  // Bulk update handlers
  const handleBulkUpdatePartners = async () => {
    if (selectedPartners.length === 0 || Object.keys(bulkPartnerEdit).length === 0) return;

    const updates: Record<string, any> = {};
    Object.entries(bulkPartnerEdit).forEach(([key, value]) => {
      if (value !== undefined) {
        updates[key] = value;
      }
    });

    if (Object.keys(updates).length === 0) return;

    try {
      setPartners(prev =>
        prev.map(p => selectedPartners.includes(p.id) ? { ...p, ...updates } : p)
      );

      await Promise.all(
        selectedPartners.map(id => CRMService.updatePartner(id, updates))
      );

      setSelectedPartners([]);
      setBulkPartnerEdit({});
    } catch (error) {
      console.error('Error bulk updating partners:', error);
    }
  };

  const handleBulkUpdateAffiliates = async () => {
    if (selectedAffiliates.length === 0 || Object.keys(bulkAffiliateEdit).length === 0) return;

    const updates: Record<string, any> = {};
    Object.entries(bulkAffiliateEdit).forEach(([key, value]) => {
      if (value !== undefined) {
        updates[key] = value;
      }
    });

    if (Object.keys(updates).length === 0) return;

    try {
      setAffiliates(prev =>
        prev.map(a => selectedAffiliates.includes(a.id) ? { ...a, ...updates } : a)
      );

      await Promise.all(
        selectedAffiliates.map(id => CRMService.updateAffiliate(id, updates))
      );

      setSelectedAffiliates([]);
      setBulkAffiliateEdit({});
    } catch (error) {
      console.error('Error bulk updating affiliates:', error);
    }
  };

  // Partner contact linking handlers
  const handleOpenPartnerContactLink = async (partner: CRMPartner) => {
    setLinkingPartner(partner);
    setSelectedContactId('');
    setContactRole('');
    setIsPrimaryContact(false);
    setContactMode('link');
    setNewContactForm({ name: '' });
    try {
      const links = await CRMService.getContactsForPartner(partner.id);
      setPartnerContacts(links);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setPartnerContacts([]);
    }
    setIsPartnerContactLinkOpen(true);
  };

  const handleLinkContactToPartner = async () => {
    if (!linkingPartner || !selectedContactId) return;
    setIsSubmitting(true);
    try {
      await CRMService.linkContactToPartner(
        selectedContactId,
        linkingPartner.id,
        contactRole || undefined,
        isPrimaryContact
      );
      const links = await CRMService.getContactsForPartner(linkingPartner.id);
      setPartnerContacts(links);
      setSelectedContactId('');
      setContactRole('');
      setIsPrimaryContact(false);
    } catch (error) {
      console.error('Error linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndLinkContactToPartner = async () => {
    if (!linkingPartner || !newContactForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      // Create the contact
      const newContact = await CRMService.createContact({
        ...newContactForm,
        owner_id: user?.id
      });
      if (newContact) {
        // Link it to the partner
        await CRMService.linkContactToPartner(
          newContact.id,
          linkingPartner.id,
          contactRole || undefined,
          isPrimaryContact
        );
        // Refresh contacts list
        const links = await CRMService.getContactsForPartner(linkingPartner.id);
        setPartnerContacts(links);
        // Also refresh the contacts list
        const allConts = await CRMService.getAllContacts();
        setContacts(allConts);
        // Reset form
        setNewContactForm({ name: '' });
        setContactRole('');
        setIsPrimaryContact(false);
        setContactMode('link');
      }
    } catch (error) {
      console.error('Error creating and linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkPartnerContact = async (linkId: string) => {
    if (!linkingPartner) return;
    try {
      await CRMService.unlinkContact(linkId);
      const links = await CRMService.getContactsForPartner(linkingPartner.id);
      setPartnerContacts(links);
    } catch (error) {
      console.error('Error unlinking contact:', error);
    }
  };

  // Partner affiliate linking handlers
  const handleOpenPartnerAffiliateLink = (partner: CRMPartner) => {
    setLinkingPartnerForAffiliate(partner);
    setSelectedAffiliateForPartner(partner.affiliate_id || '');
    setAffiliateLinkMode('link');
    setNewAffiliateFormForPartner({ name: '', status: 'new' });
    setIsPartnerAffiliateLinkOpen(true);
  };

  const handleSavePartnerAffiliateLink = async () => {
    if (!linkingPartnerForAffiliate) return;
    setIsSubmitting(true);
    try {
      await CRMService.updatePartner(linkingPartnerForAffiliate.id, {
        affiliate_id: selectedAffiliateForPartner || null
      });
      // Update local state
      const selectedAffiliate = affiliates.find(a => a.id === selectedAffiliateForPartner);
      setPartners(prev =>
        prev.map(p =>
          p.id === linkingPartnerForAffiliate.id
            ? { ...p, affiliate_id: selectedAffiliateForPartner || null, affiliate: selectedAffiliate || null }
            : p
        )
      );
      setIsPartnerAffiliateLinkOpen(false);
    } catch (error) {
      console.error('Error updating partner affiliate:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePartnerAffiliateLink = async () => {
    if (!linkingPartnerForAffiliate) return;
    setIsSubmitting(true);
    try {
      await CRMService.updatePartner(linkingPartnerForAffiliate.id, {
        affiliate_id: null
      });
      // Update local state
      setPartners(prev =>
        prev.map(p =>
          p.id === linkingPartnerForAffiliate.id
            ? { ...p, affiliate_id: null, affiliate: null }
            : p
        )
      );
      setSelectedAffiliateForPartner('');
      setIsPartnerAffiliateLinkOpen(false);
    } catch (error) {
      console.error('Error removing partner affiliate:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndLinkAffiliateToPartner = async () => {
    if (!linkingPartnerForAffiliate || !newAffiliateFormForPartner.name.trim()) return;
    setIsSubmitting(true);
    try {
      // Create the affiliate
      const newAffiliate = await CRMService.createAffiliate({
        ...newAffiliateFormForPartner,
        owner_id: user?.id
      });
      if (newAffiliate) {
        // Link it to the partner
        await CRMService.updatePartner(linkingPartnerForAffiliate.id, {
          affiliate_id: newAffiliate.id
        });
        // Update local state
        setAffiliates(prev => [...prev, newAffiliate]);
        setPartners(prev =>
          prev.map(p =>
            p.id === linkingPartnerForAffiliate.id
              ? { ...p, affiliate_id: newAffiliate.id, affiliate: newAffiliate }
              : p
          )
        );
        // Reset form and close
        setNewAffiliateFormForPartner({ name: '', status: 'new' });
        setAffiliateLinkMode('link');
        setIsPartnerAffiliateLinkOpen(false);
      }
    } catch (error) {
      console.error('Error creating and linking affiliate:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Affiliate contact linking handlers
  const handleOpenAffiliateContactLink = async (affiliate: CRMAffiliate) => {
    setLinkingAffiliate(affiliate);
    setSelectedContactId('');
    setContactRole('');
    setIsPrimaryContact(false);
    setContactMode('link');
    setNewContactForm({ name: '' });
    try {
      const links = await CRMService.getContactsForAffiliate(affiliate.id);
      setAffiliateContacts(links);
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setAffiliateContacts([]);
    }
    setIsAffiliateContactLinkOpen(true);
  };

  const handleLinkContactToAffiliate = async () => {
    if (!linkingAffiliate || !selectedContactId) return;
    setIsSubmitting(true);
    try {
      await CRMService.linkContactToAffiliate(
        selectedContactId,
        linkingAffiliate.id,
        contactRole || undefined,
        isPrimaryContact
      );
      const links = await CRMService.getContactsForAffiliate(linkingAffiliate.id);
      setAffiliateContacts(links);
      setSelectedContactId('');
      setContactRole('');
      setIsPrimaryContact(false);
    } catch (error) {
      console.error('Error linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAndLinkContactToAffiliate = async () => {
    if (!linkingAffiliate || !newContactForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      // Create the contact
      const newContact = await CRMService.createContact({
        ...newContactForm,
        owner_id: user?.id
      });
      if (newContact) {
        // Link it to the affiliate
        await CRMService.linkContactToAffiliate(
          newContact.id,
          linkingAffiliate.id,
          contactRole || undefined,
          isPrimaryContact
        );
        // Refresh contacts list
        const links = await CRMService.getContactsForAffiliate(linkingAffiliate.id);
        setAffiliateContacts(links);
        // Also refresh the contacts list
        const allConts = await CRMService.getAllContacts();
        setContacts(allConts);
        // Reset form
        setNewContactForm({ name: '' });
        setContactRole('');
        setIsPrimaryContact(false);
        setContactMode('link');
      }
    } catch (error) {
      console.error('Error creating and linking contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkAffiliateContact = async (linkId: string) => {
    if (!linkingAffiliate) return;
    try {
      await CRMService.unlinkContact(linkId);
      const links = await CRMService.getContactsForAffiliate(linkingAffiliate.id);
      setAffiliateContacts(links);
    } catch (error) {
      console.error('Error unlinking contact:', error);
    }
  };

  // Stage history handlers
  const handleOpenPartnerHistory = async (partner: CRMPartner) => {
    setHistoryType('partner');
    setHistoryEntity(partner);
    try {
      const history = await CRMService.getStageHistory('partner', partner.id);
      setStageHistory(history);
    } catch (error) {
      console.error('Error fetching history:', error);
      setStageHistory([]);
    }
    setIsHistoryOpen(true);
  };

  const handleOpenAffiliateHistory = async (affiliate: CRMAffiliate) => {
    setHistoryType('affiliate');
    setHistoryEntity(affiliate);
    try {
      const history = await CRMService.getStageHistory('affiliate', affiliate.id);
      setStageHistory(history);
    } catch (error) {
      console.error('Error fetching history:', error);
      setStageHistory([]);
    }
    setIsHistoryOpen(true);
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

  // Get linked contacts for a partner
  const getPartnerContacts = (partnerId: string) => {
    return allContactLinks.filter(link => link.partner_id === partnerId);
  };

  // Get linked contacts for an affiliate
  const getAffiliateContacts = (affiliateId: string) => {
    return allContactLinks.filter(link => link.affiliate_id === affiliateId);
  };

  const filteredPartners = partners
    .filter(p => {
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (filterPartnerStatus !== 'all' && p.status !== filterPartnerStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

  const filteredAffiliates = affiliates
    .filter(a => {
      if (searchTerm && !a.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (filterAffiliateStatus !== 'all' && a.status !== filterAffiliateStatus) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

  // Check if any filters are active
  const hasActiveFilters = (activeTab === 'partners' && filterPartnerStatus !== 'all') ||
    (activeTab === 'affiliates' && filterAffiliateStatus !== 'all');

  // Clear all filters
  const clearFilters = () => {
    setFilterPartnerStatus('all');
    setFilterAffiliateStatus('all');
    setSearchTerm('');
  };

  // Mark as contacted functions
  const handleMarkPartnerContacted = async (partnerId: string) => {
    try {
      await CRMService.updatePartner(partnerId, {
        last_contacted_at: new Date().toISOString()
      });
      setPartners(prev =>
        prev.map(p => p.id === partnerId ? { ...p, last_contacted_at: new Date().toISOString() } : p)
      );
    } catch (error) {
      console.error('Error updating last contacted:', error);
    }
  };

  const handleMarkAffiliateContacted = async (affiliateId: string) => {
    try {
      await CRMService.updateAffiliate(affiliateId, {
        last_contacted_at: new Date().toISOString()
      });
      setAffiliates(prev =>
        prev.map(a => a.id === affiliateId ? { ...a, last_contacted_at: new Date().toISOString() } : a)
      );
    } catch (error) {
      console.error('Error updating last contacted:', error);
    }
  };

  const formatShortDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Inline editing functions
  const startEditing = (id: string, field: string, type: 'partner' | 'affiliate', currentValue: string | number | null | undefined) => {
    setEditingCell({ id, field, type });
    setEditingValue(currentValue?.toString() || '');
  };

  const handlePartnerInlineUpdate = async (partnerId: string, field: string, value: any) => {
    try {
      setPartners(prev =>
        prev.map(p => p.id === partnerId ? { ...p, [field]: value || null } : p)
      );
      await CRMService.updatePartner(partnerId, { [field]: value || null });
    } catch (error) {
      console.error('Error updating partner field:', error);
    }
    setEditingCell(null);
    setEditingValue('');
  };

  const handleAffiliateInlineUpdate = async (affiliateId: string, field: string, value: any) => {
    try {
      setAffiliates(prev =>
        prev.map(a => a.id === affiliateId ? { ...a, [field]: value || null } : a)
      );
      await CRMService.updateAffiliate(affiliateId, { [field]: value || null });
    } catch (error) {
      console.error('Error updating affiliate field:', error);
    }
    setEditingCell(null);
    setEditingValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string, type: 'partner' | 'affiliate') => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (type === 'partner') {
        handlePartnerInlineUpdate(id, field, editingValue);
      } else {
        handleAffiliateInlineUpdate(id, field, editingValue);
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditingValue('');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full gap-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        {/* Stats cards skeleton */}
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        {/* Filters skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-40" />
        </div>
        {/* Tabs skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        {/* Table skeleton */}
        <div className="flex-1">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <Skeleton className="h-12 w-full" />
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full border-t" />
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
          <h2 className="text-2xl font-bold text-gray-900">Network</h2>
          <p className="text-gray-600">Manage your partners and affiliates</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              className="pl-10 w-64 auth-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {activeTab === 'partners' ? (
            <Button
              onClick={() => {
                setEditingPartner(null);
                setPartnerForm({ name: '', status: 'active' });
                setPartnerDialogAffiliateMode('link');
                setNewAffiliateInPartnerDialog({ name: '', status: 'new' });
                setIsNewPartnerOpen(true);
              }}
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>
          ) : (
            <Button
              onClick={() => {
                setEditingAffiliate(null);
                setAffiliateForm({ name: '', status: 'new' });
                setIsNewAffiliateOpen(true);
              }}
              className="hover:opacity-90"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Affiliate
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Active Partners</p>
                <p className="text-2xl font-bold text-gray-900">{partners.filter(p => p.status === 'active').length}</p>
              </div>
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <Handshake className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-gray-50 to-white border-gray-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Partners</p>
                <p className="text-2xl font-bold text-gray-900">{partners.length}</p>
              </div>
              <div className="p-2.5 bg-gray-100 rounded-lg">
                <Building2 className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Active Affiliates</p>
                <p className="text-2xl font-bold text-gray-900">{affiliates.filter(a => a.status === 'active').length}</p>
              </div>
              <div className="p-2.5 bg-purple-100 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-white border-green-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Total Affiliates</p>
                <p className="text-2xl font-bold text-gray-900">{affiliates.length}</p>
              </div>
              <div className="p-2.5 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
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
        {activeTab === 'partners' && (
          <Select value={filterPartnerStatus} onValueChange={setFilterPartnerStatus}>
            <SelectTrigger className="w-36 h-9 text-sm auth-input">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )}
        {activeTab === 'affiliates' && (
          <Select value={filterAffiliateStatus} onValueChange={setFilterAffiliateStatus}>
            <SelectTrigger className="w-36 h-9 text-sm auth-input">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        )}
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NetworkTab)}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <TabsList>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Handshake className="h-4 w-4" />
              Partners
              <Badge variant="secondary" className="ml-1">{partners.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="affiliates" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Affiliates
              <Badge variant="secondary" className="ml-1">{affiliates.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* View Toggle */}
          <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <div
              onClick={() => activeTab === 'partners' ? setPartnersViewMode('table') : setAffiliatesViewMode('table')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${(activeTab === 'partners' ? partnersViewMode : affiliatesViewMode) === 'table' ? 'bg-background text-foreground shadow-sm' : ''}`}
            >
              <TableIcon className="h-4 w-4 mr-2" />
              Table
            </div>
            <div
              onClick={() => activeTab === 'partners' ? setPartnersViewMode('cards') : setAffiliatesViewMode('cards')}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer ${(activeTab === 'partners' ? partnersViewMode : affiliatesViewMode) === 'cards' ? 'bg-background text-foreground shadow-sm' : ''}`}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Cards
            </div>
          </div>
        </div>

        {/* Partners Tab */}
        <TabsContent value="partners" className="mt-0">
          {/* Partners Bulk action bar */}
          {selectedPartners.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-700">{selectedPartners.length} partner{selectedPartners.length !== 1 ? 's' : ''} selected</span>
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
                    const allIds = filteredPartners.map(p => p.id);
                    if (allIds.every(id => selectedPartners.includes(id))) {
                      setSelectedPartners(prev => prev.filter(id => !allIds.includes(id)));
                    } else {
                      setSelectedPartners(prev => Array.from(new Set([...prev, ...allIds])));
                    }
                  }}
                >
                  {filteredPartners.length > 0 && filteredPartners.every(p => selectedPartners.includes(p.id)) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {/* Status */}
                <div className="min-w-[120px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Status</span>
                  <Select value={bulkPartnerEdit.status || ''} onValueChange={(v) => setBulkPartnerEdit(prev => ({ ...prev, status: v as PartnerStatus }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Category */}
                <div className="min-w-[140px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Category</span>
                  <Select value={bulkPartnerEdit.category || ''} onValueChange={(v) => setBulkPartnerEdit(prev => ({ ...prev, category: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="service_provider">Service Provider</SelectItem>
                      <SelectItem value="investor_vc">Investor / VC</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Focus */}
                <div className="min-w-[140px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Focus</span>
                  <Select value={bulkPartnerEdit.focus || ''} onValueChange={(v) => setBulkPartnerEdit(prev => ({ ...prev, focus: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {partnerFocusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Owner */}
                <div className="min-w-[140px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Owner</span>
                  <Select value={bulkPartnerEdit.owner_id || ''} onValueChange={(v) => setBulkPartnerEdit(prev => ({ ...prev, owner_id: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
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
                </div>
                {/* Apply Button */}
                <Button
                  size="sm"
                  onClick={handleBulkUpdatePartners}
                  disabled={Object.keys(bulkPartnerEdit).length === 0}
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
                    setSelectedPartners([]);
                    setBulkPartnerEdit({});
                  }}
                  className="h-8"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {partnersViewMode === 'table' ? (
            /* Partners Table View */
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Focus</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead>Last Contacted</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPartners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        No partners found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPartners.map((partner, index) => {
                      const partnerContactLinks = getPartnerContacts(partner.id);
                      const primaryContact = partnerContactLinks.find(l => l.is_primary)?.contact || partnerContactLinks[0]?.contact;
                      const statusColors = partnerStatusColors[partner.status];
                      return (
                        <TableRow key={partner.id} className="group hover:bg-gray-50">
                          <TableCell className="text-gray-500 text-sm">
                            {(() => {
                              const isChecked = selectedPartners.includes(partner.id);
                              return (
                                <div className="flex items-center justify-center">
                                  {isChecked ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setSelectedPartners(prev => [...prev, partner.id]);
                                        } else {
                                          setSelectedPartners(prev => prev.filter(id => id !== partner.id));
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
                                              setSelectedPartners(prev => [...prev, partner.id]);
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
                            {editingCell?.id === partner.id && editingCell?.field === 'name' && editingCell?.type === 'partner' ? (
                              <Input
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => handlePartnerInlineUpdate(partner.id, 'name', editingValue)}
                                onKeyDown={(e) => handleKeyDown(e, partner.id, 'name', 'partner')}
                                className="h-8 text-sm font-medium auth-input"
                                autoFocus
                              />
                            ) : (
                              <div
                                onClick={() => startEditing(partner.id, 'name', 'partner', partner.name)}
                                className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1"
                              >
                                <Building2 className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">{partner.name}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={partner.status}
                              onValueChange={(v) => handlePartnerInlineUpdate(partner.id, 'status', v)}
                            >
                              <SelectTrigger className={`w-28 h-8 ${statusColors.bg} ${statusColors.text} border-none text-xs font-medium`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={partner.category || 'none'}
                              onValueChange={(v) => handlePartnerInlineUpdate(partner.id, 'category', v === 'none' ? null : v)}
                            >
                              <SelectTrigger className="w-36 h-8 text-xs auth-input capitalize">
                                <SelectValue placeholder="Select">
                                  {partner.category ? partner.category.replace('_', ' ') : <span className="text-gray-400">-</span>}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="service_provider">Service Provider</SelectItem>
                                <SelectItem value="investor_vc">Investor / VC</SelectItem>
                                <SelectItem value="project">Project</SelectItem>
                                <SelectItem value="individual">Individual</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={partner.focus || 'none'}
                              onValueChange={(v) => handlePartnerInlineUpdate(partner.id, 'focus', v === 'none' ? null : v)}
                            >
                              <SelectTrigger className="w-32 h-8 text-xs auth-input">
                                <SelectValue placeholder="Select">
                                  {partner.focus ? formatFocusLabel(partner.focus) : <span className="text-gray-400">-</span>}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {partnerFocusOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={partner.owner_id || 'none'}
                              onValueChange={(v) => handlePartnerInlineUpdate(partner.id, 'owner_id', v === 'none' ? null : v)}
                            >
                              <SelectTrigger className="w-32 h-8 text-xs auth-input">
                                <SelectValue placeholder="Select">
                                  {partner.owner_id ? (users.find(u => u.id === partner.owner_id)?.name || users.find(u => u.id === partner.owner_id)?.email || '-') : <span className="text-gray-400">-</span>}
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
                            {partner.affiliate ? (
                              <Badge
                                className="text-xs cursor-pointer hover:opacity-80"
                                style={{ backgroundColor: '#3e8692', color: 'white' }}
                                onClick={() => handleOpenPartnerAffiliateLink(partner)}
                              >
                                {partner.affiliate.name}
                              </Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-gray-400 hover:text-gray-600"
                                onClick={() => handleOpenPartnerAffiliateLink(partner)}
                              >
                                + Add
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            {primaryContact ? (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <div className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-sm hover:text-blue-600">{primaryContact.name}</span>
                                    {partnerContactLinks.length > 1 && (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                        +{partnerContactLinks.length - 1}
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
                                        <p className="font-medium">{primaryContact.name}</p>
                                        {partnerContactLinks[0]?.role && (
                                          <p className="text-xs text-gray-500">{partnerContactLinks[0].role}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 text-sm">
                                      {primaryContact.email && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Mail className="h-3.5 w-3.5" />
                                          <span>{primaryContact.email}</span>
                                        </div>
                                      )}
                                      {primaryContact.telegram_id && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <MessageSquare className="h-3.5 w-3.5" />
                                          <span>@{primaryContact.telegram_id}</span>
                                        </div>
                                      )}
                                      {primaryContact.phone && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Phone className="h-3.5 w-3.5" />
                                          <span>{primaryContact.phone}</span>
                                        </div>
                                      )}
                                    </div>
                                    {partnerContactLinks.length > 1 && (
                                      <div className="pt-2 border-t">
                                        <p className="text-xs text-gray-500">
                                          +{partnerContactLinks.length - 1} more contact{partnerContactLinks.length > 2 ? 's' : ''}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ) : <span className="text-gray-400">-</span>}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {partner.last_contacted_at ? formatShortDate(partner.last_contacted_at) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatShortDate(partner.created_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditPartner(partner)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenPartnerContactLink(partner)}>
                                  <Users className="h-4 w-4 mr-2" />
                                  Manage Contacts
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMarkPartnerContacted(partner.id)}>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Mark as Contacted
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeletePartner(partner)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Partners Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPartners.length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <p className="text-gray-600">No partners found.</p>
                </div>
              ) : (
                filteredPartners.map((partner) => (
                <Card key={partner.id} className="group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <Building2 className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{partner.name}</CardTitle>
                          {partner.category && (
                            <Badge variant="outline" className="text-xs mt-1 capitalize">
                              {partner.category.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={partner.status === 'active' ? 'default' : 'secondary'}
                          style={partner.status === 'active' ? { backgroundColor: '#3e8692' } : {}}
                          className="capitalize cursor-default hover:bg-inherit"
                        >
                          {partner.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPartner(partner)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPartnerContactLink(partner)}>
                              <Users className="h-4 w-4 mr-2" />
                              Manage Contacts
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenPartnerHistory(partner)}>
                              <History className="h-4 w-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMarkPartnerContacted(partner.id)}>
                              <Phone className="h-4 w-4 mr-2" />
                              Mark as Contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeletePartner(partner)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {partner.focus && (
                      <p className="text-sm text-gray-600 mb-2">{formatFocusLabel(partner.focus)}</p>
                    )}
                                        {partner.is_affiliate && (
                      <Badge variant="secondary" className="mt-2 text-xs bg-purple-100 text-purple-800">
                        Also Affiliate
                      </Badge>
                    )}
                    {/* Linked Contacts */}
                    {(() => {
                      const partnerContactLinks = getPartnerContacts(partner.id);
                      if (partnerContactLinks.length === 0) return null;
                      const primaryContact = partnerContactLinks.find(l => l.is_primary)?.contact || partnerContactLinks[0]?.contact;
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                            <Users className="h-3 w-3 text-blue-500" />
                            <span className="font-medium">Contacts ({partnerContactLinks.length})</span>
                          </div>
                          <div className="ml-5 space-y-1">
                            <p className="text-sm font-medium text-gray-700">{primaryContact?.name}</p>
                            {primaryContact?.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Mail className="h-3 w-3" />
                                <span>{primaryContact.email}</span>
                              </div>
                            )}
                            {primaryContact?.telegram_id && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <MessageSquare className="h-3 w-3" />
                                <span>@{primaryContact.telegram_id}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))
            )}
            </div>
          )}
        </TabsContent>

        {/* Affiliates Tab */}
        <TabsContent value="affiliates" className="mt-0">
          {/* Affiliates Bulk action bar */}
          {selectedAffiliates.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                  <span className="text-sm font-semibold text-gray-700">{selectedAffiliates.length} affiliate{selectedAffiliates.length !== 1 ? 's' : ''} selected</span>
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
                    const allIds = filteredAffiliates.map(a => a.id);
                    if (allIds.every(id => selectedAffiliates.includes(id))) {
                      setSelectedAffiliates(prev => prev.filter(id => !allIds.includes(id)));
                    } else {
                      setSelectedAffiliates(prev => Array.from(new Set([...prev, ...allIds])));
                    }
                  }}
                >
                  {filteredAffiliates.length > 0 && filteredAffiliates.every(a => selectedAffiliates.includes(a.id)) ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                {/* Status */}
                <div className="min-w-[120px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Status</span>
                  <Select value={bulkAffiliateEdit.status || ''} onValueChange={(v) => setBulkAffiliateEdit(prev => ({ ...prev, status: v as AffiliateStatus }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Commission Model */}
                <div className="min-w-[140px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Commission</span>
                  <Select value={bulkAffiliateEdit.commission_model || ''} onValueChange={(v) => setBulkAffiliateEdit(prev => ({ ...prev, commission_model: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Strategic">Strategic</SelectItem>
                      <SelectItem value="Whitelabeled">Whitelabeled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Owner */}
                <div className="min-w-[140px] flex flex-col">
                  <span className="text-xs text-gray-600 font-semibold mb-1">Owner</span>
                  <Select value={bulkAffiliateEdit.owner_id || ''} onValueChange={(v) => setBulkAffiliateEdit(prev => ({ ...prev, owner_id: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-8 text-xs auth-input">
                      <SelectValue placeholder="Select" />
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
                </div>
                {/* Apply Button */}
                <Button
                  size="sm"
                  onClick={handleBulkUpdateAffiliates}
                  disabled={Object.keys(bulkAffiliateEdit).length === 0}
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
                    setSelectedAffiliates([]);
                    setBulkAffiliateEdit({});
                  }}
                  className="h-8"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {affiliatesViewMode === 'table' ? (
            /* Affiliates Table View */
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Affiliation</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Contacts</TableHead>
                    <TableHead>Last Contacted</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAffiliates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        No affiliates found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAffiliates.map((affiliate, index) => {
                      const affiliateContactLinks = getAffiliateContacts(affiliate.id);
                      const primaryContact = affiliateContactLinks.find(l => l.is_primary)?.contact || affiliateContactLinks[0]?.contact;
                      const statusColors = affiliateStatusColors[affiliate.status];
                      return (
                        <TableRow key={affiliate.id} className="group hover:bg-gray-50">
                          <TableCell className="text-gray-500 text-sm">
                            {(() => {
                              const isChecked = selectedAffiliates.includes(affiliate.id);
                              return (
                                <div className="flex items-center justify-center">
                                  {isChecked ? (
                                    <Checkbox
                                      checked={true}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setSelectedAffiliates(prev => [...prev, affiliate.id]);
                                        } else {
                                          setSelectedAffiliates(prev => prev.filter(id => id !== affiliate.id));
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
                                              setSelectedAffiliates(prev => [...prev, affiliate.id]);
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
                            {editingCell?.id === affiliate.id && editingCell?.field === 'name' && editingCell?.type === 'affiliate' ? (
                              <Input
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => handleAffiliateInlineUpdate(affiliate.id, 'name', editingValue)}
                                onKeyDown={(e) => handleKeyDown(e, affiliate.id, 'name', 'affiliate')}
                                className="h-8 text-sm font-medium auth-input"
                                autoFocus
                              />
                            ) : (
                              <div
                                onClick={() => startEditing(affiliate.id, 'name', 'affiliate', affiliate.name)}
                                className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1"
                              >
                                <Users className="h-4 w-4 text-gray-400" />
                                <span className="font-medium">{affiliate.name}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={affiliate.status}
                              onValueChange={(v) => handleAffiliateInlineUpdate(affiliate.id, 'status', v)}
                            >
                              <SelectTrigger className={`w-28 h-8 ${statusColors.bg} ${statusColors.text} border-none text-xs font-medium`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {editingCell?.id === affiliate.id && editingCell?.field === 'affiliation' && editingCell?.type === 'affiliate' ? (
                              <Input
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => handleAffiliateInlineUpdate(affiliate.id, 'affiliation', editingValue)}
                                onKeyDown={(e) => handleKeyDown(e, affiliate.id, 'affiliation', 'affiliate')}
                                className="h-8 text-sm auth-input"
                                autoFocus
                              />
                            ) : (
                              <div
                                onClick={() => startEditing(affiliate.id, 'affiliation', 'affiliate', affiliate.affiliation)}
                                className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 text-sm text-gray-600"
                              >
                                {affiliate.affiliation || <span className="text-gray-400">-</span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingCell?.id === affiliate.id && editingCell?.field === 'commission_rate' && editingCell?.type === 'affiliate' ? (
                              <Input
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={() => handleAffiliateInlineUpdate(affiliate.id, 'commission_rate', editingValue ? parseFloat(editingValue) : null)}
                                onKeyDown={(e) => handleKeyDown(e, affiliate.id, 'commission_rate', 'affiliate')}
                                className="h-8 text-sm auth-input w-20"
                                type="number"
                                autoFocus
                              />
                            ) : (
                              <div
                                onClick={() => startEditing(affiliate.id, 'commission_rate', 'affiliate', affiliate.commission_rate)}
                                className="cursor-pointer hover:bg-gray-100 rounded px-2 py-1 -mx-2 -my-1 text-sm"
                              >
                                {affiliate.commission_rate ? `${affiliate.commission_rate}%` : <span className="text-gray-400">-</span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={affiliate.owner_id || 'none'}
                              onValueChange={(v) => handleAffiliateInlineUpdate(affiliate.id, 'owner_id', v === 'none' ? null : v)}
                            >
                              <SelectTrigger className="w-32 h-8 text-xs auth-input">
                                <SelectValue placeholder="Select">
                                  {affiliate.owner_id ? (users.find(u => u.id === affiliate.owner_id)?.name || users.find(u => u.id === affiliate.owner_id)?.email || '-') : <span className="text-gray-400">-</span>}
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
                            {primaryContact ? (
                              <HoverCard>
                                <HoverCardTrigger asChild>
                                  <div className="flex items-center gap-2 cursor-pointer">
                                    <span className="text-sm hover:text-blue-600">{primaryContact.name}</span>
                                    {affiliateContactLinks.length > 1 && (
                                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                        +{affiliateContactLinks.length - 1}
                                      </Badge>
                                    )}
                                  </div>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-72" align="start">
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-purple-100 rounded-full">
                                        <Users className="h-4 w-4 text-purple-600" />
                                      </div>
                                      <div>
                                        <p className="font-medium">{primaryContact.name}</p>
                                        {affiliateContactLinks[0]?.role && (
                                          <p className="text-xs text-gray-500">{affiliateContactLinks[0].role}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 text-sm">
                                      {primaryContact.email && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Mail className="h-3.5 w-3.5" />
                                          <span>{primaryContact.email}</span>
                                        </div>
                                      )}
                                      {primaryContact.telegram_id && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <MessageSquare className="h-3.5 w-3.5" />
                                          <span>@{primaryContact.telegram_id}</span>
                                        </div>
                                      )}
                                      {primaryContact.phone && (
                                        <div className="flex items-center gap-2 text-gray-600">
                                          <Phone className="h-3.5 w-3.5" />
                                          <span>{primaryContact.phone}</span>
                                        </div>
                                      )}
                                    </div>
                                    {affiliateContactLinks.length > 1 && (
                                      <div className="pt-2 border-t">
                                        <p className="text-xs text-gray-500">
                                          +{affiliateContactLinks.length - 1} more contact{affiliateContactLinks.length > 2 ? 's' : ''}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </HoverCardContent>
                              </HoverCard>
                            ) : <span className="text-gray-400">-</span>}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {affiliate.last_contacted_at ? formatShortDate(affiliate.last_contacted_at) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {formatShortDate(affiliate.created_at)}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditAffiliate(affiliate)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleOpenAffiliateContactLink(affiliate)}>
                                  <Users className="h-4 w-4 mr-2" />
                                  Manage Contacts
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMarkAffiliateContacted(affiliate.id)}>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Mark as Contacted
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => handleDeleteAffiliate(affiliate)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Affiliates Cards View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAffiliates.length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <p className="text-gray-600">No affiliates found.</p>
              </div>
            ) : (
              filteredAffiliates.map((affiliate) => (
                <Card key={affiliate.id} className="group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Users className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{affiliate.name}</CardTitle>
                          {affiliate.affiliation && (
                            <p className="text-sm text-gray-500">{affiliate.affiliation}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`capitalize cursor-default hover:bg-inherit ${
                            affiliate.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-100' :
                            affiliate.status === 'new' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' :
                            'bg-gray-100 text-gray-800 hover:bg-gray-100'
                          }`}
                        >
                          {affiliate.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditAffiliate(affiliate)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenAffiliateContactLink(affiliate)}>
                              <Users className="h-4 w-4 mr-2" />
                              Manage Contacts
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenAffiliateHistory(affiliate)}>
                              <History className="h-4 w-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleMarkAffiliateContacted(affiliate.id)}>
                              <Phone className="h-4 w-4 mr-2" />
                              Mark as Contacted
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteAffiliate(affiliate)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {affiliate.commission_model && (
                      <p className="text-sm text-gray-600 mb-2">{affiliate.commission_model}</p>
                    )}
                    {affiliate.commission_rate && (
                      <Badge variant="outline" className="text-xs">
                        {affiliate.commission_rate}% commission
                      </Badge>
                    )}
                    {/* Linked Contacts */}
                    {(() => {
                      const affiliateContactLinks = getAffiliateContacts(affiliate.id);
                      if (affiliateContactLinks.length === 0) return null;
                      const primaryContact = affiliateContactLinks.find(l => l.is_primary)?.contact || affiliateContactLinks[0]?.contact;
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                            <Users className="h-3 w-3 text-purple-500" />
                            <span className="font-medium">Contacts ({affiliateContactLinks.length})</span>
                          </div>
                          <div className="ml-5 space-y-1">
                            <p className="text-sm font-medium text-gray-700">{primaryContact?.name}</p>
                            {primaryContact?.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Mail className="h-3 w-3" />
                                <span>{primaryContact.email}</span>
                              </div>
                            )}
                            {primaryContact?.telegram_id && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <MessageSquare className="h-3 w-3" />
                                <span>@{primaryContact.telegram_id}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))
            )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Partner Dialog */}
      <Dialog open={isNewPartnerOpen} onOpenChange={setIsNewPartnerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPartner ? 'Edit Partner' : 'Add New Partner'}</DialogTitle>
            <DialogDescription>
              {editingPartner ? 'Update partner details.' : 'Add a new business partner.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreatePartner(); }}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="partner-name">Name *</Label>
                <Input
                  id="partner-name"
                  value={partnerForm.name}
                  onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                  placeholder="Partner name"
                  className="auth-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="partner-category">Category</Label>
                  <Select
                    value={partnerForm.category || ''}
                    onValueChange={(v) => setPartnerForm({ ...partnerForm, category: v as any })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="service_provider">Service Provider</SelectItem>
                      <SelectItem value="investor_vc">Investor / VC</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="individual">Individual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partner-status">Status</Label>
                  <Select
                    value={partnerForm.status}
                    onValueChange={(v) => setPartnerForm({ ...partnerForm, status: v as any })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="partner-focus">Focus Area</Label>
                <Select
                  value={partnerForm.focus || 'none'}
                  onValueChange={(v) => setPartnerForm({ ...partnerForm, focus: v === 'none' ? undefined : v })}
                >
                  <SelectTrigger className="auth-input">
                    <SelectValue placeholder="Select focus area" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {partnerFocusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Owner */}
              <div className="grid gap-2">
                <Label htmlFor="partner-owner">Owner</Label>
                <Select
                  value={partnerForm.owner_id || 'none'}
                  onValueChange={(v) => setPartnerForm({ ...partnerForm, owner_id: v === 'none' ? undefined : v })}
                >
                  <SelectTrigger className="auth-input">
                    <SelectValue placeholder="Select owner" />
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
              </div>
              {/* Link to Affiliate */}
              <div className="grid gap-2">
                <Label>Affiliate</Label>
                {/* Toggle between Link and Create */}
                <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setPartnerDialogAffiliateMode('link')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                      partnerDialogAffiliateMode === 'link'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Link Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartnerDialogAffiliateMode('create')}
                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                      partnerDialogAffiliateMode === 'create'
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Create New
                  </button>
                </div>

                {partnerDialogAffiliateMode === 'link' ? (
                  <Select
                    value={partnerForm.affiliate_id || 'none'}
                    onValueChange={(v) => setPartnerForm({
                      ...partnerForm,
                      affiliate_id: v === 'none' ? undefined : v,
                      is_affiliate: v !== 'none'
                    })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select affiliate (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No affiliate link</SelectItem>
                      {affiliates.map((aff) => (
                        <SelectItem key={aff.id} value={aff.id}>
                          {aff.name} {aff.commission_model ? `(${aff.commission_model})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Input
                      value={newAffiliateInPartnerDialog.name}
                      onChange={(e) => setNewAffiliateInPartnerDialog({ ...newAffiliateInPartnerDialog, name: e.target.value })}
                      placeholder="Affiliate name *"
                      className="auth-input"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={newAffiliateInPartnerDialog.commission_model || ''}
                        onValueChange={(value) => setNewAffiliateInPartnerDialog({ ...newAffiliateInPartnerDialog, commission_model: value })}
                      >
                        <SelectTrigger className="auth-input">
                          <SelectValue placeholder="Commission model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Standard">Standard</SelectItem>
                          <SelectItem value="Strategic">Strategic</SelectItem>
                          <SelectItem value="Whitelabeled">Whitelabeled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={newAffiliateInPartnerDialog.commission_rate || ''}
                        onChange={(e) => setNewAffiliateInPartnerDialog({ ...newAffiliateInPartnerDialog, commission_rate: e.target.value })}
                        placeholder="Rate (e.g., 10%)"
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="partner-notes">Notes</Label>
                <Textarea
                  id="partner-notes"
                  value={partnerForm.notes || ''}
                  onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="auth-input"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewPartnerOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !partnerForm.name.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isSubmitting ? 'Saving...' : editingPartner ? 'Save Changes' : 'Create Partner'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Affiliate Dialog */}
      <Dialog open={isNewAffiliateOpen} onOpenChange={setIsNewAffiliateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAffiliate ? 'Edit Affiliate' : 'Add New Affiliate'}</DialogTitle>
            <DialogDescription>
              {editingAffiliate ? 'Update affiliate details.' : 'Add a new KOL or referrer with commission.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateAffiliate(); }}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="affiliate-name">Name *</Label>
                <Input
                  id="affiliate-name"
                  value={affiliateForm.name}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                  placeholder="Affiliate name"
                  className="auth-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="affiliate-affiliation">Affiliation</Label>
                  <Input
                    id="affiliate-affiliation"
                    value={affiliateForm.affiliation || ''}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, affiliation: e.target.value })}
                    placeholder="Company/organization"
                    className="auth-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="affiliate-status">Status</Label>
                  <Select
                    value={affiliateForm.status}
                    onValueChange={(v) => setAffiliateForm({ ...affiliateForm, status: v as any })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="affiliate-category">Category</Label>
                <Input
                  id="affiliate-category"
                  value={affiliateForm.category || ''}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, category: e.target.value })}
                  placeholder="Type of affiliate"
                  className="auth-input"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="affiliate-owner">Owner</Label>
                <Select
                  value={affiliateForm.owner_id || 'none'}
                  onValueChange={(v) => setAffiliateForm({ ...affiliateForm, owner_id: v === 'none' ? undefined : v })}
                >
                  <SelectTrigger className="auth-input">
                    <SelectValue placeholder="Select owner" />
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
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Commission Structure</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="affiliate-rate">Commission Rate (%)</Label>
                    <Input
                      id="affiliate-rate"
                      type="number"
                      value={affiliateForm.commission_rate || ''}
                      onChange={(e) => setAffiliateForm({ ...affiliateForm, commission_rate: parseFloat(e.target.value) || undefined })}
                      placeholder="0"
                      className="auth-input"
                    />
                  </div>
                  <div className="grid gap-2 col-span-2">
                    <Label htmlFor="affiliate-model">Commission Model</Label>
                    <Select
                      value={affiliateForm.commission_model || 'none'}
                      onValueChange={(v) => setAffiliateForm({ ...affiliateForm, commission_model: v === 'none' ? undefined : v })}
                    >
                      <SelectTrigger className="auth-input">
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="Standard">Standard</SelectItem>
                        <SelectItem value="Strategic">Strategic</SelectItem>
                        <SelectItem value="Whitelabeled">Whitelabeled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="affiliate-notes">Notes</Label>
                <Textarea
                  id="affiliate-notes"
                  value={affiliateForm.notes || ''}
                  onChange={(e) => setAffiliateForm({ ...affiliateForm, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="auth-input"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewAffiliateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !affiliateForm.name.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isSubmitting ? 'Saving...' : editingAffiliate ? 'Save Changes' : 'Create Affiliate'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Partner Contact Link Dialog */}
      <Dialog open={isPartnerContactLinkOpen} onOpenChange={setIsPartnerContactLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Contacts</DialogTitle>
            <DialogDescription>
              Link contacts to {linkingPartner?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Linked Contacts */}
            {partnerContacts.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Contacts</Label>
                <div className="border rounded-lg divide-y">
                  {partnerContacts.map((link) => (
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
                        onClick={() => handleUnlinkPartnerContact(link.id)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Contact */}
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
                        .filter(c => !partnerContacts.some(pc => pc.contact_id === c.id))
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
                    placeholder="Role (e.g., Account Manager, BD Lead)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="partner-is-primary"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="partner-is-primary" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleLinkContactToPartner}
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
                    placeholder="Role (e.g., Account Manager, BD Lead)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="partner-is-primary-new"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="partner-is-primary-new" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleCreateAndLinkContactToPartner}
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
            <Button variant="outline" onClick={() => setIsPartnerContactLinkOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partner Affiliate Link Dialog */}
      <Dialog open={isPartnerAffiliateLinkOpen} onOpenChange={setIsPartnerAffiliateLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Affiliate</DialogTitle>
            <DialogDescription>
              Link an affiliate to {linkingPartnerForAffiliate?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Current Linked Affiliate */}
            {linkingPartnerForAffiliate?.affiliate && (
              <div className="space-y-2">
                <Label>Currently Linked Affiliate</Label>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full" style={{ backgroundColor: '#e8f4f5' }}>
                        <Handshake className="h-4 w-4" style={{ color: '#3e8692' }} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{linkingPartnerForAffiliate.affiliate.name}</p>
                        {linkingPartnerForAffiliate.affiliate.commission_model && (
                          <span className="text-xs text-gray-500">{linkingPartnerForAffiliate.affiliate.commission_model}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePartnerAffiliateLink}
                      disabled={isSubmitting}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Add/Change Affiliate */}
            <div className="space-y-3 border-t pt-4">
              <Label>{linkingPartnerForAffiliate?.affiliate ? 'Change Affiliate' : 'Add Affiliate'}</Label>
              {/* Toggle between Link and Create */}
              <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                <button
                  type="button"
                  onClick={() => setAffiliateLinkMode('link')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    affiliateLinkMode === 'link'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Link Existing
                </button>
                <button
                  type="button"
                  onClick={() => setAffiliateLinkMode('create')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    affiliateLinkMode === 'create'
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Create New
                </button>
              </div>

              {affiliateLinkMode === 'link' ? (
                <>
                  <Select
                    value={selectedAffiliateForPartner}
                    onValueChange={setSelectedAffiliateForPartner}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Select an affiliate" />
                    </SelectTrigger>
                    <SelectContent>
                      {affiliates.map((affiliate) => (
                        <SelectItem key={affiliate.id} value={affiliate.id}>
                          {affiliate.name} {affiliate.commission_model ? `(${affiliate.commission_model})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSavePartnerAffiliateLink}
                    disabled={!selectedAffiliateForPartner || isSubmitting}
                    className="w-full hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <LinkIcon className="h-4 w-4 mr-2" />
                    {isSubmitting ? 'Saving...' : 'Link Affiliate'}
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={newAffiliateFormForPartner.name}
                    onChange={(e) => setNewAffiliateFormForPartner({ ...newAffiliateFormForPartner, name: e.target.value })}
                    placeholder="Affiliate name *"
                    className="auth-input"
                  />
                  <Select
                    value={newAffiliateFormForPartner.commission_model || ''}
                    onValueChange={(value) => setNewAffiliateFormForPartner({ ...newAffiliateFormForPartner, commission_model: value })}
                  >
                    <SelectTrigger className="auth-input">
                      <SelectValue placeholder="Commission model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Strategic">Strategic</SelectItem>
                      <SelectItem value="Whitelabeled">Whitelabeled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={newAffiliateFormForPartner.commission_rate || ''}
                    onChange={(e) => setNewAffiliateFormForPartner({ ...newAffiliateFormForPartner, commission_rate: e.target.value })}
                    placeholder="Commission rate (e.g., 10%)"
                    className="auth-input"
                  />
                  <Textarea
                    value={newAffiliateFormForPartner.notes || ''}
                    onChange={(e) => setNewAffiliateFormForPartner({ ...newAffiliateFormForPartner, notes: e.target.value })}
                    placeholder="Notes"
                    className="auth-input"
                    rows={2}
                  />
                  <Button
                    onClick={handleCreateAndLinkAffiliateToPartner}
                    disabled={!newAffiliateFormForPartner.name.trim() || isSubmitting}
                    className="w-full hover:opacity-90"
                    style={{ backgroundColor: '#3e8692', color: 'white' }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isSubmitting ? 'Creating...' : 'Create & Link Affiliate'}
                  </Button>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPartnerAffiliateLinkOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Affiliate Contact Link Dialog */}
      <Dialog open={isAffiliateContactLinkOpen} onOpenChange={setIsAffiliateContactLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Contacts</DialogTitle>
            <DialogDescription>
              Link contacts to {linkingAffiliate?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Linked Contacts */}
            {affiliateContacts.length > 0 && (
              <div className="space-y-2">
                <Label>Linked Contacts</Label>
                <div className="border rounded-lg divide-y">
                  {affiliateContacts.map((link) => (
                    <div key={link.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-full">
                          <Users className="h-4 w-4 text-purple-600" />
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
                        onClick={() => handleUnlinkAffiliateContact(link.id)}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Contact */}
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
                        .filter(c => !affiliateContacts.some(ac => ac.contact_id === c.id))
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
                    placeholder="Role (e.g., Account Manager, Point of Contact)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="affiliate-is-primary"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="affiliate-is-primary" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleLinkContactToAffiliate}
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
                    placeholder="Role (e.g., Account Manager, Point of Contact)"
                    className="auth-input"
                  />
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="affiliate-is-primary-new"
                      checked={isPrimaryContact}
                      onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
                    />
                    <Label htmlFor="affiliate-is-primary-new" className="text-sm font-normal">
                      Primary contact
                    </Label>
                  </div>
                  <Button
                    onClick={handleCreateAndLinkContactToAffiliate}
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
            <Button variant="outline" onClick={() => setIsAffiliateContactLinkOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Status History</DialogTitle>
            <DialogDescription>
              History for {historyEntity?.name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 py-4">
              {stageHistory.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No history available</p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

                  {stageHistory.map((entry) => (
                    <div key={entry.id} className="relative pl-10 pb-4">
                      {/* Timeline dot */}
                      <div className="absolute left-2.5 w-3 h-3 bg-white border-2 border-gray-400 rounded-full" />

                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          {entry.from_stage ? (
                            <>
                              <Badge variant="outline" className="text-xs">
                                {historyType === 'partner'
                                  ? partnerStatusLabels[entry.from_stage as PartnerStatus] || entry.from_stage
                                  : affiliateStatusLabels[entry.from_stage as AffiliateStatus] || entry.from_stage
                                }
                              </Badge>
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <Badge
                                className="text-xs"
                                style={{ backgroundColor: '#3e8692', color: 'white' }}
                              >
                                {historyType === 'partner'
                                  ? partnerStatusLabels[entry.to_stage as PartnerStatus] || entry.to_stage
                                  : affiliateStatusLabels[entry.to_stage as AffiliateStatus] || entry.to_stage
                                }
                              </Badge>
                            </>
                          ) : (
                            <Badge
                              className="text-xs"
                              style={{ backgroundColor: '#3e8692', color: 'white' }}
                            >
                              Created as {historyType === 'partner'
                                ? partnerStatusLabels[entry.to_stage as PartnerStatus] || entry.to_stage
                                : affiliateStatusLabels[entry.to_stage as AffiliateStatus] || entry.to_stage
                              }
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

      {/* Delete Partner Confirmation Dialog */}
      <Dialog open={isDeletePartnerDialogOpen} onOpenChange={setIsDeletePartnerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Partner</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{partnerToDelete?.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeletePartnerDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeletePartner}
            >
              Delete Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Affiliate Confirmation Dialog */}
      <Dialog open={isDeleteAffiliateDialogOpen} onOpenChange={setIsDeleteAffiliateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Affiliate</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{affiliateToDelete?.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteAffiliateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteAffiliate}
            >
              Delete Affiliate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
