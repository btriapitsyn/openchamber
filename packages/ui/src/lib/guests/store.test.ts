import { describe, expect, test } from 'bun:test';

import { useGuestsStore } from './store.ts';
import type { InstalledGuest } from './types.ts';

const hello: InstalledGuest = {
  id: 'hello',
  name: 'Hello',
  icon: 'window',
  entry: 'panel/index.html',
  source: 'path',
  capabilities: { requested: [], granted: [] },
};

const resetStore = () => {
  useGuestsStore.setState({ status: 'idle', guests: [], runtimeKey: '' });
};

describe('useGuestsStore', () => {
  test('drops the previous instance catalog on switch', () => {
    resetStore();
    useGuestsStore.getState().resetForRuntimeSwitch('instance-a');
    useGuestsStore.getState().replaceCatalog([hello], 'instance-a');
    expect(useGuestsStore.getState().guests).toEqual([hello]);

    useGuestsStore.getState().resetForRuntimeSwitch('instance-b');
    expect(useGuestsStore.getState().status).toBe('idle');
    expect(useGuestsStore.getState().guests).toEqual([]);
    expect(useGuestsStore.getState().runtimeKey).toBe('instance-b');
  });

  test('ignores a catalog that arrives after the instance changed', () => {
    resetStore();
    useGuestsStore.getState().resetForRuntimeSwitch('instance-a');
    useGuestsStore.getState().replaceCatalog([hello], 'instance-a');
    useGuestsStore.getState().resetForRuntimeSwitch('instance-b');

    useGuestsStore.getState().replaceCatalog([hello], 'instance-a');
    useGuestsStore.getState().markFailed('instance-a');

    expect(useGuestsStore.getState().status).toBe('idle');
    expect(useGuestsStore.getState().guests).toEqual([]);
    expect(useGuestsStore.getState().runtimeKey).toBe('instance-b');
  });

  test('marks vscode and mobile as unsupported, not an empty ready catalog', () => {
    resetStore();
    useGuestsStore.getState().resetForRuntimeSwitch('vscode-a');
    useGuestsStore.getState().markUnsupported('vscode-a');
    expect(useGuestsStore.getState().status).toBe('unsupported');
    expect(useGuestsStore.getState().guests).toEqual([]);

    useGuestsStore.getState().markUnsupported('other');
    expect(useGuestsStore.getState().status).toBe('unsupported');
    expect(useGuestsStore.getState().runtimeKey).toBe('vscode-a');
  });

  test('keeps a ready catalog when a later fetch on the same instance fails', () => {
    resetStore();
    useGuestsStore.getState().resetForRuntimeSwitch('instance-a');
    useGuestsStore.getState().replaceCatalog([hello], 'instance-a');
    useGuestsStore.getState().markFailed('instance-a');
    expect(useGuestsStore.getState().status).toBe('ready');
    expect(useGuestsStore.getState().guests).toEqual([hello]);
  });
});
