'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangelogService, Changelog, CreateChangelogData } from '@/lib/changelogService';
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
          title: 'Error',
          description: 'Version, title, and content are required',
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
          title: 'Success',
          description: 'Changelog updated successfully',
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
          title: 'Success',
          description: 'Changelog created successfully',
        });
      }

      await fetchChangelogs();
      setIsDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save changelog',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this changelog?')) return;

    try {
      await ChangelogService.deleteChangelog(id);
      await fetchChangelogs();
      toast({
        title: 'Success',
        description: 'Changelog deleted successfully',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete changelog',
        variant: 'destructive',
      });
    }
  };

  const handleTogglePublish = async (changelog: Changelog) => {
    try {
      if (changelog.is_published) {
        await ChangelogService.unpublishChangelog(changelog.id);
        toast({
          title: 'Success',
          description: 'Changelog unpublished',
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
          title: 'Success',
          description: 'Changelog published',
        });
      }
      await fetchChangelogs();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update changelog status',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not published';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Show access denied for non-super_admins
  if (userProfile && !isSuperAdmin) {
    return (
      <div className="flex flex-col h-full gap-6">
        <Card>
          <CardContent className="py-12 text-center">
            <ShieldAlert className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Only super admins can access the changelog management page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !userProfile) {
    return (
      <div className="flex flex-col h-full gap-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Changelog Management</h2>
          <p className="text-gray-600">Create and manage portal update announcements</p>
        </div>
        <Button
          onClick={openCreateDialog}
          style={{ backgroundColor: '#3e8692', color: 'white' }}
          className="hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Changelog
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {changelogs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No changelogs yet</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-4">
              Create your first changelog to announce updates to your users.
            </p>
            <Button
              onClick={openCreateDialog}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Changelog
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {changelogs.map((changelog) => (
            <Card key={changelog.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <Badge
                        variant="secondary"
                        className="bg-[#3e8692]/10 text-[#3e8692]"
                      >
                        v{changelog.version}
                      </Badge>
                      <Badge
                        variant={changelog.is_published ? 'default' : 'secondary'}
                        style={changelog.is_published ? { backgroundColor: '#3e8692' } : {}}
                      >
                        {changelog.is_published ? 'Published' : 'Draft'}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {changelog.title}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                      {changelog.content}
                    </p>
                    <div className="text-xs text-gray-400">
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
                      onClick={() => handleDelete(changelog.id)}
                      className="hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingChangelog ? 'Edit Changelog' : 'Create New Changelog'}
            </DialogTitle>
            <DialogDescription>
              {editingChangelog
                ? 'Update the changelog entry details.'
                : 'Create a new changelog entry to announce updates to users.'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  value={formData.version}
                  onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                  placeholder="e.g., 1.2.0"
                  className="auth-input"
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
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., New Features & Improvements"
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
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
                className="auth-input"
              />
              <p className="text-xs text-gray-500">
                Supports simple formatting: bullet points (- or *), headers (## or ###)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              {saving ? 'Saving...' : (editingChangelog ? 'Update' : 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
