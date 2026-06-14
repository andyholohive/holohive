'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RequiredAsterisk } from '@/components/ui/required-asterisk';
import { ChangelogService, Changelog, CreateChangelogData } from '@/lib/changelogService';
import { formatDateTime } from '@/lib/dateFormat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Plus, Edit, Trash2, Eye, EyeOff, Sparkles, ShieldAlert } from 'lucide-react';

export default function ChangelogAdminPage() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [changelogs, setChangelogs] = useState<Changelog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingChangelog, setEditingChangelog] = useState<Changelog | null>(null);
  const [formData, setFormData] = useState<CreateChangelogData>({
    version: '',
    title: '',
    content: '',
    is_published: false
  });
  const [saving, setSaving] = useState(false);
  // Target for the v11 destructive-confirm dialog (replaces the
  // native `confirm()` that was here before).
  const [deletingTarget, setDeletingTarget] = useState<Changelog | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check if user is super_admin
  const isSuperAdmin = userProfile?.role === 'super_admin';

  useEffect(() => {
    if (userProfile && !isSuperAdmin) {
      // Redirect non-super_admins
      router.push('/');
      return;
    }
    if (userProfile && isSuperAdmin) {
      fetchChangelogs();
    }
  }, [userProfile, isSuperAdmin, router]);

  const fetchChangelogs = async () => {
    try {
      setLoading(true);
      const data = await ChangelogService.getAllChangelogs();
      setChangelogs(data);
    } catch (err) {
      setError('Failed to fetch changelogs');
      console.error('Error fetching changelogs:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingChangelog(null);
    setFormData({
      version: '',
      title: '',
      content: '',
      is_published: false
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (changelog: Changelog) => {
    setEditingChangelog(changelog);
    setFormData({
      version: changelog.version,
      title: changelog.title,
      content: changelog.content,
      is_published: changelog.is_published
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.version.trim() || !formData.title.trim() || !formData.content.trim()) {
        toast({
          title: 'Missing fields',
          description: 'Version, title, and content are required.',
          variant: 'destructive',
        });
        return;
      }

      setSaving(true);

      if (editingChangelog) {
        const wasPublished = editingChangelog.is_published;
        await ChangelogService.updateChangelog(editingChangelog.id, {
          version: formData.version,
          title: formData.title,
          content: formData.content,
          is_published: formData.is_published,
          published_at: formData.is_published ? new Date().toISOString() : null
        });

        // Send Telegram notification if switching from draft to published
        if (!wasPublished && formData.is_published) {
          try {
            const notificationMessage = `<b>New Changelog Published</b>\n\n<b>Version:</b> v${formData.version}\n<b>Title:</b> ${formData.title}\n\n${formData.content.substring(0, 500)}${formData.content.length > 500 ? '...' : ''}`;

            await fetch('/api/telegram/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: notificationMessage })
            });
          } catch (telegramErr) {
            console.error('Failed to send Telegram notification:', telegramErr);
          }
        }

        toast({
          title: 'Changelog updated',
          description: `v${formData.version} — ${formData.title}`,
        });
      } else {
        await ChangelogService.createChangelog({
          version: formData.version,
          title: formData.title,
          content: formData.content,
          is_published: formData.is_published,
          published_at: formData.is_published ? new Date().toISOString() : null
        });

        // Send Telegram notification if created as published
        if (formData.is_published) {
          try {
            const notificationMessage = `<b>New Changelog Published</b>\n\n<b>Version:</b> v${formData.version}\n<b>Title:</b> ${formData.title}\n\n${formData.content.substring(0, 500)}${formData.content.length > 500 ? '...' : ''}`;

            await fetch('/api/telegram/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: notificationMessage })
            });
          } catch (telegramErr) {
            console.error('Failed to send Telegram notification:', telegramErr);
          }
        }

        toast({
          title: 'Changelog created',
          description: `v${formData.version} — ${formData.title}`,
        });
      }

      await fetchChangelogs();
      setIsDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTarget) return;
    setDeleting(true);
    try {
      await ChangelogService.deleteChangelog(deletingTarget.id);
      await fetchChangelogs();
      toast({
        title: 'Changelog deleted',
        description: `v${deletingTarget.version} — ${deletingTarget.title}`,
      });
      setDeletingTarget(null);
    } catch (err) {
      toast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePublish = async (changelog: Changelog) => {
    try {
      if (changelog.is_published) {
        await ChangelogService.unpublishChangelog(changelog.id);
        toast({
          title: 'Changelog unpublished',
          description: `v${changelog.version} — ${changelog.title}`,
        });
      } else {
        await ChangelogService.publishChangelog(changelog.id);

        // Send Telegram notification to HH Operations chat
        try {
          const notificationMessage = `<b>New Changelog Published</b>\n\n<b>Version:</b> v${changelog.version}\n<b>Title:</b> ${changelog.title}\n\n${changelog.content.substring(0, 500)}${changelog.content.length > 500 ? '...' : ''}`;

          await fetch('/api/telegram/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: notificationMessage })
          });
        } catch (telegramErr) {
          console.error('Failed to send Telegram notification:', telegramErr);
          // Don't fail the publish if notification fails
        }

        toast({
          title: 'Changelog published',
          description: `v${changelog.version} — ${changelog.title}`,
        });
      }
      await fetchChangelogs();
    } catch (err) {
      toast({
        title: 'Publish failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not published';
    return formatDateTime(dateString);
  };

  // Show access denied for non-super_admins
  if (userProfile && !isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Sparkles}
          title="Changelog Management"
          subtitle="Create and manage portal update announcements"
          kicker="Admin · Changelog"
          kickerDot="brand"
        />
        <Card className="border-cream-200">
          <EmptyState
            icon={ShieldAlert}
            title="Access Denied"
            description="Only super admins can access the changelog management page."
          />
        </Card>
      </div>
    );
  }

  if (loading || !userProfile) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Sparkles}
          title="Changelog Management"
          subtitle="Create and manage portal update announcements"
          kicker="Admin · Changelog"
          kickerDot="brand"
          actions={<Skeleton className="h-10 w-32" />}
        />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Changelog Management"
        subtitle="Create and manage portal update announcements"
        kicker="Admin · Changelog"
        kickerDot="brand"
        actions={(
          <Button variant="brand" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Changelog
          </Button>
        )}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {changelogs.length === 0 ? (
        <Card className="border-cream-200">
          <EmptyState
            icon={Sparkles}
            title="No Changelogs Yet"
            description="Create your first changelog to announce updates to your users."
          >
            <Button variant="brand" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Changelog
            </Button>
          </EmptyState>
        </Card>
      ) : (
        <>
          <SectionHeader
            label="Entries"
            dot="brand"
            counter={`${changelogs.length} changelog${changelogs.length === 1 ? '' : 's'}`}
            first
          />
          <div className="grid gap-4">
            {changelogs.map((changelog) => (
              <Card key={changelog.id} className="border-cream-200">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <StatusBadge tone="brand">v{changelog.version}</StatusBadge>
                        <StatusBadge tone={changelog.is_published ? 'success' : 'neutral'}>
                          {changelog.is_published ? 'Published' : 'Draft'}
                        </StatusBadge>
                      </div>
                      <h3 className="font-semibold text-ink-warm-900 mb-1">
                        {changelog.title}
                      </h3>
                      <p className="text-sm text-ink-warm-500 line-clamp-2 mb-2">
                        {changelog.content}
                      </p>
                      <div className="text-xs text-ink-warm-400">
                        {changelog.is_published
                          ? `Published ${formatDate(changelog.published_at)}`
                          : `Created ${formatDate(changelog.created_at)}`
                        }
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePublish(changelog)}
                        title={changelog.is_published ? 'Unpublish' : 'Publish'}
                      >
                        {changelog.is_published ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(changelog)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingTarget(changelog)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" />
              {editingChangelog ? 'Edit Changelog' : 'Create New Changelog'}
            </DialogTitle>
            <DialogDescription>
              {editingChangelog
                ? 'Update the changelog entry details.'
                : 'Create a new changelog entry to announce updates to users.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="version">Version <RequiredAsterisk /></Label>
                <Input
                  id="version"
                  value={formData.version}
                  onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                  placeholder="e.g., 1.2.0"
                  className="focus-brand"
                />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_published"
                    checked={formData.is_published}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_published: checked }))}
                  />
                  <Label htmlFor="is_published">
                    {formData.is_published ? 'Published' : 'Draft'}
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title <RequiredAsterisk /></Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., New Features & Improvements"
                className="focus-brand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content <RequiredAsterisk /></Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Describe the changes...

Use markdown-like formatting:
- Bullet points with - or *
## Headers with ##
### Subheaders with ###"
                rows={8}
                className="focus-brand"
              />
              <p className="text-xs text-ink-warm-500">
                Supports simple formatting: bullet points (- or *), headers (## or ###)
              </p>
            </div>
          </div>

          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (editingChangelog ? 'Save Changes' : 'Create Changelog')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm — replaces the native `confirm()` so it
          matches the v11 destructive-flow pattern (Trash icon in
          title + variant="destructive" primary). */}
      <Dialog open={!!deletingTarget} onOpenChange={(open) => { if (!open) setDeletingTarget(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete Changelog?
            </DialogTitle>
            <DialogDescription className="text-sm text-ink-warm-700 pt-2">
              <strong>v{deletingTarget?.version} — {deletingTarget?.title}</strong> will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-t border-cream-100 pt-3 mt-0">
            <Button variant="outline" onClick={() => setDeletingTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
