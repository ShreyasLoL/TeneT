import { Suspense } from 'react';
import { LoadingFallback } from '@/components/chrome/LoadingFallback';
import { LogShell } from '@/components/ritual/LogShell';

export default function LogPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LogShell />
    </Suspense>
  );
}
