import { useConfigStore } from '@/stores/useConfigStore';

export function useOpenCodeReadiness() {
  const isInitialized = useConfigStore((s) => s.isInitialized);
  const connectionPhase = useConfigStore((s) => s.connectionPhase);

  return {
    isReady: isInitialized,
    connectionPhase,
  };
}
