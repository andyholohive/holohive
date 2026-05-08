'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, RotateCcw, Trash2, Building2, Mail, MapPin, Calendar, List, Megaphone, ClipboardList, Users, AlertTriangle, Crown, Globe } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

// Local row types. Field nullability mirrors the Supabase schema
// (database.types.ts) — `archived_at`, `created_at`, `is_active`, etc.
// are `| null` in the DB even though our `.not('archived_at', 'is', null)`
// filter guarantees archived_at is non-null at runtime. Keeping them
// nullable in the type matches the source-of-truth Supabase types and
// satisfies the type-checker without per-call-site casts. Consumers
// (ArchivedItemCard) already null-guard archivedAt.
interface ArchivedClient {
  id: string;
  name: string;
  email: string;
  location: string | null;
  is_active: boolean | null;
  archived_at: string | null;
  created_at: string | null;
}

interface ArchivedList {
  id: string;
  name: string;
  status: string | null;
  archived_at: string | null;
  created_at: string | null;
  kol_count?: number;
}

interface ArchivedCampaign {
  id: string;
  name: string;
  status: string | null;
  total_budget: number | null;
  client_id: string | null;
  client_name?: string;
  archived_at: string | null;
  created_at: string | null;
}

interface ArchivedForm {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  archived_at: string | null;
  created_at: string | null;
  response_count?: number;
}

interface ArchivedKOL {
  id: string;
  name: string;
  link: string | null;
  platform: string[] | null;
  followers: number | null;
  region: string | null;
  tier: string | null;
  archived_at: string | null;
  created_at: string | null;
}

export default function ArchivePage() {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('clients');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [archivedClients, setArchivedClients] = useState<ArchivedClient[]>([]);
  const [archivedLists, setArchivedLists] = useState<ArchivedList[]>([]);
  const [archivedCampaigns, setArchivedCampaigns] = useState<ArchivedCampaign[]>([]);
  const [archivedForms, setArchivedForms] = useState<ArchivedForm[]>([]);
  const [archivedKOLs, setArchivedKOLs] = useState<ArchivedKOL[]>([]);

  // Dialog states
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{ type: string; id: string; name: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchArchivedItems();
    }
  }, [user?.id]);

  const fetchArchivedItems = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fan out all 5 archive queries in parallel — they're entirely
      // independent (different tables) so this is one round-trip
      // instead of five sequential awaits. Promise.all rejects on the
      // first failure; the catch block below treats any single failure
      // as a full-page failure (matches prior behavior).
      const [clientsRes, listsRes, campaignsRes, formsRes, kolsRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('lists')
          .select('*, list_kols(count)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('campaigns')
          .select('*, clients(name)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('forms')
          .select('*, form_responses(count)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('master_kols')
          .select('*')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
      ]);

      // Throw the first error encountered so the catch block fires
      // with a meaningful message instead of silently rendering empty
      // state for one tab.
      const firstError = clientsRes.error || listsRes.error || campaignsRes.error || formsRes.error || kolsRes.error;
      if (firstError) throw firstError;

      setArchivedClients(clientsRes.data || []);
      setArchivedLists((listsRes.data || []).map(list => ({
        ...list,
        kol_count: list.list_kols?.[0]?.count || 0,
      })));
      setArchivedCampaigns((campaignsRes.data || []).map(campaign => ({
        ...campaign,
        client_name: campaign.clients?.name,
      })));
      setArchivedForms((formsRes.data || []).map(form => ({
        ...form,
        response_count: form.form_responses?.[0]?.count || 0,
      })));
      setArchivedKOLs(kolsRes.data || []);
    } catch (err) {
      console.error('Error fetching archived items:', err);
      setError('Failed to load archived items');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (type: string, id: string, name: string) => {
    setSelectedItem({ type, id, name });
    setIsRestoreDialogOpen(true);
  };

  const handlePermanentDelete = (type: string, id: string, name: string) => {
    setSelectedItem({ type, id, name });
    setIsDeleteDialogOpen(true);
  };

  const confirmRestore = async () => {
    if (!selectedItem) return;
    setIsProcessing(true);

    try {
      let tableName: string;
      if (selectedItem.type === 'list') {
        tableName = 'lists';
      } else if (selectedItem.type === 'kol') {
        tableName = 'master_kols';
      } else {
        tableName = `${selectedItem.type}s`;
      }

      const { error } = await supabase
        .from(tableName)
        .update({ archived_at: null })
        .eq('id', selectedItem.id);

      if (error) throw error;

      await fetchArchivedItems();
      setIsRestoreDialogOpen(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Error restoring item:', err);
      setError('Failed to restore item');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!selectedItem) return;
    setIsProcessing(true);

    try {
      let tableName: string;
      if (selectedItem.type === 'list') {
        tableName = 'lists';
      } else if (selectedItem.type === 'kol') {
        tableName = 'master_kols';
      } else {
        tableName = `${selectedItem.type}s`;
      }

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', selectedItem.id);

      if (error) throw error;

      await fetchArchivedItems();
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Error permanently deleting item:', err);
      setError('Failed to permanently delete item');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter items based on search term
  const filteredClients = archivedClients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLists = archivedLists.filter(list =>
    list.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCampaigns = archivedCampaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (campaign.client_name && campaign.client_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredForms = archivedForms.filter(form =>
    form.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredKOLs = archivedKOLs.filter(kol =>
    kol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (kol.region && kol.region.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getCounts = () => ({
    clients: archivedClients.length,
    lists: archivedLists.length,
    campaigns: archivedCampaigns.length,
    forms: archivedForms.length,
    kols: archivedKOLs.length
  });

  const counts = getCounts();

  const CardSkeleton = () => (
    <Card className="transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <Skeleton className="h-8 w-8 rounded-lg mr-2" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-full rounded" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Archive</h2>
          <p className="text-gray-600">Manage archived items - restore or permanently delete</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <CardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Archive</h2>
        <p className="text-gray-600">Manage archived items - restore or permanently delete</p>
      </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search archived items..."
              className="pl-10 focus-brand"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Clients
              {counts.clients > 0 && (
                <Badge variant="secondary" className="ml-1">{counts.clients}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="lists" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Lists
              {counts.lists > 0 && (
                <Badge variant="secondary" className="ml-1">{counts.lists}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Campaigns
              {counts.campaigns > 0 && (
                <Badge variant="secondary" className="ml-1">{counts.campaigns}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="forms" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Forms
              {counts.forms > 0 && (
                <Badge variant="secondary" className="ml-1">{counts.forms}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="kols" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              KOLs
              {counts.kols > 0 && (
                <Badge variant="secondary" className="ml-1">{counts.kols}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Clients Tab */}
          <TabsContent value="clients">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState icon={Building2} title="No archived clients found." />
                </div>
              ) : (
                filteredClients.map((client) => (
                  <ArchivedItemCard
                    key={client.id}
                    icon={Building2}
                    name={client.name}
                    archivedAt={client.archived_at}
                    formatDate={formatDate}
                    onRestore={() => handleRestore('client', client.id, client.name)}
                    onDelete={() => handlePermanentDelete('client', client.id, client.name)}
                    meta={
                      <>
                        <ArchivedMetaRow icon={Mail}>{client.email}</ArchivedMetaRow>
                        {client.location && <ArchivedMetaRow icon={MapPin}>{client.location}</ArchivedMetaRow>}
                      </>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Lists Tab */}
          <TabsContent value="lists">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLists.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState icon={List} title="No archived lists found." />
                </div>
              ) : (
                filteredLists.map((list) => (
                  <ArchivedItemCard
                    key={list.id}
                    icon={List}
                    name={list.name}
                    archivedAt={list.archived_at}
                    formatDate={formatDate}
                    onRestore={() => handleRestore('list', list.id, list.name)}
                    onDelete={() => handlePermanentDelete('list', list.id, list.name)}
                    extraBadges={list.status && (
                      <Badge variant="outline" className="text-xs capitalize">{list.status}</Badge>
                    )}
                    meta={
                      <ArchivedMetaRow icon={Users}>{list.kol_count} KOLs</ArchivedMetaRow>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCampaigns.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState icon={Megaphone} title="No archived campaigns found." />
                </div>
              ) : (
                filteredCampaigns.map((campaign) => (
                  <ArchivedItemCard
                    key={campaign.id}
                    icon={Megaphone}
                    name={campaign.name}
                    archivedAt={campaign.archived_at}
                    formatDate={formatDate}
                    onRestore={() => handleRestore('campaign', campaign.id, campaign.name)}
                    onDelete={() => handlePermanentDelete('campaign', campaign.id, campaign.name)}
                    extraBadges={
                      <Badge variant="outline" className="text-xs capitalize">{campaign.status}</Badge>
                    }
                    meta={
                      <>
                        {campaign.client_name && (
                          <ArchivedMetaRow icon={Building2}>{campaign.client_name}</ArchivedMetaRow>
                        )}
                        {/* Budget row uses $ prefix instead of an icon — render
                            inline rather than via ArchivedMetaRow so the layout
                            matches the other money-style rows in the app. */}
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="text-gray-400 mr-2">$</span>
                          <span>{campaign.total_budget?.toLocaleString()}</span>
                        </div>
                      </>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* Forms Tab */}
          <TabsContent value="forms">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredForms.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState icon={ClipboardList} title="No archived forms found." />
                </div>
              ) : (
                filteredForms.map((form) => (
                  <ArchivedItemCard
                    key={form.id}
                    icon={ClipboardList}
                    name={form.name}
                    archivedAt={form.archived_at}
                    formatDate={formatDate}
                    onRestore={() => handleRestore('form', form.id, form.name)}
                    onDelete={() => handlePermanentDelete('form', form.id, form.name)}
                    extraBadges={
                      <Badge variant="outline" className="text-xs capitalize">{form.status}</Badge>
                    }
                    description={form.description}
                    meta={
                      <ArchivedMetaRow icon={Users}>{form.response_count} responses</ArchivedMetaRow>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* KOLs Tab */}
          <TabsContent value="kols">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredKOLs.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState icon={Crown} title="No archived KOLs found." />
                </div>
              ) : (
                filteredKOLs.map((kol) => (
                  <ArchivedItemCard
                    key={kol.id}
                    icon={Crown}
                    name={kol.name}
                    archivedAt={kol.archived_at}
                    formatDate={formatDate}
                    onRestore={() => handleRestore('kol', kol.id, kol.name)}
                    onDelete={() => handlePermanentDelete('kol', kol.id, kol.name)}
                    extraBadges={
                      <>
                        {kol.tier && <Badge variant="outline" className="text-xs">{kol.tier}</Badge>}
                        {kol.region && <Badge variant="outline" className="text-xs">{kol.region}</Badge>}
                      </>
                    }
                    meta={
                      <>
                        {kol.platform && kol.platform.length > 0 && (
                          <ArchivedMetaRow icon={Globe}>{kol.platform.join(', ')}</ArchivedMetaRow>
                        )}
                        {kol.followers && (
                          <ArchivedMetaRow icon={Users}>{kol.followers.toLocaleString()} followers</ArchivedMetaRow>
                        )}
                      </>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Restore Confirmation Dialog */}
        <Dialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Restore {selectedItem?.type}</DialogTitle>
              <DialogDescription>
                Are you sure you want to restore <span className="font-semibold">{selectedItem?.name}</span>?
                It will be moved back to its original location.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRestoreDialogOpen(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                onClick={confirmRestore}
                disabled={isProcessing}
                className="hover:opacity-90"
                style={{ backgroundColor: '#3e8692', color: 'white' }}
              >
                {isProcessing ? 'Restoring...' : 'Restore'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Permanent Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Permanently Delete {selectedItem?.type}
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete <span className="font-semibold">{selectedItem?.name}</span>?
                This action cannot be undone and all associated data will be lost forever.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmPermanentDelete}
                disabled={isProcessing}
              >
                {isProcessing ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// ArchivedItemCard — shared structural shell for the 5 archive tabs.
//
// Extracted 2026-05-06 (audit): the 5 tabs (clients/lists/campaigns/
// forms/kols) each had near-identical 50-line Card render blocks.
// Variation between them is small and well-bounded:
//   - icon + name (always)
//   - "Archived" badge (always) + 0+ extra category badges
//   - vertical info rows (passed as `meta` slot — different fields per type)
//   - optional description (forms only)
//   - Restore + Delete buttons (always, same shape)
//
// `meta` accepts ReactNode so callers can pass any combination of
// `<ArchivedMetaRow>` instances. Keeps each tab's call site readable
// while collapsing ~250 lines of duplicated chrome.
// ────────────────────────────────────────────────────────────────────

type ArchivedItemCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  archivedAt: string | null;
  formatDate: (dateString: string) => string;
  /** Optional non-"Archived" badges shown to the right of it. */
  extraBadges?: React.ReactNode;
  /** Optional one-line description (line-clamped) — used by Forms. */
  description?: string | null;
  /** Vertical info rows under the badges. Pass `<ArchivedMetaRow>`s. */
  meta?: React.ReactNode;
  onRestore: () => void;
  onDelete: () => void;
};

function ArchivedItemCard({
  icon: Icon,
  name,
  archivedAt,
  formatDate,
  extraBadges,
  description,
  meta,
  onRestore,
  onDelete,
}: ArchivedItemCardProps) {
  return (
    <Card className="transition-shadow">
      <CardHeader className="pb-4">
        <div className="mb-3">
          <div className="flex items-center text-lg font-semibold text-gray-600 mb-2">
            <div className="bg-gray-100 p-1.5 rounded-lg mr-2">
              <Icon className="h-5 w-5 text-gray-600" />
            </div>
            {name}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">
              Archived
            </Badge>
            {extraBadges}
          </div>
        </div>
        <div className="space-y-2">
          {description && (
            <p className="text-sm text-gray-600 line-clamp-2">{description}</p>
          )}
          {meta}
          {archivedAt && (
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="h-4 w-4 mr-2 text-gray-400" />
              <span>Archived: {formatDate(archivedAt)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 border-t border-gray-100">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onRestore}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restore
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Single info row inside an ArchivedItemCard. Icon + label/value. */
function ArchivedMetaRow({
  icon: Icon,
  children,
  /** Use 'value' when the row is a metric/value line; 'meta' for soft labels. */
  variant = 'value',
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  variant?: 'value' | 'meta';
}) {
  return (
    <div className={`flex items-center text-sm ${variant === 'value' ? 'text-gray-600' : 'text-gray-500'}`}>
      <Icon className="h-4 w-4 mr-2 text-gray-400" />
      <span>{children}</span>
    </div>
  );
}
