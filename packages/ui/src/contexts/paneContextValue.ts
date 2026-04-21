import React from 'react';
import { useSessionUIStore, type PaneSide } from '@/sync/session-ui-store';

export type PaneContextValue = {
  sessionId: string | null;
  pane: PaneSide;
  isFocused: boolean;
};

export const PaneContext = React.createContext<PaneContextValue | null>(null);

// Reads the sessionId bound to the nearest PaneProvider.
// Falls back to store.currentSessionId when no pane is bound (non-pane subtrees,
// legacy call sites), so existing components keep working without changes.
export const usePaneSessionId = (): string | null => {
  const ctx = React.useContext(PaneContext);
  const fallback = useSessionUIStore((s) => s.currentSessionId);
  return ctx ? ctx.sessionId : fallback;
};

export const usePaneContext = (): PaneContextValue | null => {
  return React.useContext(PaneContext);
};
