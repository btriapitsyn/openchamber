import type { VSCodeAPI } from '@openchamber/ui/lib/api/types';
import { executeVSCodeCommand } from './bridge';

export const createVSCodeActionsAPI = (): VSCodeAPI => ({
  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    const result = await executeVSCodeCommand(command, args);
    return result.result;
  },

  async openAgentManager(): Promise<void> {
    await executeVSCodeCommand('openchamber.openAgentManager');
  },
});
