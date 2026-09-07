import { afterEach, describe, expect, test } from 'bun:test';
import { useUIStore } from './useUIStore';

const originalOptions = useUIStore.persist.getOptions();
const originalState = useUIStore.getState();
afterEach(() => {
  useUIStore.persist.setOptions(originalOptions);
  useUIStore.setState(originalState, true);
});

describe('telemetry settings migration', () => {
  for (const version of [18, 19]) {
    test(`migrates real v${version} hydration without losing existing hidden sections`, async () => {
      useUIStore.persist.setOptions({ storage: {
        getItem: () => ({ version, state: { ...useUIStore.getInitialState(), workStatusHiddenSections: ['mcp'] } }),
        setItem: () => undefined,
        removeItem: () => undefined,
      } });
      await useUIStore.persist.rehydrate();
      expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp', 'telemetry']);
      expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(false);
      expect(useUIStore.persist.getOptions().version).toBe(20);
    });
  }

  test('explicit opt-in round-trips through the actual persisted projection and hydration', async () => {
    let saved: Parameters<NonNullable<typeof originalOptions.storage>['setItem']>[1] = { state: useUIStore.getInitialState(), version: 20 };
    useUIStore.persist.setOptions({ storage: {
      getItem: () => saved,
      setItem: (_name, value) => { saved = value; },
      removeItem: () => undefined,
    } });
    useUIStore.setState({ workStatusHiddenSections: ['telemetry', 'mcp'], workStatusHiddenSectionsExplicit: false });
    useUIStore.getState().setWorkStatusSectionVisible('telemetry', true);
    useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: () => undefined, removeItem: () => undefined } });
    useUIStore.setState({ workStatusHiddenSections: ['telemetry'], workStatusHiddenSectionsExplicit: false });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(true);
  });
});
