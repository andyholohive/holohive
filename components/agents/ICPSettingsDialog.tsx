'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, X, Plus, Settings, RefreshCw } from 'lucide-react';

interface ICPSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onScoresUpdated?: () => void;
}

export default function ICPSettingsDialog({ open, onClose, onScoresUpdated }: ICPSettingsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);

  // Settings state
  const [tier1, setTier1] = useState<string[]>([]);
  const [tier2, setTier2] = useState<string[]>([]);
  const [tier3, setTier3] = useState<string[]>([]);
  const [skipCats, setSkipCats] = useState<string[]>([]);
  const [mcMin, setMcMin] = useState('');
  const [mcMax, setMcMax] = useState('');
  const [disqualifyKeywords, setDisqualifyKeywords] = useState<string[]>([]);

  // Input field for adding keywords
  const [newKeyword, setNewKeyword] = useState('');

  useEffect(() => {
    if (open) fetchSettings();
  }, [open]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, prospectsRes] = await Promise.all([
        fetch('/api/prospects/settings'),
        fetch('/api/prospects?page=1&pageSize=1&status=all'),
      ]);
      const prospectsData = await prospectsRes.json();
      if (prospectsData.categories) setAvailableCategories(prospectsData.categories);

      // Auto-assign categories: memes/nft → tier 3, everything else → tier 1
      const TIER3_KEYWORDS = ['meme', 'nft'];
      const allCats = prospectsData.categories || [];

      const data = await settingsRes.json();
      if (data.settings && data.settings.category_tiers) {
        const tiers = data.settings.category_tiers;
        // Use saved settings if they exist and have items
        const hasAny = (tiers.tier1?.length || 0) + (tiers.tier2?.length || 0) + (tiers.tier3?.length || 0) + (tiers.skip?.length || 0);
        if (hasAny > 0) {
          setTier1(tiers.tier1 || []);
          setTier2(tiers.tier2 || []);
          setTier3(tiers.tier3 || []);
          setSkipCats(tiers.skip || []);
        } else {
          // Default: memes/nft → tier 3, rest → tier 1
          const t3 = allCats.filter((c: string) => TIER3_KEYWORDS.some(kw => c.toLowerCase().includes(kw)));
          const t1 = allCats.filter((c: string) => !TIER3_KEYWORDS.some(kw => c.toLowerCase().includes(kw)));
          setTier1(t1);
          setTier3(t3);
        }
      } else {
        // No settings table yet — use defaults
        const t3 = allCats.filter((c: string) => TIER3_KEYWORDS.some(kw => c.toLowerCase().includes(kw)));
        const t1 = allCats.filter((c: string) => !TIER3_KEYWORDS.some(kw => c.toLowerCase().includes(kw)));
        setTier1(t1);
        setTier3(t3);
      }

      if (data.settings) {

        const mcRange = data.settings.market_cap_range || {};
        setMcMin(mcRange.min ? String(mcRange.min) : '');
        setMcMax(mcRange.max ? String(mcRange.max) : '');

        setDisqualifyKeywords(data.settings.disqualify_keywords || []);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        fetch('/api/prospects/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'category_tiers',
            value: { tier1, tier2, tier3, skip: skipCats },
          }),
        }),
        fetch('/api/prospects/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'market_cap_range',
            value: { min: parseFloat(mcMin) || 0, max: parseFloat(mcMax) || 0 },
          }),
        }),
        fetch('/api/prospects/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: 'disqualify_keywords',
            value: disqualifyKeywords,
          }),
        }),
      ]);
      toast({ title: 'Saved', description: 'ICP scoring settings updated' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRescore = async () => {
    setRescoring(true);
    try {
      // Save first, then rescore
      await handleSave();
      const res = await fetch('/api/prospects/score', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Scores Updated', description: `Rescored ${data.scored} prospects` });
        onScoresUpdated?.();
      } else {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to rescore', variant: 'destructive' });
    } finally {
      setRescoring(false);
    }
  };

  // Categories already assigned to any tier
  const assignedCategories = new Set([...tier1, ...tier2, ...tier3, ...skipCats]);

  // Unassigned categories available for selection
  const getUnassignedFor = (currentTier: string[]) => {
    const otherAssigned = new Set([...tier1, ...tier2, ...tier3, ...skipCats].filter(c => !currentTier.includes(c)));
    return availableCategories.filter(c => !otherAssigned.has(c));
  };

  const removeFromList = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.filter(v => v !== value));
  };

  const TagList = ({ items, setItems, color }: { items: string[]; setItems: (v: string[]) => void; color: string }) => (
    <div className="flex flex-wrap gap-1.5 min-h-[28px]">
      {items.map(item => (
        <span key={item} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color}`}>
          {item}
          <button onClick={() => removeFromList(items, setItems, item)} className="hover:opacity-70">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {items.length === 0 && <span className="text-xs text-gray-400 italic">None selected</span>}
    </div>
  );

  const CategorySelect = ({ list, setList, placeholder }: { list: string[]; setList: (v: string[]) => void; placeholder: string }) => {
    const options = getUnassignedFor(list).filter(c => !list.includes(c));
    if (options.length === 0) return null;
    return (
      <div className="mt-1.5">
        <Select value="" onValueChange={v => { if (v && !list.includes(v)) setList([...list, v]); }}>
          <SelectTrigger className="auth-input h-8 text-xs [&>span]:truncate-none [&>span]:line-clamp-none">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" style={{ color: '#3e8692' }} />
            ICP Scoring Settings
          </DialogTitle>
          <DialogDescription>
            Configure how prospects are scored to surface the best fits first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-4">
          {/* Category Tiers */}
          <div className="grid gap-3">
            <Label className="text-sm font-semibold">Category Priority</Label>

            <div className="grid gap-2.5 pl-1">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Tier 1</span>
                  <span className="text-[10px] text-gray-400">25 points — highest priority</span>
                </div>
                <TagList items={tier1} setItems={setTier1} color="bg-emerald-50 text-emerald-700" />
                <CategorySelect list={tier1} setList={setTier1} placeholder="+ Add category to Tier 1" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Tier 2</span>
                  <span className="text-[10px] text-gray-400">15 points — good fit</span>
                </div>
                <TagList items={tier2} setItems={setTier2} color="bg-blue-50 text-blue-700" />
                <CategorySelect list={tier2} setList={setTier2} placeholder="+ Add category to Tier 2" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">Tier 3</span>
                  <span className="text-[10px] text-gray-400">5 points — okay</span>
                </div>
                <TagList items={tier3} setItems={setTier3} color="bg-amber-50 text-amber-700" />
                <CategorySelect list={tier3} setList={setTier3} placeholder="+ Add category to Tier 3" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded">Skip</span>
                  <span className="text-[10px] text-gray-400">0 points — not a fit</span>
                </div>
                <TagList items={skipCats} setItems={setSkipCats} color="bg-red-50 text-red-700" />
                <CategorySelect list={skipCats} setList={setSkipCats} placeholder="+ Add category to Skip" />
              </div>
            </div>

            {availableCategories.length > 0 && assignedCategories.size < availableCategories.length && (
              <p className="text-[10px] text-gray-400 pl-1">
                {availableCategories.length - assignedCategories.size} categories not yet assigned to a tier
              </p>
            )}
          </div>

          {/* Market Cap Range */}
          <div className="grid gap-2">
            <Label className="text-sm font-semibold">Market Cap Sweet Spot <span className="font-normal text-gray-400">(25 points if in range)</span></Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 font-normal">Minimum ($)</Label>
                <Input
                  type="number"
                  value={mcMin}
                  onChange={e => setMcMin(e.target.value)}
                  placeholder="e.g. 10000000"
                  className="auth-input"
                />
                {mcMin && <span className="text-[10px] text-gray-400">${Number(mcMin).toLocaleString()}</span>}
              </div>
              <div>
                <Label className="text-xs text-gray-500 font-normal">Maximum ($)</Label>
                <Input
                  type="number"
                  value={mcMax}
                  onChange={e => setMcMax(e.target.value)}
                  placeholder="e.g. 500000000"
                  className="auth-input"
                />
                {mcMax && <span className="text-[10px] text-gray-400">${Number(mcMax).toLocaleString()}</span>}
              </div>
            </div>
          </div>

          {/* Disqualify Keywords */}
          <div className="grid gap-2">
            <Label className="text-sm font-semibold">Auto-Disqualify Keywords <span className="font-normal text-gray-400">(score = 0 if name contains any)</span></Label>
            <TagList items={disqualifyKeywords} setItems={setDisqualifyKeywords} color="bg-red-50 text-red-600" />
            <div className="flex gap-1.5 mt-1.5">
              <Input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const trimmed = newKeyword.trim();
                    if (trimmed && !disqualifyKeywords.includes(trimmed)) {
                      setDisqualifyKeywords([...disqualifyKeywords, trimmed]);
                      setNewKeyword('');
                    }
                  }
                }}
                placeholder="e.g. Wrapped, USD, Bridge"
                className="auth-input h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                onClick={() => {
                  const trimmed = newKeyword.trim();
                  if (trimmed && !disqualifyKeywords.includes(trimmed)) {
                    setDisqualifyKeywords([...disqualifyKeywords, trimmed]);
                    setNewKeyword('');
                  }
                }}
                disabled={!newKeyword.trim()}
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
            <div className="font-semibold text-gray-700 mb-1.5">Score Breakdown (max 100)</div>
            <div className="grid grid-cols-2 gap-1">
              <span>Category match: 5-25 pts</span>
              <span>Market cap in range: 25 pts</span>
              <span>Has website: 15 pts</span>
              <span>Has Twitter: 15 pts</span>
              <span>Has Telegram: 10 pts</span>
              <span>Base: 10 pts</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline"
            onClick={handleRescore}
            disabled={rescoring || saving}
          >
            {rescoring ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Save & Rescore All
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#3e8692', color: 'white' }}
            className="hover:opacity-90"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
