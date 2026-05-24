'use client';
// [Wallet Analytics v1, May 2026] Mirrors clients/mindshare layout —
// wraps in ProtectedRoute (admin auth) + Sidebar (chrome). Without
// this file the /wallets page renders bare (no sidebar) AND the API
// fetches 401 because the auth session isn't propagated.
export { default } from '../clients/layout';
