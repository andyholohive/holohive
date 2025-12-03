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
import {
  Plus, Search, Edit, Trash2, Users, Handshake,
  Building2, Mail, MoreHorizontal
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  CRMService,
  CRMPartner,
  CRMAffiliate,
  CreatePartnerData,
  CreateAffiliateData,
} from '@/lib/crmService';

type NetworkTab = 'partners' | 'affiliates';

export default function NetworkPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<NetworkTab>('partners');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [partners, setPartners] = useState<CRMPartner[]>([]);
  const [affiliates, setAffiliates] = useState<CRMAffiliate[]>([]);

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [parts, affs] = await Promise.all([
        CRMService.getAllPartners(),
        CRMService.getAllAffiliates()
      ]);
      setPartners(parts);
      setAffiliates(affs);
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
      if (editingPartner) {
        await CRMService.updatePartner(editingPartner.id, partnerForm);
      } else {
        await CRMService.createPartner({
          ...partnerForm,
          owner_id: user?.id
        });
      }
      setIsNewPartnerOpen(false);
      setEditingPartner(null);
      setPartnerForm({ name: '', status: 'active' });
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
      poc_name: partner.poc_name || undefined,
      poc_email: partner.poc_email || undefined,
      poc_telegram: partner.poc_telegram || undefined,
      is_affiliate: partner.is_affiliate,
      affiliate_id: partner.affiliate_id || undefined,
      notes: partner.notes || undefined
    });
    setIsNewPartnerOpen(true);
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm('Are you sure you want to delete this partner?')) return;
    try {
      await CRMService.deletePartner(id);
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
      poc_name: affiliate.poc_name || undefined,
      poc_email: affiliate.poc_email || undefined,
      poc_telegram: affiliate.poc_telegram || undefined,
      notes: affiliate.notes || undefined
    });
    setIsNewAffiliateOpen(true);
  };

  const handleDeleteAffiliate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this affiliate?')) return;
    try {
      await CRMService.deleteAffiliate(id);
      fetchData();
    } catch (error) {
      console.error('Error deleting affiliate:', error);
    }
  };

  const filteredPartners = partners.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredAffiliates = affiliates.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Partners & Affiliates</h2>
          <p className="text-gray-600">Manage your business relationships and referral network</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Partners</p>
                <p className="text-2xl font-bold">{partners.filter(p => p.status === 'active').length}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <Handshake className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Partners</p>
                <p className="text-2xl font-bold">{partners.length}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-full">
                <Building2 className="h-6 w-6 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Affiliates</p>
                <p className="text-2xl font-bold">{affiliates.filter(a => a.status === 'active').length}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Affiliates</p>
                <p className="text-2xl font-bold">{affiliates.length}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <Users className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as NetworkTab)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="partners" className="flex items-center gap-2">
              <Handshake className="h-4 w-4" />
              Partners
            </TabsTrigger>
            <TabsTrigger value="affiliates" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Affiliates
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search..."
                className="pl-10 auth-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {activeTab === 'partners' && (
              <Button
                onClick={() => {
                  setEditingPartner(null);
                  setPartnerForm({ name: '', status: 'active' });
                  setIsNewPartnerOpen(true);
                }}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            )}
            {activeTab === 'affiliates' && (
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

        {/* Partners Tab */}
        <TabsContent value="partners" className="mt-6">
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
                            <Badge variant="outline" className="text-xs mt-1">
                              {partner.category.replace('_', ' ')}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={partner.status === 'active' ? 'default' : 'secondary'}
                          style={partner.status === 'active' ? { backgroundColor: '#3e8692' } : {}}
                        >
                          {partner.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPartner(partner)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeletePartner(partner.id)}
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
                      <p className="text-sm text-gray-600 mb-2">{partner.focus}</p>
                    )}
                    {partner.poc_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Users className="h-4 w-4" />
                        <span>{partner.poc_name}</span>
                      </div>
                    )}
                    {partner.poc_email && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Mail className="h-4 w-4" />
                        <span>{partner.poc_email}</span>
                      </div>
                    )}
                    {partner.is_affiliate && (
                      <Badge variant="secondary" className="mt-2 text-xs bg-purple-100 text-purple-800">
                        Also Affiliate
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Affiliates Tab */}
        <TabsContent value="affiliates" className="mt-6">
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
                          className={
                            affiliate.status === 'active' ? 'bg-green-100 text-green-800' :
                            affiliate.status === 'new' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {affiliate.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditAffiliate(affiliate)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteAffiliate(affiliate.id)}
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
                    {affiliate.poc_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                        <Users className="h-4 w-4" />
                        <span>{affiliate.poc_name}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
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
                <Input
                  id="partner-focus"
                  value={partnerForm.focus || ''}
                  onChange={(e) => setPartnerForm({ ...partnerForm, focus: e.target.value })}
                  placeholder="Area of focus/expertise"
                  className="auth-input"
                />
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Point of Contact</h4>
                <div className="grid gap-3">
                  <Input
                    value={partnerForm.poc_name || ''}
                    onChange={(e) => setPartnerForm({ ...partnerForm, poc_name: e.target.value })}
                    placeholder="Contact name"
                    className="auth-input"
                  />
                  <Input
                    type="email"
                    value={partnerForm.poc_email || ''}
                    onChange={(e) => setPartnerForm({ ...partnerForm, poc_email: e.target.value })}
                    placeholder="Email"
                    className="auth-input"
                  />
                  <Input
                    value={partnerForm.poc_telegram || ''}
                    onChange={(e) => setPartnerForm({ ...partnerForm, poc_telegram: e.target.value })}
                    placeholder="Telegram handle"
                    className="auth-input"
                  />
                </div>
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
                    <Input
                      id="affiliate-model"
                      value={affiliateForm.commission_model || ''}
                      onChange={(e) => setAffiliateForm({ ...affiliateForm, commission_model: e.target.value })}
                      placeholder="Describe the commission structure"
                      className="auth-input"
                    />
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm mb-3">Point of Contact</h4>
                <div className="grid gap-3">
                  <Input
                    value={affiliateForm.poc_name || ''}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, poc_name: e.target.value })}
                    placeholder="Contact name"
                    className="auth-input"
                  />
                  <Input
                    type="email"
                    value={affiliateForm.poc_email || ''}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, poc_email: e.target.value })}
                    placeholder="Email"
                    className="auth-input"
                  />
                  <Input
                    value={affiliateForm.poc_telegram || ''}
                    onChange={(e) => setAffiliateForm({ ...affiliateForm, poc_telegram: e.target.value })}
                    placeholder="Telegram handle"
                    className="auth-input"
                  />
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
    </div>
  );
}
