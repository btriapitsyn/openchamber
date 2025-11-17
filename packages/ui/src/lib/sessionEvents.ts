import type { Session } from '@opencode-ai/sdk';

export type SessionDeleteRequest = {
  sessions: Session[];
  dateLabel?: string;
};

type DeleteListener = (request: SessionDeleteRequest) => void;
type DirectoryListener = () => void;

const deleteListeners = new Set<DeleteListener>();
const directoryListeners = new Set<DirectoryListener>();

export const sessionEvents = {
  onDeleteRequest(listener: DeleteListener) {
    deleteListeners.add(listener);
    return () => {
      deleteListeners.delete(listener);
    };
  },
  requestDelete(payload: SessionDeleteRequest) {
    if (!payload.sessions.length) {
      return;
    }
    deleteListeners.forEach((listener) => listener(payload));
  },
  onDirectoryRequest(listener: DirectoryListener) {
    directoryListeners.add(listener);
    return () => {
      directoryListeners.delete(listener);
    };
  },
  requestDirectoryDialog() {
    directoryListeners.forEach((listener) => listener());
  },
};
