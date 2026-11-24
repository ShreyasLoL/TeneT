import { notFound } from 'next/navigation';
import { LensesHarness } from '@/components/lenses/LensesHarness';

export default function DevLensesPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <LensesHarness />;
}
