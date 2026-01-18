import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TabContextProvider } from './TabContext';
import { useTabContext, useRequiredTabContext } from './useTabContext';
import type { PaneTab } from '@/stores/usePaneStore';

const TestConsumer: React.FC = () => {
  const context = useTabContext();
  return (
    <div>
      <span data-testid="pane-id">{context?.paneId ?? 'null'}</span>
      <span data-testid="tab-id">{context?.tabId ?? 'null'}</span>
      <span data-testid="worktree-id">{context?.worktreeId ?? 'null'}</span>
    </div>
  );
};

const RequiredTestConsumer: React.FC = () => {
  const context = useRequiredTabContext();
  return (
    <div>
      <span data-testid="required-tab-id">{context.tabId}</span>
    </div>
  );
};

describe('TabContext', () => {
  const mockTab: PaneTab = {
    id: 'test-tab-123',
    type: 'terminal',
    title: 'Test Terminal',
    createdAt: Date.now(),
  };

  const mockUpdateMetadata = vi.fn();

  describe('TabContextProvider', () => {
    it('should provide context values to children', () => {
      render(
        <TabContextProvider
          paneId="left"
          tab={mockTab}
          worktreeId="global"
          updateMetadata={mockUpdateMetadata}
        >
          <TestConsumer />
        </TabContextProvider>
      );

      expect(screen.getByTestId('pane-id')).toHaveTextContent('left');
      expect(screen.getByTestId('tab-id')).toHaveTextContent('test-tab-123');
      expect(screen.getByTestId('worktree-id')).toHaveTextContent('global');
    });

    it('should provide different values for different tabs', () => {
      const tab1: PaneTab = { id: 'tab-1', type: 'terminal', title: 'Terminal 1', createdAt: Date.now() };
      const tab2: PaneTab = { id: 'tab-2', type: 'terminal', title: 'Terminal 2', createdAt: Date.now() };

      const { rerender } = render(
        <TabContextProvider
          paneId="left"
          tab={tab1}
          worktreeId="global"
          updateMetadata={mockUpdateMetadata}
        >
          <TestConsumer />
        </TabContextProvider>
      );

      expect(screen.getByTestId('tab-id')).toHaveTextContent('tab-1');

      rerender(
        <TabContextProvider
          paneId="right"
          tab={tab2}
          worktreeId="worktree-1"
          updateMetadata={mockUpdateMetadata}
        >
          <TestConsumer />
        </TabContextProvider>
      );

      expect(screen.getByTestId('tab-id')).toHaveTextContent('tab-2');
      expect(screen.getByTestId('pane-id')).toHaveTextContent('right');
      expect(screen.getByTestId('worktree-id')).toHaveTextContent('worktree-1');
    });
  });

  describe('useTabContext', () => {
    it('should return null when used outside provider', () => {
      render(<TestConsumer />);

      expect(screen.getByTestId('pane-id')).toHaveTextContent('null');
      expect(screen.getByTestId('tab-id')).toHaveTextContent('null');
    });

    it('should return context when used inside provider', () => {
      render(
        <TabContextProvider
          paneId="left"
          tab={mockTab}
          worktreeId="global"
          updateMetadata={mockUpdateMetadata}
        >
          <TestConsumer />
        </TabContextProvider>
      );

      expect(screen.getByTestId('tab-id')).toHaveTextContent('test-tab-123');
    });
  });

  describe('useRequiredTabContext', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<RequiredTestConsumer />);
      }).toThrow('useRequiredTabContext must be used within a TabContextProvider');
      
      consoleSpy.mockRestore();
    });

    it('should return context when used inside provider', () => {
      render(
        <TabContextProvider
          paneId="left"
          tab={mockTab}
          worktreeId="global"
          updateMetadata={mockUpdateMetadata}
        >
          <RequiredTestConsumer />
        </TabContextProvider>
      );

      expect(screen.getByTestId('required-tab-id')).toHaveTextContent('test-tab-123');
    });
  });

  describe('updateMetadata callback', () => {
    it('should pass updateMetadata function through context', () => {
      const UpdateMetadataConsumer: React.FC = () => {
        const context = useTabContext();
        return (
          <button onClick={() => context?.updateMetadata({ foo: 'bar' })}>
            Update
          </button>
        );
      };

      render(
        <TabContextProvider
          paneId="left"
          tab={mockTab}
          worktreeId="global"
          updateMetadata={mockUpdateMetadata}
        >
          <UpdateMetadataConsumer />
        </TabContextProvider>
      );

      screen.getByRole('button').click();

      expect(mockUpdateMetadata).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });

  describe('tab isolation', () => {
    it('should provide unique context for each tab instance', () => {
      const ResultCollector: React.FC<{ onMount: (id: string) => void }> = ({ onMount }) => {
        const context = useTabContext();
        React.useEffect(() => {
          if (context?.tabId) {
            onMount(context.tabId);
          }
        }, [context?.tabId, onMount]);
        return null;
      };

      const collectedIds: string[] = [];
      const collectId = (id: string) => collectedIds.push(id);

      const tab1: PaneTab = { id: 'unique-tab-1', type: 'terminal', title: 'Terminal 1', createdAt: Date.now() };
      const tab2: PaneTab = { id: 'unique-tab-2', type: 'terminal', title: 'Terminal 2', createdAt: Date.now() };

      const { unmount } = render(
        <>
          <TabContextProvider
            paneId="left"
            tab={tab1}
            worktreeId="global"
            updateMetadata={vi.fn()}
          >
            <ResultCollector onMount={collectId} />
          </TabContextProvider>
          <TabContextProvider
            paneId="right"
            tab={tab2}
            worktreeId="global"
            updateMetadata={vi.fn()}
          >
            <ResultCollector onMount={collectId} />
          </TabContextProvider>
        </>
      );

      expect(collectedIds).toContain('unique-tab-1');
      expect(collectedIds).toContain('unique-tab-2');
      expect(new Set(collectedIds).size).toBe(2);
      
      unmount();
    });
  });
});
