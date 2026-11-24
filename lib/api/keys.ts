import type { DayKey } from '@/lib/domain/types';

export const tenetKeys = {
  all: ['tenet'] as const,
  definitions: () => ['tenet', 'definitions'] as const,
  state: (from?: DayKey, to?: DayKey) => ['tenet', 'state', from ?? 'default', to ?? 'default'] as const,
};
