import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { AreaView } from '@/components/review/AreaView';

export default function AreaPage() {
  return (
    <Suspense fallback={<LoadingFallback variant="wide" />}>
      <AreaView />
    </Suspense>
  );
}
