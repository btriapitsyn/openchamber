import { useEffect, useState } from 'react';

import { fetchCallableSmallModelProviders } from '@/lib/smallModelRequest';

type FetchProviders = typeof fetchCallableSmallModelProviders;

export const useCallableSmallModelProviders = (
  directory: string | null | undefined,
  enabled = true,
  fetchProviders: FetchProviders = fetchCallableSmallModelProviders,
): string[] | undefined => {
  const directoryKey = directory?.trim() ?? '';
  const [resolved, setResolved] = useState<{ directoryKey: string; providers: string[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchProviders(directoryKey || undefined).then((providers) => {
      if (!cancelled) setResolved({ directoryKey, providers });
    }).catch(() => {
      // Keep the previous directory cached, but never expose it for this key.
    });
    return () => {
      cancelled = true;
    };
  }, [directoryKey, enabled, fetchProviders]);

  if (!enabled || resolved?.directoryKey !== directoryKey) return undefined;
  return resolved.providers;
};
