'use client';

import { useEffect } from 'react';

// This component checks if the app version has changed and forces a reload
export function VersionCheck() {
  useEffect(() => {
    // Check every 5 minutes if we're on an old version
    const checkVersion = async () => {
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        const data = await response.json();
        const currentVersion = localStorage.getItem('app-version');

        if (currentVersion && currentVersion !== data.version) {
          console.log('New version detected, reloading...');
          localStorage.setItem('app-version', data.version);
          window.location.reload();
        } else if (!currentVersion) {
          localStorage.setItem('app-version', data.version);
        }
      } catch (error) {
        console.error('Version check failed:', error);
      }
    };

    // Check immediately on mount
    checkVersion();

    // Check every 5 minutes
    const interval = setInterval(checkVersion, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
