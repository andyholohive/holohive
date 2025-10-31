'use client';

import { useEffect } from 'react';

export function ChunkErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.message || '';

      // Check if it's a chunk loading error
      if (
        errorMessage.includes('ChunkLoadError') ||
        errorMessage.includes('Loading chunk') ||
        errorMessage.includes('Failed to fetch dynamically imported module')
      ) {
        console.warn('Chunk load error detected, reloading page...', errorMessage);

        // Store that we attempted a reload to prevent infinite loops
        const reloadAttempts = parseInt(sessionStorage.getItem('chunkErrorReloads') || '0');

        if (reloadAttempts < 3) {
          sessionStorage.setItem('chunkErrorReloads', String(reloadAttempts + 1));
          window.location.reload();
        } else {
          console.error('Multiple chunk load errors detected. Please clear your browser cache and try again.');
          sessionStorage.removeItem('chunkErrorReloads');
        }

        event.preventDefault();
      }
    };

    // Reset reload counter on successful load
    sessionStorage.removeItem('chunkErrorReloads');

    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
