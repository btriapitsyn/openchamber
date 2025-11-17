import type { SettingsAPI, SettingsLoadResult, SettingsPayload } from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop settings API not implemented');
};

export const createDesktopSettingsAPI = (): SettingsAPI => ({
  async load(): Promise<SettingsLoadResult> {
    return notImplemented();
  },
  async save(changes: Partial<SettingsPayload>): Promise<SettingsPayload> {
    return notImplemented(changes);
  },
});
