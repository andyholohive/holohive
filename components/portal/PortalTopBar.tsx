'use client';

/**
 * The client-facing top bar: Holo Hive logo, "Client Portal", and the
 * client's own logo + name. Shared by the client portal and the weekly Korea
 * brief so a client sees one consistent bar wherever they land
 * [Andy 2026-10-01: "Use the same top bar"].
 */

import Image from 'next/image';
import { Building2 } from 'lucide-react';

export function PortalTopBar({ clientName, clientLogoUrl, label = 'Client Portal', containerClassName = 'max-w-7xl', surfaceClassName = 'bg-white/80' }: {
  clientName: string | null | undefined;
  clientLogoUrl?: string | null;
  label?: string;
  /** Width of the inner row, to line up with the page's content column. */
  containerClassName?: string;
  /** Bar fill. The portal's 80% white turns gray over a dark page, so the brief passes a near-solid white. */
  surfaceClassName?: string;
}) {
  return (
    <header className={`${surfaceClassName} backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50 shadow-sm`}>
      <div className={`${containerClassName} mx-auto px-4 sm:px-6 lg:px-8 py-4`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Image src="/images/logo.png" alt="Holo Hive" width={100} height={32} className="h-8 w-auto" priority />
            <span className="text-gray-300">|</span>
            <span className="truncate text-gray-600 font-medium">{label}</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {clientLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- client logos are arbitrary external URLs
              <img src={clientLogoUrl} alt={clientName ?? ''} className="h-8 w-auto max-w-[100px] object-contain rounded-lg" />
            ) : (
              <Building2 className="h-5 w-5 shrink-0 text-gray-400" />
            )}
            <span className="truncate font-medium text-gray-900">{clientName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
