import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { ForkView } from '@/components/stage/ForkView';

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ForkView />
    </Suspense>
  );
}
