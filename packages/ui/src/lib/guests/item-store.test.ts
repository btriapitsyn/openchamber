import { describe, expect, test } from 'bun:test';

import { useGuestItemStore } from './item-store.ts';

const item = {
  providerId: 'tasks-demo',
  id: 'DEMO-1',
  title: 'Fix the login redirect loop',
  url: 'https://example.com/tasks/DEMO-1',
};

describe('useGuestItemStore', () => {
  test('hands an item to its guest once and leaves other guests alone', () => {
    useGuestItemStore.setState({ pendingItemByGuest: {} });
    useGuestItemStore.getState().setPendingItem('tasks-demo', item);
    useGuestItemStore.getState().setPendingItem('other', { ...item, providerId: 'other', id: 'X-1' });

    expect(useGuestItemStore.getState().takePendingItem('tasks-demo')).toEqual(item);
    expect(useGuestItemStore.getState().takePendingItem('tasks-demo')).toBeNull();
    expect(useGuestItemStore.getState().pendingItemByGuest.other?.id).toBe('X-1');
  });

  test('a later item for the same guest replaces the earlier one', () => {
    useGuestItemStore.setState({ pendingItemByGuest: {} });
    useGuestItemStore.getState().setPendingItem('tasks-demo', item);
    useGuestItemStore.getState().setPendingItem('tasks-demo', { ...item, id: 'DEMO-2' });
    expect(useGuestItemStore.getState().takePendingItem('tasks-demo')?.id).toBe('DEMO-2');
  });
});
