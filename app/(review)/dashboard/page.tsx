import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { DashboardView } from '@/components/review/DashboardView';

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingFallback variant="wide" />}>
      <DashboardView />
    </Suspense>
  );
}
