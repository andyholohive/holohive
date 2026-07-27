'use client';

/**
 * The "you are previewing" bar. Deliberately loud and impossible to
 * dismiss without exiting.
 *
 * The failure mode worth designing against isn't a missing feature, it's
 * Andy forgetting he's in preview, seeing a trimmed sidebar, and filing a
 * bug against a page that is fine. So: fixed to the top, full width,
 * amber, always naming who is being previewed, with exit as the only
 * action. It also states the one thing preview cannot show — that data
 * still loads with the real account's access.
 */

import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewAs } from '@/contexts/ViewAsContext';

export default function ViewAsBanner() {
  const { target, stopViewAs } = useViewAs();
  if (!target) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-100 border-b border-amber-300 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2">
        <Eye className="h-4 w-4 text-amber-800 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-900 truncate">
            Viewing the sidebar as {target.name}
            <span className="font-normal"> · {target.role.replace('_', ' ')}</span>
            {target.restricted && <span className="font-normal"> · restricted to {target.permissions.filter(p => p.can_view).length} pages</span>}
          </p>
          <p className="text-[11px] text-amber-800/80 truncate">
            Navigation only — page data still loads with your own access, not theirs.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={stopViewAs}
          className="h-7 border-amber-400 text-amber-900 hover:bg-amber-200 flex-shrink-0"
        >
          <X className="h-3.5 w-3.5 mr-1" />
          Exit preview
        </Button>
      </div>
    </div>
  );
}
