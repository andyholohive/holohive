'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Megaphone, Users, BarChart3, Shield } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    // If user is authenticated, redirect to campaigns
    if (!loading && user) {
      router.push('/campaigns');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2" style={{ borderBottomColor: '#3e8692' }}></div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect to campaigns
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            KOL Campaign Manager
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Streamline your influencer marketing campaigns with our comprehensive platform for managing KOLs, clients, and campaign analytics.
          </p>
          <div className="flex gap-4 justify-center">
            <Button 
              size="lg" 
              onClick={() => router.push('/auth')}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
            >
              Get Started
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => router.push('/public')}
            >
              View Public Campaigns
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <Card className="text-center">
            <CardHeader>
              <Megaphone className="h-12 w-12 mx-auto mb-4" style={{ color: '#3e8692' }} />
              <CardTitle>Campaign Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Create and manage influencer marketing campaigns with ease.</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Users className="h-12 w-12 mx-auto mb-4" style={{ color: '#3e8692' }} />
              <CardTitle>KOL Database</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Access a comprehensive database of Key Opinion Leaders.</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <BarChart3 className="h-12 w-12 mx-auto mb-4" style={{ color: '#3e8692' }} />
              <CardTitle>Analytics & Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Track performance and gain valuable campaign insights.</p>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Shield className="h-12 w-12 mx-auto mb-4" style={{ color: '#3e8692' }} />
              <CardTitle>Secure Platform</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Enterprise-grade security for your campaign data.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}