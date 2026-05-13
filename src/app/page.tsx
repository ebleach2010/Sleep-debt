'use client';

import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/**
 * Root page is a tiny client shell. Dashboard (which imports Dexie and pulls
 * in IndexedDB code paths) is loaded dynamically with ssr:false so:
 *   1. The prerendered HTML matches the first client render exactly (no
 *      hydration mismatch).
 *   2. Dexie/IndexedDB are never touched on the server during SSG.
 *   3. Any error inside Dashboard or its deps surfaces visibly via
 *      ErrorBoundary instead of the generic Next.js "Application error".
 */
const Dashboard = dynamic(
  () => import('@/components/Dashboard').then(m => m.Dashboard),
  {
    ssr: false,
    loading: () => (
      <main className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-xl font-semibold">Sleep Debt</h1>
        <p className="text-mute text-sm mt-2">Loading…</p>
      </main>
    ),
  }
);

export default function Page() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
