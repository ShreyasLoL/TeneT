import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { WeeklyView } from '@/components/review/WeeklyView';

export default function WeeklyPage() {
  return (
    <Suspense fallback={<LoadingFallback variant="wide" />}>
      <WeeklyView />
    </Suspense>
  );
}
