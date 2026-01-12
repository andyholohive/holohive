'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Search, Edit, Trash2, UserPlus,
  Mail, MessageSquare, MoreHorizontal, Building2, Handshake, Users, TrendingUp,
  Filter, ArrowUpDown, X, Link2
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  CRMService,
  CRMContact,
  CRMContactLink,
  CRMOpportunity,
  CRMPartner,
  CRMAffiliate,
  CreateContactData,
} from '@/lib/crmService';

export default function ContactsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [allContactLinks, setAllContactLinks] = useState<CRMContactLink[]>([]);
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [partners, setPartners] = useState<CRMPartner[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
  const [contactForm, setContactForm] = useState<CreateContactData>({
    name: '',
  });

  // Delete confirmation dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: string; name: string } | null>(null);

  // Link to network state
  const [linkToAffiliate, setLinkToAffiliate] = useState(false);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<string>('');
  const [linkToPartner, setLinkToPartner] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [existingAffiliateLink, setExistingAffiliateLink] = useState<CRMContactLink | null>(null);
  const [existingPartnerLink, setExistingPartnerLink] = useState<CRMContactLink | null>(null);

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLinked, setFilterLinked] = useState<string>('all');

  // Category combobox state
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  // Sort state
  const [sortBy, setSortBy] = useState<string>('created_desc');

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const [conts, contactLinks, opps, parts, affs] = await Promise.all([
        CRMService.getAllContacts(),
        CRMService.getAllContactLinks(),
        CRMService.getAllOpportunities(),
        CRMService.getAllPartners(),
        CRMService.getAllAffiliates()
      ]);
      setContacts(conts);
      setAllContactLinks(contactLinks);
      setOpportunities(opps);
      setPartners(parts);
      setAffiliates(affs);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get linked entities for a contact
  const getContactLinks = (contactId: string) => {
    return allContactLinks.filter(link => link.contact_id === contactId);
  };

  // Get linked opportunities for a contact
  const getLinkedOpportunities = (contactId: string) => {
    const links = getContactLinks(contactId).filter(l => l.opportunity_id);
    return links.map(l => opportunities.find(o => o.id === l.opportunity_id)).filter(Boolean) as CRMOpportunity[];
  };

  // Get linked partners for a contact
  const getLinkedPartners = (contactId: string) => {
    const links = getContactLinks(contactId).filter(l => l.partner_id);
    return links.map(l => partners.find(p => p.id === l.partner_id)).filter(Boolean) as CRMPartner[];
  };

  // Get linked affiliates for a contact
  const getLinkedAffiliates = (contactId: string) => {
    const links = getContactLinks(contactId).filter(l => l.affiliate_id);
    return links.map(l => affiliates.find(a => a.id === l.affiliate_id)).filter(Boolean) as CRMAffiliate[];
  };

  const handleCreateContact = async () => {
    if (!contactForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      let contactId: string;

      if (editingContact) {
        await CRMService.updateContact(editingContact.id, contactForm);
        contactId = editingContact.id;
      } else {
        const newContact = await CRMService.createContact({
          ...contactForm,
          owner_id: user?.id
        });
        contactId = newContact.id;
      }

      // Handle affiliate link
      if (linkToAffiliate && selectedAffiliateId) {
        if (existingAffiliateLink) {
          // If affiliate changed, delete old and create new
          if (existingAffiliateLink.affiliate_id !== selectedAffiliateId) {
            await CRMService.unlinkContact(existingAffiliateLink.id);
            await CRMService.linkContactToAffiliate(contactId, selectedAffiliateId);
          }
        } else {
          await CRMService.linkContactToAffiliate(contactId, selectedAffiliateId);
        }
      } else if (!linkToAffiliate && existingAffiliateLink) {
        // Unlink affiliate if checkbox unchecked
        await CRMService.unlinkContact(existingAffiliateLink.id);
      }

      // Handle partner link
      if (linkToPartner && selectedPartnerId) {
        if (existingPartnerLink) {
          // If partner changed, delete old and create new
          if (existingPartnerLink.partner_id !== selectedPartnerId) {
            await CRMService.unlinkContact(existingPartnerLink.id);
            await CRMService.linkContactToPartner(contactId, selectedPartnerId);
          }
        } else {
          await CRMService.linkContactToPartner(contactId, selectedPartnerId);
        }
      } else if (!linkToPartner && existingPartnerLink) {
        // Unlink partner if checkbox unchecked
        await CRMService.unlinkContact(existingPartnerLink.id);
      }

      setIsNewContactOpen(false);
      setEditingContact(null);
      setContactForm({ name: '' });
      resetLinkState();
      fetchContacts();
    } catch (error) {
      console.error('Error saving contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetLinkState = () => {
    setLinkToAffiliate(false);
    setSelectedAffiliateId('');
    setLinkToPartner(false);
    setSelectedPartnerId('');
    setExistingAffiliateLink(null);
    setExistingPartnerLink(null);
  };

  const handleEditContact = (contact: CRMContact) => {
    setEditingContact(contact);

    // Check for existing affiliate/partner links
    const contactLinks = getContactLinks(contact.id);
    const affiliateLink = contactLinks.find(l => l.affiliate_id);
    const partnerLink = contactLinks.find(l => l.partner_id);

    // Determine category - use contact's category, or fall back to affiliate's category
    let categoryToUse = contact.category || undefined;
    if (!categoryToUse && affiliateLink?.affiliate_id) {
      const linkedAffiliate = affiliates.find(a => a.id === affiliateLink.affiliate_id);
      if (linkedAffiliate?.category) {
        // Format affiliate category to human-readable
        categoryToUse =
          linkedAffiliate.category === 'service_provider' ? 'Service Provider' :
          linkedAffiliate.category === 'investor_vc' ? 'Investor / VC' :
          linkedAffiliate.category === 'project' ? 'Project' :
          linkedAffiliate.category;
      }
    }

    setContactForm({
      name: contact.name,
      email: contact.email || undefined,
      telegram_id: contact.telegram_id || undefined,
      x_id: contact.x_id || undefined,
      role: contact.role || undefined,
      category: categoryToUse,
      notes: contact.notes || undefined
    });

    if (affiliateLink) {
      setLinkToAffiliate(true);
      setSelectedAffiliateId(affiliateLink.affiliate_id || '');
      setExistingAffiliateLink(affiliateLink);
    } else {
      setLinkToAffiliate(false);
      setSelectedAffiliateId('');
      setExistingAffiliateLink(null);
    }

    if (partnerLink) {
      setLinkToPartner(true);
      setSelectedPartnerId(partnerLink.partner_id || '');
      setExistingPartnerLink(partnerLink);
    } else {
      setLinkToPartner(false);
      setSelectedPartnerId('');
      setExistingPartnerLink(null);
    }

    setIsNewContactOpen(true);
  };

  const handleDeleteContact = (contact: CRMContact) => {
    setContactToDelete({ id: contact.id, name: contact.name });
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteContact = async () => {
    if (!contactToDelete) return;
    try {
      await CRMService.deleteContact(contactToDelete.id);
      setIsDeleteDialogOpen(false);
      setContactToDelete(null);
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  // Helper function to format category names
  const formatCategory = (category: string): string => {
    // Handle known affiliate category codes
    if (category === 'service_provider') return 'Service Provider';
    if (category === 'investor_vc') return 'Investor / VC';
    if (category === 'project') return 'Project';
    // For other categories, capitalize first letter of each word
    return category
      .split(/[_\s]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Get all unique categories (from contacts and affiliates), formatted
  const categories = [...new Set([
    ...contacts.map(c => c.category).filter(Boolean).map(formatCategory),
    ...affiliates.map(a => a.category).filter(Boolean).map(formatCategory)
  ])] as string[];

  const filteredContacts = contacts
    .filter(c => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!c.name.toLowerCase().includes(term) &&
            !c.email?.toLowerCase().includes(term) &&
            !c.telegram_id?.toLowerCase().includes(term)) {
          return false;
        }
      }
      // Category filter
      if (filterCategory !== 'all' && c.category !== filterCategory) {
        return false;
      }
      // Linked filter
      if (filterLinked !== 'all') {
        const contactLinks = getContactLinks(c.id);
        const isLinked = contactLinks.length > 0;
        if (filterLinked === 'linked' && !isLinked) return false;
        if (filterLinked === 'unlinked' && isLinked) return false;
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
  const hasActiveFilters = filterCategory !== 'all' || filterLinked !== 'all';

  // Clear all filters
  const clearFilters = () => {
    setFilterCategory('all');
    setFilterLinked('all');
    setSearchTerm('');
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
        {/* Cards skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Compute stats
  const linkedContacts = contacts.filter(c => getContactLinks(c.id).length > 0).length;
  const unlinkedContacts = contacts.length - linkedContacts;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
          <p className="text-gray-600">Manage your contact directory</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search contacts..."
              className="pl-10 w-64 auth-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setEditingContact(null);
              setContactForm({ name: '' });
              resetLinkState();
              setIsNewContactOpen(true);
            }}
            className="hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total Contacts</p>
                <p className="text-2xl font-bold text-gray-900">{contacts.length}</p>
              </div>
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <UserPlus className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-white border-green-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Linked</p>
                <p className="text-2xl font-bold text-gray-900">{linkedContacts}</p>
              </div>
              <div className="p-2.5 bg-green-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-600">Unlinked</p>
                <p className="text-2xl font-bold text-gray-900">{unlinkedContacts}</p>
              </div>
              <div className="p-2.5 bg-amber-100 rounded-lg">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Categories</p>
                <p className="text-2xl font-bold text-gray-900">{categories.length}</p>
              </div>
              <div className="p-2.5 bg-purple-100 rounded-lg">
                <Building2 className="h-5 w-5 text-purple-600" />
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
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40 h-9 text-sm auth-input">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterLinked} onValueChange={setFilterLinked}>
          <SelectTrigger className="w-36 h-9 text-sm auth-input">
            <SelectValue placeholder="Link status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contacts</SelectItem>
            <SelectItem value="linked">Linked</SelectItem>
            <SelectItem value="unlinked">Unlinked</SelectItem>
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
            <SelectItem value="created_desc">Newest First</SelectItem>
            <SelectItem value="created_asc">Oldest First</SelectItem>
            <SelectItem value="name_asc">Name A-Z</SelectItem>
            <SelectItem value="name_desc">Name Z-A</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-4 w-4 mr-1" />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Contacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredContacts.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
            <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              {searchTerm ? 'No contacts found matching your search.' : 'No contacts yet'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {searchTerm ? 'Try adjusting your search or filters.' : 'Add your first contact to get started.'}
            </p>
            {!searchTerm && (
              <Button
                className="mt-4"
                onClick={() => {
                  setEditingContact(null);
                  setContactForm({ name: '' });
                  resetLinkState();
                  setIsNewContactOpen(true);
                }}
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Contact
              </Button>
            )}
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const linkedOpps = getLinkedOpportunities(contact.id);
            const linkedParts = getLinkedPartners(contact.id);
            const linkedAffs = getLinkedAffiliates(contact.id);
            const totalLinks = linkedOpps.length + linkedParts.length + linkedAffs.length;
            const hasContactInfo = contact.email || contact.telegram_id || contact.x_id;

            return (
              <Card key={contact.id} className="group hover:shadow-md transition-shadow duration-200 overflow-hidden">
                {/* Card Header with gradient accent */}
                <div className="h-0.5 bg-gradient-to-r from-blue-500 to-cyan-500" />
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-gradient-to-br from-blue-100 to-cyan-50 rounded-lg shrink-0">
                        <UserPlus className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{contact.name}</CardTitle>
                        {contact.role && (
                          <p className="text-xs text-gray-500 truncate">{contact.role}</p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => handleDeleteContact(contact)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  {/* Contact Info Section */}
                  {hasContactInfo && (
                    <div className="bg-gray-50 rounded-md p-2 space-y-1">
                      {contact.email && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="text-gray-600 truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.telegram_id && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <MessageSquare className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="text-gray-600 truncate">@{contact.telegram_id}</span>
                        </div>
                      )}
                      {contact.x_id && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="h-3 w-3 flex items-center justify-center font-bold text-[8px] text-gray-400 shrink-0">𝕏</span>
                          <span className="text-gray-600 truncate">@{contact.x_id}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category Badge */}
                  {contact.category && (
                    <Badge variant="outline" className="text-[10px] bg-white px-1.5 py-0">
                      {contact.category}
                    </Badge>
                  )}

                  {/* Linked Entities */}
                  {totalLinks > 0 && (
                    <div className="pt-1.5 border-t border-gray-100 space-y-1.5">
                      {/* Linked Opportunities */}
                      {linkedOpps.length > 0 && (
                        <div className="flex items-start gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {linkedOpps.map(opp => (
                              <Badge key={opp.id} variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 font-normal px-1.5 py-0">
                                {opp.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Linked Partners */}
                      {linkedParts.length > 0 && (
                        <div className="flex items-start gap-1">
                          <Handshake className="h-3 w-3 text-blue-600 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {linkedParts.map(part => (
                              <Badge key={part.id} variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 font-normal px-1.5 py-0">
                                {part.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Linked Affiliates */}
                      {linkedAffs.length > 0 && (
                        <div className="flex items-start gap-1">
                          <Users className="h-3 w-3 text-purple-600 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {linkedAffs.map(aff => (
                              <Badge key={aff.id} variant="secondary" className="text-[10px] bg-purple-50 text-purple-700 font-normal px-1.5 py-0">
                                {aff.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Contact Dialog */}
      <Dialog open={isNewContactOpen} onOpenChange={setIsNewContactOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingContact ? 'Edit Contact' : 'Add New Contact'}</DialogTitle>
            <DialogDescription>
              {editingContact ? 'Update contact details.' : 'Add a new contact person.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateContact(); }}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="contact-name">Name *</Label>
                <Input
                  id="contact-name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Contact name"
                  className="auth-input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactForm.email || ''}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="Email address"
                    className="auth-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contact-role">Role</Label>
                  <Input
                    id="contact-role"
                    value={contactForm.role || ''}
                    onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                    placeholder="Job title/role"
                    className="auth-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact-telegram">Telegram</Label>
                  <Input
                    id="contact-telegram"
                    value={contactForm.telegram_id || ''}
                    onChange={(e) => setContactForm({ ...contactForm, telegram_id: e.target.value })}
                    placeholder="@username"
                    className="auth-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contact-x">X (Twitter)</Label>
                  <Input
                    id="contact-x"
                    value={contactForm.x_id || ''}
                    onChange={(e) => setContactForm({ ...contactForm, x_id: e.target.value })}
                    placeholder="@handle"
                    className="auth-input"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-category">Category</Label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryPopoverOpen}
                      className="w-full justify-between auth-input font-normal"
                    >
                      {contactForm.category || <span className="text-gray-400">Select or enter category...</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search or enter new category..."
                        value={contactForm.category || ''}
                        onValueChange={(value) => setContactForm({ ...contactForm, category: value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && contactForm.category) {
                            e.preventDefault();
                            setCategoryPopoverOpen(false);
                          }
                        }}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-2 px-3 text-sm">
                            {contactForm.category ? (
                              <span>Press enter to use "<strong>{contactForm.category}</strong>"</span>
                            ) : (
                              <span>Type to enter a new category</span>
                            )}
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {categories.map((cat) => (
                            <CommandItem
                              key={cat}
                              value={cat}
                              onSelect={(value) => {
                                setContactForm({ ...contactForm, category: value });
                                setCategoryPopoverOpen(false);
                              }}
                            >
                              {cat}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contact-notes">Notes</Label>
                <Textarea
                  id="contact-notes"
                  value={contactForm.notes || ''}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })}
                  placeholder="Additional notes..."
                  className="auth-input"
                  rows={3}
                />
              </div>

              {/* Link to Network Section */}
              {(affiliates.length > 0 || partners.length > 0) && (
                <div className="border-t pt-4 mt-2">
                  <Label className="text-sm font-medium flex items-center gap-2 mb-3">
                    <Link2 className="h-4 w-4" />
                    Link to Network
                  </Label>
                  <div className="space-y-3">
                    {/* Affiliate Link */}
                    {affiliates.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="link-affiliate"
                            checked={linkToAffiliate}
                            onCheckedChange={(checked) => {
                              setLinkToAffiliate(!!checked);
                              if (!checked) {
                                setSelectedAffiliateId('');
                              } else if (selectedAffiliateId) {
                                // Auto-fill category if affiliate already selected
                                const selectedAffiliate = affiliates.find(a => a.id === selectedAffiliateId);
                                if (selectedAffiliate?.category) {
                                  const formattedCategory =
                                    selectedAffiliate.category === 'service_provider' ? 'Service Provider' :
                                    selectedAffiliate.category === 'investor_vc' ? 'Investor / VC' :
                                    selectedAffiliate.category === 'project' ? 'Project' :
                                    selectedAffiliate.category;
                                  setContactForm(prev => ({ ...prev, category: formattedCategory }));
                                }
                              }
                            }}
                          />
                          <Label htmlFor="link-affiliate" className="text-sm font-normal cursor-pointer">
                            Link to Affiliate
                          </Label>
                        </div>
                        {linkToAffiliate && (
                          <Select
                            value={selectedAffiliateId}
                            onValueChange={(affId) => {
                              setSelectedAffiliateId(affId);
                              // Auto-fill category from affiliate
                              const selectedAffiliate = affiliates.find(a => a.id === affId);
                              if (selectedAffiliate?.category) {
                                // Format affiliate category to human-readable
                                const formattedCategory =
                                  selectedAffiliate.category === 'service_provider' ? 'Service Provider' :
                                  selectedAffiliate.category === 'investor_vc' ? 'Investor / VC' :
                                  selectedAffiliate.category === 'project' ? 'Project' :
                                  selectedAffiliate.category;
                                setContactForm(prev => ({ ...prev, category: formattedCategory }));
                              }
                            }}
                          >
                            <SelectTrigger className="auth-input">
                              <SelectValue placeholder="Select affiliate..." />
                            </SelectTrigger>
                            <SelectContent>
                              {affiliates.map(aff => (
                                <SelectItem key={aff.id} value={aff.id}>{aff.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    {/* Partner Link */}
                    {partners.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="link-partner"
                            checked={linkToPartner}
                            onCheckedChange={(checked) => {
                              setLinkToPartner(!!checked);
                              if (!checked) setSelectedPartnerId('');
                            }}
                          />
                          <Label htmlFor="link-partner" className="text-sm font-normal cursor-pointer">
                            Link to Partner
                          </Label>
                        </div>
                        {linkToPartner && (
                          <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                            <SelectTrigger className="auth-input">
                              <SelectValue placeholder="Select partner..." />
                            </SelectTrigger>
                            <SelectContent>
                              {partners.map(part => (
                                <SelectItem key={part.id} value={part.id}>{part.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewContactOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !contactForm.name.trim()}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isSubmitting ? 'Saving...' : editingContact ? 'Save Changes' : 'Create Contact'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Contact Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Contact</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-600">
              Are you sure you want to delete <strong>{contactToDelete?.name}</strong>? This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteContact}
            >
              Delete Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
