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
  Mail, MessageSquare, MoreHorizontal
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  CRMService,
  CRMContact,
  CreateContactData,
} from '@/lib/crmService';

export default function ContactsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingContact, setEditingContact] = useState<CRMContact | null>(null);
  const [contactForm, setContactForm] = useState<CreateContactData>({
    name: '',
  });

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const conts = await CRMService.getAllContacts();
      setContacts(conts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateContact = async () => {
    if (!contactForm.name.trim()) return;
    setIsSubmitting(true);
    try {
      if (editingContact) {
        await CRMService.updateContact(editingContact.id, contactForm);
      } else {
        await CRMService.createContact({
          ...contactForm,
          owner_id: user?.id
        });
      }
      setIsNewContactOpen(false);
      setEditingContact(null);
      setContactForm({ name: '' });
      fetchContacts();
    } catch (error) {
      console.error('Error saving contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditContact = (contact: CRMContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      email: contact.email || undefined,
      telegram_id: contact.telegram_id || undefined,
      x_id: contact.x_id || undefined,
      role: contact.role || undefined,
      category: contact.category || undefined,
      notes: contact.notes || undefined
    });
    setIsNewContactOpen(true);
  };

  const handleDeleteContact = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await CRMService.deleteContact(id);
      fetchContacts();
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.telegram_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
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
          <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
          <p className="text-gray-600">Manage your contact directory</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search contacts..."
              className="pl-10 auth-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              setEditingContact(null);
              setContactForm({ name: '' });
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

      {/* Stats Card */}
      <Card className="w-fit">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-8">
            <div>
              <p className="text-sm text-gray-600">Total Contacts</p>
              <p className="text-2xl font-bold">{contacts.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <UserPlus className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredContacts.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <p className="text-gray-600">
              {searchTerm ? 'No contacts found matching your search.' : 'No contacts found.'}
            </p>
            {!searchTerm && (
              <Button
                className="mt-4"
                onClick={() => {
                  setEditingContact(null);
                  setContactForm({ name: '' });
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
          filteredContacts.map((contact) => (
            <Card key={contact.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <UserPlus className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{contact.name}</CardTitle>
                      {contact.role && (
                        <p className="text-sm text-gray-500">{contact.role}</p>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditContact(contact)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDeleteContact(contact.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {contact.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="h-4 w-4" />
                    <span>{contact.email}</span>
                  </div>
                )}
                {contact.telegram_id && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <MessageSquare className="h-4 w-4" />
                    <span>@{contact.telegram_id}</span>
                  </div>
                )}
                {contact.x_id && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                    <span className="h-4 w-4 flex items-center justify-center font-bold text-xs">𝕏</span>
                    <span>@{contact.x_id}</span>
                  </div>
                )}
                {contact.category && (
                  <Badge variant="outline" className="text-xs mt-2">
                    {contact.category}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))
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
                <Input
                  id="contact-category"
                  value={contactForm.category || ''}
                  onChange={(e) => setContactForm({ ...contactForm, category: e.target.value })}
                  placeholder="Contact category"
                  className="auth-input"
                />
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
    </div>
  );
}
