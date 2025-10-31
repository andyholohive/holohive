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

          // Set a timeout to clear the counter after 10 seconds of successful operation
          setTimeout(() => {
            sessionStorage.removeItem('chunkErrorReloads');
          }, 10000);

          window.location.reload();
        } else {
          console.error('Multiple chunk load errors detected. Please clear your browser cache and try again.');
          sessionStorage.removeItem('chunkErrorReloads');
        }

        event.preventDefault();
      }
    };

    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null;
}
