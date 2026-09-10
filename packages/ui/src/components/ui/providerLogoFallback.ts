import type { IconName } from '@/components/icon/icons';

const COMMAND_CODE_PROVIDER_IDS = new Set(['command-code', 'commandcode', 'command_code', 'command code']);
const FREEINFERENCE_PROVIDER_IDS = new Set(['freeinference', 'free-inference', 'free_inference']);

export function getProviderLogoFallbackIcon(providerId: string | null | undefined): IconName | null {
  const normalized = providerId?.trim().toLowerCase();
  if (!normalized) return null;
  if (COMMAND_CODE_PROVIDER_IDS.has(normalized)) {
    return 'terminal-box';
  }
  if (FREEINFERENCE_PROVIDER_IDS.has(normalized)) {
    return 'ai-agent';
  }
  return null;
}
