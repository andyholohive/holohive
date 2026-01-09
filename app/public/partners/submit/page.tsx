'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Loader2 } from 'lucide-react';
import Image from 'next/image';

const CATEGORY_OPTIONS = [
  { value: 'kol', label: 'KOL/Influencer' },
  { value: 'agency', label: 'Agency' },
  { value: 'venture', label: 'Venture/VC' },
  { value: 'project', label: 'Project' },
  { value: 'individual', label: 'Individual' },
  { value: 'other', label: 'Other' }
];

const COMMISSION_MODEL_OPTIONS = [
  { value: 'revenue_share', label: 'Revenue Share' },
  { value: 'flat_fee', label: 'Flat Fee' },
  { value: 'per_referral', label: 'Per Referral' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'tbd', label: 'To Be Discussed' }
];

export default function PartnerSubmitPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    affiliation: '',
    category: '',
    commission_model: '',
    poc_name: '',
    poc_email: '',
    poc_telegram: '',
    terms_of_interest: '',
    notes: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Partner/Affiliate name is required');
      return;
    }

    if (!formData.poc_name.trim()) {
      setError('Point of contact name is required');
      return;
    }

    if (!formData.poc_email.trim() && !formData.poc_telegram.trim()) {
      setError('At least one contact method (email or Telegram) is required');
      return;
    }

    if (formData.poc_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.poc_email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/partners/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit partner application');
      }

      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred while submitting');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
            <p className="text-gray-500 mb-8">Thank you for your interest in partnering with us. We'll review your application and get back to you soon.</p>
            <Button
              onClick={() => {
                setIsSubmitted(false);
                setFormData({
                  name: '',
                  affiliation: '',
                  category: '',
                  commission_model: '',
                  poc_name: '',
                  poc_email: '',
                  poc_telegram: '',
                  terms_of_interest: '',
                  notes: ''
                });
              }}
              variant="outline"
              className="px-6"
            >
              Submit Another Application
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header with logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <Image
              src="/images/logo.png"
              alt="Logo"
              width={48}
              height={48}
              className="rounded-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Partner Application</h1>
          <p className="text-gray-500 mt-1">Join our affiliate and partner network</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Partner/Company Name <span className="text-red-500">*</span></Label>
              <Input
                id="name"
                placeholder="Enter partner or company name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="affiliation">Affiliation</Label>
              <Input
                id="affiliation"
                placeholder="Company or organization affiliation"
                value={formData.affiliation}
                onChange={e => setFormData(prev => ({ ...prev, affiliation: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Preferred Commission Model</Label>
              <Select
                value={formData.commission_model}
                onValueChange={(value) => setFormData(prev => ({ ...prev, commission_model: value }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="auth-input">
                  <SelectValue placeholder="Select commission model..." />
                </SelectTrigger>
                <SelectContent>
                  {COMMISSION_MODEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-gray-200 pt-5 mt-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Point of Contact</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="poc_name">Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="poc_name"
                    placeholder="Contact person's name"
                    value={formData.poc_name}
                    onChange={e => setFormData(prev => ({ ...prev, poc_name: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="poc_email">Email</Label>
                  <Input
                    id="poc_email"
                    type="email"
                    placeholder="contact@example.com"
                    value={formData.poc_email}
                    onChange={e => setFormData(prev => ({ ...prev, poc_email: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="poc_telegram">Telegram</Label>
                  <Input
                    id="poc_telegram"
                    placeholder="@username"
                    value={formData.poc_telegram}
                    onChange={e => setFormData(prev => ({ ...prev, poc_telegram: e.target.value }))}
                    disabled={isSubmitting}
                    className="auth-input"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="terms_of_interest">Terms of Interest</Label>
              <Textarea
                id="terms_of_interest"
                placeholder="Describe what you're looking for in a partnership..."
                value={formData.terms_of_interest}
                onChange={e => setFormData(prev => ({ ...prev, terms_of_interest: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any other information you'd like to share..."
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                disabled={isSubmitting}
                className="auth-input"
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by Holo Hive
        </p>
      </div>
    </div>
  );
}
