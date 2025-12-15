'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Edit, Building2, Mail, Globe, Trash2, CheckCircle, PauseCircle, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Partner {
  id: string;
  name: string;
  email: string | null;
  website: string | null;
  description: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export default function PartnersPage() {
  const { user, userProfile } = useAuth();
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewPartnerOpen, setIsNewPartnerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<string | null>(null);

  // New partner form state
  const [newPartner, setNewPartner] = useState({
    name: '',
    email: '',
    website: '',
    description: '',
    is_active: true,
  });

  useEffect(() => {
    if (user?.id) {
      fetchPartners();
    }
  }, [user?.id]);

  const fetchPartners = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch (err) {
      setError('Failed to load partners');
      console.error('Error fetching partners:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredPartners = partners.filter(partner =>
    partner.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (partner.email && partner.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (partner.website && partner.website.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleEditPartner = (partner: Partner) => {
    setEditingPartner(partner);
    setNewPartner({
      name: partner.name,
      email: partner.email || '',
      website: partner.website || '',
      description: partner.description || '',
      is_active: partner.is_active || true,
    });
    setIsEditMode(true);
    setIsNewPartnerOpen(true);
  };

  const handleClosePartnerModal = () => {
    setIsNewPartnerOpen(false);
    setIsEditMode(false);
    setEditingPartner(null);
    setNewPartner({
      name: '',
      email: '',
      website: '',
      description: '',
      is_active: true,
    });
  };

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartner.name.trim()) return;
    
    try {
      setIsSubmitting(true);
      
      if (isEditMode && editingPartner) {
        const { error } = await supabase
          .from('partners')
          .update({
            name: newPartner.name.trim(),
            email: newPartner.email.trim() || null,
            website: newPartner.website.trim() || null,
            description: newPartner.description.trim() || null,
            is_active: newPartner.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPartner.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('partners')
          .insert({
            name: newPartner.name.trim(),
            email: newPartner.email.trim() || null,
            website: newPartner.website.trim() || null,
            description: newPartner.description.trim() || null,
            is_active: newPartner.is_active,
          });

        if (error) throw error;
      }
      
      handleClosePartnerModal();
      await fetchPartners();
    } catch (err) {
      console.error('Error saving partner:', err);
      setError('Failed to save partner');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePartner = async (partnerId: string) => {
    setPartnerToDelete(partnerId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeletePartner = async () => {
    if (!partnerToDelete) return;
    
    try {
      const { error } = await supabase
        .from('partners')
        .delete()
        .eq('id', partnerToDelete);

      if (error) throw error;
      await fetchPartners();
    } catch (err) {
      console.error('Error deleting partner:', err);
      setError('Failed to delete partner');
    } finally {
      setIsDeleteDialogOpen(false);
      setPartnerToDelete(null);
    }
  };

  const PartnerCardSkeleton = () => (
    <Card className="transition-shadow">
      <CardHeader className="pb-4">
        <div className="mb-3">
          <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
            <div className="flex items-center">
              <Skeleton className="h-8 w-8 rounded-lg mr-2" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-6 w-6 rounded" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex items-center text-sm text-gray-600 min-h-[20px]">
            <Skeleton className="h-4 w-4 mr-2" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100">
        <Skeleton className="h-20 w-full mb-4" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Channel Partners</h2>
              <p className="text-gray-600">Manage your channel partner relationships</p>
            </div>
            <div className="flex space-x-3">
              <Button className="hover:opacity-90" style={{ backgroundColor: '#3e8692', color: 'white' }} disabled>
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search partners by name, email, or website..." className="pl-10 auth-input" disabled />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <PartnerCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Channel Partners</h2>
            <p className="text-gray-600">Manage your channel partner relationships</p>
          </div>
          {userProfile?.role === 'admin' && (
            <div>
              <Button 
                className="hover:opacity-90" 
                style={{ backgroundColor: '#3e8692', color: 'white' }} 
                onClick={() => { setIsEditMode(false); setIsNewPartnerOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Partner
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search partners by name, email, or website..." 
              className="pl-10 auth-input" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPartners.length === 0 ? (
            <div className="col-span-full text-center py-8">
              <p className="text-gray-600">
                {searchTerm ? 'No partners found matching your search.' : 'No partners found.'}
              </p>
              {userProfile?.role === 'admin' && !searchTerm && (
                <Button 
                  className="mt-4 hover:opacity-90" 
                  style={{ backgroundColor: '#3e8692', color: 'white' }} 
                  onClick={() => { setIsEditMode(false); setIsNewPartnerOpen(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Partner
                </Button>
              )}
            </div>
          ) : (
            filteredPartners.map((partner) => (
              <Card key={partner.id} className="transition-shadow group">
                <CardHeader className="pb-4">
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-lg font-semibold text-gray-600 mb-2">
                      <div className="flex items-center">
                        <div className="bg-gray-100 p-1.5 rounded-lg mr-2">
                          <Building2 className="h-5 w-5 text-gray-600" />
                        </div>
                        {partner.name}
                      </div>
                      {userProfile?.role === 'admin' && (
                        <div className="flex items-center space-x-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleEditPartner(partner)} 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" 
                            title="Edit partner"
                          >
                            <Edit className="h-4 w-4 text-gray-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeletePartner(partner.id)} 
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-gray-100 w-auto px-2" 
                            title="Delete partner"
                          >
                            <Trash2 className="h-4 w-4 text-gray-600" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <Badge 
                      variant={partner.is_active ? 'default' : 'secondary'} 
                      className="text-xs" 
                      style={partner.is_active ? { backgroundColor: '#3e8692', color: 'white', borderColor: '#3e8692' } : {}}
                    >
                      {partner.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {partner.email && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Mail className="h-4 w-4 mr-2 text-gray-600" />
                        <span className="text-gray-600">{partner.email}</span>
                      </div>
                    )}
                    {partner.website && (
                      <div className="flex items-center text-sm text-gray-600">
                        <Globe className="h-4 w-4 mr-2 text-gray-600" />
                        <a 
                          href={partner.website.startsWith('http') ? partner.website : `https://${partner.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {partner.website}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="h-4 w-4 mr-2 text-gray-600" />
                      <span className="text-gray-600">{partner.created_at ? new Date(partner.created_at).toLocaleDateString() : 'Unknown'}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 border-t border-gray-100">
                  {partner.description && (
                    <div className="text-sm text-gray-600 mb-4">
                      <p className="line-clamp-3">{partner.description}</p>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => router.push(`/clients?partnerId=${partner.id}`)}
                  >
                    <Building2 className="h-4 w-4 mr-2" />
                    View Clients
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* New/Edit Partner Dialog */}
        <Dialog open={isNewPartnerOpen} onOpenChange={setIsNewPartnerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isEditMode ? 'Edit Partner' : 'Add New Partner'}</DialogTitle>
              <DialogDescription>
                {isEditMode ? 'Update partner information.' : 'Add a new partner to your system.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreatePartner}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Partner Name *</Label>
                  <Input 
                    id="name" 
                    value={newPartner.name} 
                    onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })} 
                    placeholder="Enter partner name" 
                    className="auth-input" 
                    required 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={newPartner.email} 
                    onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })} 
                    placeholder="Enter email address" 
                    className="auth-input" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input 
                    id="website" 
                    type="text" 
                    value={newPartner.website} 
                    onChange={(e) => setNewPartner({ ...newPartner, website: e.target.value })} 
                    placeholder="Enter website URL (e.g., https://example.com)" 
                    className="auth-input" 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    value={newPartner.description} 
                    onChange={(e) => setNewPartner({ ...newPartner, description: e.target.value })} 
                    placeholder="Enter partner description" 
                    className="auth-input" 
                    rows={3}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partner-status">Status</Label>
                  <Select 
                    value={newPartner.is_active ? 'active' : 'inactive'} 
                    onValueChange={(value) => setNewPartner({ ...newPartner, is_active: value === 'active' })}
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
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClosePartnerModal}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting || !newPartner.name.trim()} 
                  className="hover:opacity-90" 
                  style={{ backgroundColor: '#3e8692', color: 'white' }}
                >
                  {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : (isEditMode ? 'Save Partner' : 'Create Partner')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Partner</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-gray-600">
                Are you sure you want to delete this partner? This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
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
      </div>
    </ProtectedRoute>
  );
} 