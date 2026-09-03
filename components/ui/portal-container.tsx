'use client';

import * as React from 'react';

/**
 * Where a floating layer should portal to when it opens from inside a modal.
 *
 * [2026-09-03] Radix Dialog / Sheet / AlertDialog lock page scroll while open
 * and exempt only their own subtree. A Popover opened from inside one portals
 * to document.body by default — outside that exemption — so its content
 * renders and its wheel events are swallowed. The calendar picker on the
 * budget popup was the first report; the audit found 39 dialogs with a
 * Popover inside and no fix.
 *
 * Fixing it per call site meant threading a ref through 39 files and
 * remembering to do it in the 40th. Instead each modal Content publishes its
 * own DOM element here, and PopoverContent reads it as the default portal
 * target. Outside a modal the value is null and nothing changes. An explicit
 * `container` prop on PopoverContent still wins.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext);
}
