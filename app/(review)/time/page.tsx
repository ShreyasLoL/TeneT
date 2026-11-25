import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { TimeView } from '@/components/review/TimeView';

export default function TimePage() {
  return (
    <Suspense fallback={<LoadingFallback variant="wide" />}>
      <TimeView />
    </Suspense>
  );
}
