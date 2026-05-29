'use client';
// [Expenses v1, May 2026] Reuses clients layout (ProtectedRoute +
// Sidebar). Same pattern as /wallets and /mindshare. Page-level
// super_admin guard lives inside page.tsx itself — this layout just
// gates basic authentication and adds chrome.
export { default } from '../clients/layout';
