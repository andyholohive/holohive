'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus, Search, Edit, Trash2, UserPlus,
  DollarSign, ArrowRight, MoreHorizontal
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  CRMService,
  CRMOpportunity,
  CreateOpportunityData,
  OpportunityStage
} from '@/lib/crmService';

export default function PipelinePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [opportunities, setOpportunities] = useState<CRMOpportunity[]>([]);
  const [isNewOpportunityOpen, setIsNewOpportunityOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<CRMOpportunity | null>(null);
  const [opportunityForm, setOpportunityForm] = useState<CreateOpportunityData>({
    name: '',
    stage: 'new',
    source: undefined,
  });

  const leadStages: OpportunityStage[] = ['new', 'contacted', 'qualified', 'unqualified', 'nurture'];
  const dealStages: OpportunityStage[] = ['proposal', 'contract', 'closed_won', 'closed_lost'];

  const stageLabels: Record<OpportunityStage, string> = {
    new: 'New',
    contacted: 'Contacted',
    qualified: 'Qualified',
    unqualified: 'Unqualified',
    nurture: 'Nurture',
    proposal: 'Proposal',
    contract: 'Contract',
    closed_won: 'Won',
    closed_lost: 'Lost'
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const opps = await CRMService.getAllOpportunities();
      setOpportunities(opps);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
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
      fetchOpportunities();
    } catch (error) {
      console.error('Error saving opportunity:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOpportunity = (opp: CRMOpportunity) => {
    setEditingOpportunity(opp);
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
      notes: opp.notes || undefined
    });
    setIsNewOpportunityOpen(true);
  };

  const handleDeleteOpportunity = async (id: string) => {
    if (!confirm('Are you sure you want to delete this opportunity?')) return;
    try {
      await CRMService.deleteOpportunity(id);
      fetchOpportunities();
    } catch (error) {
      console.error('Error deleting opportunity:', error);
    }
  };

  const handleMoveStage = async (opp: CRMOpportunity, newStage: OpportunityStage) => {
    try {
      await CRMService.updateOpportunity(opp.id, { stage: newStage });
      fetchOpportunities();
    } catch (error) {
      console.error('Error moving stage:', error);
    }
  };

  const filteredOpportunities = opportunities.filter(o =>
    o.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getOpportunitiesByStage = (stage: OpportunityStage) =>
    filteredOpportunities.filter(o => o.stage === stage);

  const totalLeads = leadStages.reduce((sum, stage) => sum + getOpportunitiesByStage(stage).length, 0);
  const totalDeals = dealStages.reduce((sum, stage) => sum + getOpportunitiesByStage(stage).length, 0);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
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
          <h2 className="text-2xl font-bold text-gray-900">Pipeline</h2>
          <p className="text-gray-600">Manage your leads and deals</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search opportunities..."
              className="pl-10 auth-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setEditingOpportunity(null);
              setOpportunityForm({ name: '', stage: 'new' });
              setIsNewOpportunityOpen(true);
            }}
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Opportunity
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold">{totalLeads}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <UserPlus className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Deals</p>
                <p className="text-2xl font-bold">{totalDeals}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalDealValue)}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Leads Pipeline */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads</h3>
        <div className="grid grid-cols-5 gap-4">
          {leadStages.map((stage) => (
            <div key={stage} className="bg-gray-50 rounded-lg p-4 min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-700">{stageLabels[stage]}</h4>
                <Badge variant="secondary" className="text-xs">
                  {getOpportunitiesByStage(stage).length}
                </Badge>
              </div>
              <div className="space-y-3">
                {getOpportunitiesByStage(stage).map((opp) => (
                  <Card key={opp.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{opp.name}</p>
                          {opp.source && (
                            <p className="text-xs text-gray-500 mt-1">{opp.source}</p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditOpportunity(opp)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {stage !== 'qualified' && (
                              <DropdownMenuItem onClick={() => handleMoveStage(opp, 'qualified')}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Move to Qualified
                              </DropdownMenuItem>
                            )}
                            {stage === 'qualified' && (
                              <DropdownMenuItem onClick={() => handleMoveStage(opp, 'proposal')}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Convert to Deal
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteOpportunity(opp.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deals Pipeline */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Deals</h3>
        <div className="grid grid-cols-4 gap-4">
          {dealStages.map((stage) => (
            <div key={stage} className="bg-gray-50 rounded-lg p-4 min-h-[300px]">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-700">{stageLabels[stage]}</h4>
                <Badge variant="secondary" className="text-xs">
                  {getOpportunitiesByStage(stage).length}
                </Badge>
              </div>
              <div className="space-y-3">
                {getOpportunitiesByStage(stage).map((opp) => (
                  <Card key={opp.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{opp.name}</p>
                          {opp.deal_value && (
                            <p className="text-sm font-semibold text-green-600 mt-1">
                              {formatCurrency(opp.deal_value)}
                            </p>
                          )}
                          {opp.account_type && (
                            <Badge variant="outline" className="text-xs mt-2">
                              {opp.account_type}
                            </Badge>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditOpportunity(opp)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {stage === 'proposal' && (
                              <DropdownMenuItem onClick={() => handleMoveStage(opp, 'contract')}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Move to Contract
                              </DropdownMenuItem>
                            )}
                            {stage === 'contract' && (
                              <>
                                <DropdownMenuItem onClick={() => handleMoveStage(opp, 'closed_won')}>
                                  <ArrowRight className="h-4 w-4 mr-2" />
                                  Mark as Won
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMoveStage(opp, 'closed_lost')}>
                                  <ArrowRight className="h-4 w-4 mr-2" />
                                  Mark as Lost
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => handleDeleteOpportunity(opp.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

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
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="unqualified">Unqualified</SelectItem>
                      <SelectItem value="nurture">Nurture</SelectItem>
                      <SelectItem value="proposal">Proposal</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="closed_won">Closed Won</SelectItem>
                      <SelectItem value="closed_lost">Closed Lost</SelectItem>
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
              {dealStages.includes(opportunityForm.stage as OpportunityStage) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="opp-value">Deal Value</Label>
                    <Input
                      id="opp-value"
                      type="number"
                      value={opportunityForm.deal_value || ''}
                      onChange={(e) => setOpportunityForm({ ...opportunityForm, deal_value: parseFloat(e.target.value) || undefined })}
                      placeholder="0"
                      className="auth-input"
                    />
                  </div>
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
                <Label htmlFor="opp-gc">Group Chat</Label>
                <Input
                  id="opp-gc"
                  value={opportunityForm.gc || ''}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, gc: e.target.value })}
                  placeholder="Group chat link"
                  className="auth-input"
                />
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
    </div>
  );
}
