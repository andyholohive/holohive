'use client';

/**
 * TemplatesTab — the Templates tab body inside the main sales-pipeline
 * tab strip. Manages stage-specific DM templates that the rep can
 * pick from inside the ActivityLogDialog.
 *
 * Layout:
 *   1. Stage-filter pill row (`all` + each stage)
 *   2. Tag-filter pill row (rendered only when ≥1 tag exists across
 *      the filtered set)
 *   3. Card grid — 1/2/3-col responsive. Each card shows name +
 *      stage badge + sub-type badge + tag chips + attachment count +
 *      content preview (line-clamp-4) + variable chips.
 *   4. Create / Edit Template dialog (inline) — name, stage,
 *      sub-type (auto-defaults based on stage), tags (Enter to add),
 *      content, image attachments (uploaded to Supabase Storage's
 *      `crm-attachments` bucket).
 *   5. Preview Template dialog (inline) — read-only render of the
 *      same fields + Copy button.
 *
 * Extracted from `app/crm/sales-pipeline/page.tsx` (was the inline
 * Templates `TabsContent` IIFE, ~485 LOC) on 2026-06-02 as the
 * first Phase 2 tab extraction. Consumes ~13 fields from
 * `SalesPipelineContext` and calls `SalesPipelineService.{create,
 * update,delete}Template` directly for CRUD + `supabase.storage`
 * directly for attachment uploads.
 *
 * v11 note: gray-* tokens preserved during the structural split.
 * The filter-pill row + create dialog body inherit some red/teal/
 * blue tokens (template variable chips, tag chips, stage badges)
 * which the v11 pass at the end of Phase 4 will reconsider.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Copy,
  Edit,
  Eye,
  FileText,
  Image,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useSalesPipeline } from '@/contexts/SalesPipelineContext';
import {
  SalesPipelineService,
  STAGE_LABELS,
  STAGE_COLORS,
  type SalesDmTemplate,
} from '@/lib/salesPipelineService';
import { supabase } from '@/lib/supabase';

const TEMPLATE_STAGES = [
  { value: 'all',            label: 'All' },
  { value: 'cold_dm',        label: 'Cold DM' },
  { value: 'warm',           label: 'Warm' },
  { value: 'tg_intro',       label: 'TG Intro' },
  { value: 'booked',         label: 'Booked' },
  { value: 'discovery_done', label: 'Discovery Done' },
  { value: 'proposal_call',  label: 'Proposal Call' },
  { value: 'v2_contract',    label: 'Contract' },
  { value: 'bump',           label: 'Bumps' },
];

const SUB_TYPE_LABELS: Record<string, string> = {
  general:   'General',
  initial:   'Initial',
  bump_1:    'Bump 1',
  bump_2:    'Bump 2',
  bump_3:    'Bump 3',
  follow_up: 'Follow-up',
};

const getSubTypeLabel = (subType: string) => SUB_TYPE_LABELS[subType] || subType;

const getSubTypeOptions = (stage: string) =>
  stage === 'bump'
    ? ['bump_1', 'bump_2', 'bump_3']
    : ['general', 'initial', 'follow_up'];

const getStageLabelForTemplate = (stage: string) => {
  if (stage === 'bump') return 'Bump';
  return (STAGE_LABELS as Record<string, string>)[stage] || stage;
};

const getStageColorForTemplate = (stage: string) => {
  if (stage === 'bump') return { bg: 'bg-pink-50', text: 'text-pink-700' };
  const colors = (STAGE_COLORS as Record<string, { bg: string; text: string }>)[stage];
  return colors || { bg: 'bg-cream-50', text: 'text-ink-warm-700' };
};

export function TemplatesTab() {
  const {
    templates,
    setTemplates,
    templateStageFilter,
    setTemplateStageFilter,
    templateTagFilter,
    setTemplateTagFilter,
    isTemplateDialogOpen,
    setIsTemplateDialogOpen,
    editingTemplate,
    setEditingTemplate,
    templateForm,
    setTemplateForm,
    isTemplateSubmitting,
    setIsTemplateSubmitting,
    previewTemplate,
    setPreviewTemplate,
    toast,
  } = useSalesPipeline();

  const allTags = Array.from(new Set(templates.flatMap(t => t.tags || [])));

  const filteredTemplates = templates.filter(t => {
    if (templateStageFilter !== 'all' && t.stage !== templateStageFilter) return false;
    if (templateTagFilter !== 'all' && !(t.tags || []).includes(templateTagFilter)) return false;
    return true;
  });

  const handleCopy = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const handleCreateTemplate = async () => {
    setIsTemplateSubmitting(true);
    try {
      const created = await SalesPipelineService.createTemplate(templateForm);
      setTemplates(prev => [...prev, created]);
      setIsTemplateDialogOpen(false);
      setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
    } catch (err) {
      console.error('Error creating template:', err);
    } finally {
      setIsTemplateSubmitting(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    setIsTemplateSubmitting(true);
    try {
      const updated = await SalesPipelineService.updateTemplate(editingTemplate.id, templateForm);
      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      setEditingTemplate(null);
      setIsTemplateDialogOpen(false);
      setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
    } catch (err) {
      console.error('Error updating template:', err);
    } finally {
      setIsTemplateSubmitting(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await SalesPipelineService.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting template:', err);
    }
  };

  const openEditDialog = (t: SalesDmTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({
      name: t.name,
      stage: t.stage,
      sub_type: t.sub_type,
      content: t.content,
      variables: t.variables,
      tags: t.tags || [],
      attachments: t.attachments || [],
    });
    setIsTemplateDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] });
    setIsTemplateDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Stage filter — v11 segmented control. Was solid-brand pills
          which competed visually with the brand CTA in the page
          header; the cream base + white-tile active reads as a
          "scoped filter" instead of "a row of brand actions". */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200 flex-wrap">
          {TEMPLATE_STAGES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => setTemplateStageFilter(s.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                templateStageFilter === s.value
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="brand" size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1" />
          New Template
        </Button>
      </div>

      {/* Tag filter — same v11 segmented control pattern, smaller
          padding to read as a secondary filter row. */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-ink-warm-500 font-medium">Tags:</span>
          <div className="inline-flex bg-cream-100 p-1 rounded-md border border-cream-200 flex-wrap">
            <button
              type="button"
              onClick={() => setTemplateTagFilter('all')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                templateTagFilter === 'all'
                  ? 'bg-white shadow-card text-brand'
                  : 'text-ink-warm-500 hover:bg-cream-200'
              }`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => setTemplateTagFilter(tag)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  templateTagFilter === tag
                    ? 'bg-white shadow-card text-brand'
                    : 'text-ink-warm-500 hover:bg-cream-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Template cards grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-ink-warm-500">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No templates found{templateStageFilter !== 'all' ? ' for this stage' : ''}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(t => {
            const stageColor = getStageColorForTemplate(t.stage);
            return (
              <Card key={t.id} className="overflow-hidden cursor-pointer" onClick={() => setPreviewTemplate(t)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h4 className="font-semibold text-sm text-ink-warm-900 line-clamp-1">{t.name}</h4>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setPreviewTemplate(t)}
                        title="Preview"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleCopy(t.content)}
                        title="Copy to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEditDialog(t)}
                        title="Edit"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-500"
                        onClick={() => handleDeleteTemplate(t.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${stageColor.bg} ${stageColor.text} text-xs border-0`}>
                      {getStageLabelForTemplate(t.stage)}
                    </Badge>
                    <Badge variant="outline" className="text-xs bg-white">
                      {getSubTypeLabel(t.sub_type)}
                    </Badge>
                    {(t.tags || []).map(tag => (
                      <Badge key={tag} className="text-[10px] bg-teal-50 text-teal-700 border-0">
                        {tag}
                      </Badge>
                    ))}
                    {(t.attachments || []).length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-ink-warm-500">
                        <Image className="h-3 w-3" />
                        {t.attachments.length}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-warm-700 line-clamp-4 whitespace-pre-wrap">{t.content}</p>
                  {t.variables && t.variables.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {t.variables.map(v => (
                        <span key={v} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                          [{v}]
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={(open) => {
        setIsTemplateDialogOpen(open);
        if (!open) { setEditingTemplate(null); setTemplateForm({ name: '', stage: 'cold_dm', sub_type: 'general', content: '', tags: [], attachments: [] }); }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update this sales DM template.' : 'Create a new stage-specific DM template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={templateForm.name}
                onChange={e => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Cold DM — Initial Outreach"
                className="focus-brand"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Stage</Label>
                <Select
                  value={templateForm.stage}
                  onValueChange={v => setTemplateForm(prev => ({
                    ...prev,
                    stage: v,
                    sub_type: v === 'bump' ? 'bump_1' : 'general',
                  }))}
                >
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold_dm">Cold DM</SelectItem>
                    <SelectItem value="warm">Warm</SelectItem>
                    <SelectItem value="tg_intro">TG Intro</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="discovery_done">Discovery Done</SelectItem>
                    <SelectItem value="proposal_call">Proposal Call</SelectItem>
                    <SelectItem value="v2_contract">Contract</SelectItem>
                    <SelectItem value="bump">Bump</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-type</Label>
                <Select
                  value={templateForm.sub_type || 'general'}
                  onValueChange={v => setTemplateForm(prev => ({ ...prev, sub_type: v }))}
                >
                  <SelectTrigger className="focus-brand"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getSubTypeOptions(templateForm.stage).map(opt => (
                      <SelectItem key={opt} value={opt}>{getSubTypeLabel(opt)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tags</Label>
              <div className="space-y-2">
                {(templateForm.tags || []).length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(templateForm.tags || []).map(tag => (
                      <Badge key={tag} className="text-xs bg-teal-50 text-teal-700 border-0 gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTemplateForm(prev => ({ ...prev, tags: (prev.tags || []).filter(t => t !== tag) }))}
                          className=""
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Type a tag and press Enter (e.g., Token Launch, DeFi)"
                  className="focus-brand"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !(templateForm.tags || []).includes(val)) {
                        setTemplateForm(prev => ({ ...prev, tags: [...(prev.tags || []), val] }));
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={templateForm.content}
                onChange={e => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Write your template here... Use [KOL_NAME], [PROJECT_NAME], etc. as placeholders."
                rows={6}
                className="focus-brand"
              />
            </div>
            <div>
              <Label>Attachments</Label>
              <div className="space-y-2">
                {(templateForm.attachments || []).length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(templateForm.attachments || []).map((att, idx) => (
                      <div key={idx} className="relative group">
                        <img src={att.url} alt={att.name} className="h-16 w-16 object-cover rounded border" />
                        <button
                          type="button"
                          onClick={() => setTemplateForm(prev => ({ ...prev, attachments: (prev.attachments || []).filter((_, i) => i !== idx) }))}
                          className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-[9px] text-ink-warm-500 truncate w-16 text-center mt-0.5">{att.name}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Input
                  type="file"
                  accept="image/*"
                  className="focus-brand"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const fileExt = file.name.split('.').pop();
                      const filePath = `templates/${Date.now()}.${fileExt}`;
                      const { error: uploadError } = await supabase.storage
                        .from('crm-attachments')
                        .upload(filePath, file, { cacheControl: '3600', upsert: false });
                      if (uploadError) throw uploadError;
                      const { data: { publicUrl } } = supabase.storage.from('crm-attachments').getPublicUrl(filePath);
                      setTemplateForm(prev => ({
                        ...prev,
                        attachments: [...(prev.attachments || []), { url: publicUrl, name: file.name }],
                      }));
                    } catch (err) {
                      console.error('Error uploading attachment:', err);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsTemplateDialogOpen(false)}>Cancel</Button>
            <Button variant="brand" onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate} disabled={isTemplateSubmitting || !templateForm.name || !templateForm.content} className="text-white">
              {isTemplateSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingTemplate ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Template Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => { if (!open) setPreviewTemplate(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>Template preview</DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${getStageColorForTemplate(previewTemplate.stage).bg} ${getStageColorForTemplate(previewTemplate.stage).text} text-xs border-0`}>
                  {getStageLabelForTemplate(previewTemplate.stage)}
                </Badge>
                <Badge variant="outline" className="text-xs bg-white">
                  {getSubTypeLabel(previewTemplate.sub_type)}
                </Badge>
                {(previewTemplate.tags || []).map(tag => (
                  <Badge key={tag} className="text-[10px] bg-teal-50 text-teal-700 border-0">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="bg-cream-50 rounded-lg p-4 text-sm text-ink-warm-700 whitespace-pre-wrap">
                {previewTemplate.content}
              </div>
              {previewTemplate.variables && previewTemplate.variables.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-ink-warm-500 font-medium">Variables:</span>
                  {previewTemplate.variables.map(v => (
                    <span key={v} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-mono">
                      [{v}]
                    </span>
                  ))}
                </div>
              )}
              {(previewTemplate.attachments || []).length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs text-ink-warm-500 font-medium">Attachments:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {previewTemplate.attachments.map((att, idx) => (
                      <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={att.url} alt={att.name} className="w-full rounded border transition-opacity" />
                        <p className="text-[10px] text-ink-warm-500 mt-1 truncate">{att.name}</p>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button
              variant="outline"
              onClick={() => {
                if (previewTemplate) {
                  navigator.clipboard.writeText(previewTemplate.content);
                  toast({ title: 'Copied to clipboard' });
                }
              }}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
