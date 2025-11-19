import { invoke } from '@tauri-apps/api/core';
import type { PromptEnhancerAPI, PromptEnhancerConfig } from '@openchamber/ui/lib/api/types';

const toError = (error: unknown, fallback: string): Error => {
  if (error instanceof Error && error.message) {
    return error;
  }
  return new Error(fallback);
};

export const createDesktopPromptEnhancerAPI = (): PromptEnhancerAPI => ({
  async loadConfig(): Promise<PromptEnhancerConfig | null> {
    try {
      return await invoke<PromptEnhancerConfig>('load_prompt_enhancer_config');
    } catch (error) {
      throw toError(error, 'Failed to load prompt enhancer config');
    }
  },

  async saveConfig(config: PromptEnhancerConfig): Promise<PromptEnhancerConfig> {
    try {
      return await invoke<PromptEnhancerConfig>('save_prompt_enhancer_config', { payload: config });
    } catch (error) {
      throw toError(error, 'Failed to save prompt enhancer config');
    }
  },
});
