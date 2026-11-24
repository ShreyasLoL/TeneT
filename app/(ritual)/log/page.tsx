import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { CheckIn } from '@/components/ritual/CheckIn';

export default function LogPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CheckIn />
    </Suspense>
  );
}
