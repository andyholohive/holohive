'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { Changelog } from '@/lib/changelogService';
import { useAuth } from '@/contexts/AuthContext';
import { useChangelog } from '@/contexts/ChangelogContext';

export default function ChangelogModal() {
  const { user } = useAuth();
  const { unreadChangelogs, loading, markAsViewed } = useChangelog();
  const [isOpen, setIsOpen] = useState(false);
  const [displayedChangelogs, setDisplayedChangelogs] = useState<Changelog[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [markAsRead, setMarkAsRead] = useState(true);

  // Show modal when there are unread changelogs
  useEffect(() => {
    if (user && !loading && unreadChangelogs.length > 0 && displayedChangelogs.length === 0) {
      setDisplayedChangelogs(unreadChangelogs);
      setCurrentIndex(0);
      setIsOpen(true);
    }
  }, [user, loading, unreadChangelogs, displayedChangelogs.length]);

  const handleDismiss = async () => {
    // Only mark as viewed if checkbox is checked
    if (markAsRead) {
      const ids = displayedChangelogs.map(c => c.id);
      await markAsViewed(ids);
    }
    setIsOpen(false);
    setDisplayedChangelogs([]);
    setMarkAsRead(true); // Reset for next time
  };

  const handlePrevious = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(displayedChangelogs.length - 1, prev + 1));
  };

  if (!user || displayedChangelogs.length === 0) {
    return null;
  }

  const currentChangelog = displayedChangelogs[currentIndex];
  const hasMultiple = displayedChangelogs.length > 1;

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Simple markdown-like rendering (bold, newlines, bullet points)
  const renderContent = (content: string) => {
    return content.split('\n').map((line, index) => {
      // Handle bullet points
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={index} className="ml-4 text-gray-700">
            {line.trim().substring(2)}
          </li>
        );
      }
      // Handle headers (## or ###)
      if (line.trim().startsWith('### ')) {
        return (
          <h4 key={index} className="font-semibold text-gray-900 mt-3 mb-1">
            {line.trim().substring(4)}
          </h4>
        );
      }
      if (line.trim().startsWith('## ')) {
        return (
          <h3 key={index} className="font-bold text-gray-900 mt-4 mb-2">
            {line.trim().substring(3)}
          </h3>
        );
      }
      // Empty lines become spacing
      if (line.trim() === '') {
        return <div key={index} className="h-2" />;
      }
      // Regular paragraphs
      return (
        <p key={index} className="text-gray-700">
          {line}
        </p>
      );
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDismiss()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-[#3e8692]" />
            <DialogTitle className="text-xl">What's New</DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-[#3e8692]/10 text-[#3e8692] hover:bg-[#3e8692]/20"
            >
              v{currentChangelog.version}
            </Badge>
            {currentChangelog.published_at && (
              <span className="text-sm text-gray-500">
                {formatDate(currentChangelog.published_at)}
              </span>
            )}
          </div>
          <DialogDescription className="text-base font-medium text-gray-900 mt-2">
            {currentChangelog.title}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4">
          <div className="space-y-1">
            {renderContent(currentChangelog.content)}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-4">
          {/* Mark as read checkbox */}
          <div className="flex items-center space-x-2 w-full">
            <Checkbox
              id="markAsRead"
              checked={markAsRead}
              onCheckedChange={(checked) => setMarkAsRead(checked === true)}
            />
            <Label
              htmlFor="markAsRead"
              className="text-sm text-gray-500 cursor-pointer"
            >
              Don't show this update again
            </Label>
          </div>

          {/* Navigation and dismiss button */}
          <div className="flex items-center justify-between w-full">
            {hasMultiple ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-500">
                  {currentIndex + 1} of {displayedChangelogs.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentIndex === displayedChangelogs.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div />
            )}
            <Button
              onClick={handleDismiss}
              style={{ backgroundColor: '#3e8692' }}
              className="text-white hover:opacity-90"
            >
              Got it!
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
