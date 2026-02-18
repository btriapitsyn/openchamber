/**
 * Shared module for managing archived session state.
 * Stores archived sessions in localStorage by directory path.
 *
 * Storage key: 'oc.sessions.archived'
 * Data format: Record<string, string[]> - maps directory path to array of session IDs
 */

import { getSafeStorage } from '@/stores/utils/safeStorage';

const ARCHIVED_SESSIONS_STORAGE_KEY = 'oc.sessions.archived';

type ArchivedSessionsData = Record<string, string[]>;
type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Get all archived sessions from localStorage.
 * Returns a Record mapping directory paths to arrays of session IDs.
 */
export function getArchivedSessions(): ArchivedSessionsData {
  try {
    const safeStorage = getSafeStorage();
    const raw = safeStorage.getItem(ARCHIVED_SESSIONS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    // Validate and filter the data
    const result: ArchivedSessionsData = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([directory, sessionIds]) => {
      if (Array.isArray(sessionIds)) {
        const validIds = sessionIds.filter((id): id is string => typeof id === 'string');
        if (validIds.length > 0) {
          result[directory] = validIds;
        }
      }
    });
    return result;
  } catch {
    return {};
  }
}

/**
 * Set the full archived sessions data, replacing existing data.
 */
export function setArchivedSessions(data: ArchivedSessionsData): void {
  try {
    const safeStorage = getSafeStorage();
    safeStorage.setItem(ARCHIVED_SESSIONS_STORAGE_KEY, JSON.stringify(data));
    notifyListeners();
  } catch {
    // Storage errors are silently ignored
  }
}

/**
 * Archive a session by adding it to the archived list for its directory.
 */
export function archiveSession(sessionId: string, directory: string): void {
  const data = getArchivedSessions();
  const sessionIds = data[directory] ?? [];
  if (!sessionIds.includes(sessionId)) {
    data[directory] = [...sessionIds, sessionId];
    setArchivedSessions(data);
  }
}

/**
 * Unarchive a session by removing it from the archived list for its directory.
 */
export function unarchiveSession(sessionId: string, directory: string): void {
  const data = getArchivedSessions();
  const sessionIds = data[directory];
  if (!sessionIds) {
    return;
  }
  const filtered = sessionIds.filter((id) => id !== sessionId);
  if (filtered.length === 0) {
    delete data[directory];
  } else {
    data[directory] = filtered;
  }
  setArchivedSessions(data);
}

/**
 * Check if a session is archived.
 */
export function isSessionArchived(sessionId: string, directory: string): boolean {
  const data = getArchivedSessions();
  const sessionIds = data[directory];
  return sessionIds ? sessionIds.includes(sessionId) : false;
}

/**
 * Notify all listeners that archive state has changed.
 */
function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listener errors are silently ignored
    }
  });
}

/**
 * Subscribe to archive state changes.
 * Returns an unsubscribe function.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
