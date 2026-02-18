import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { archiveSession, isSessionArchived } from '@/lib/archivedSessions';

const DAY_MS = 24 * 60 * 60 * 1000;
const AUTO_ARCHIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const getSessionLastActivity = (session: Session): number => {
  return session.time?.updated ?? session.time?.created ?? 0;
};

type BuildAutoArchiveCandidatesOptions = {
  sessions: Session[];
  currentSessionId: string | null;
  busySessionIds: Set<string>;
  now?: number;
};

export const buildAutoArchiveCandidates = ({
  sessions,
  currentSessionId,
  busySessionIds,
  now = Date.now(),
}: BuildAutoArchiveCandidatesOptions): Session[] => {
  if (!Array.isArray(sessions)) {
    return [];
  }

  const cutoffTime = now - DAY_MS;

  return sessions.filter((session) => {
    if (!session?.id) return false;
    // Don't archive current session
    if (session.id === currentSessionId) return false;
    // Don't archive shared sessions
    if (session.share) return false;
    // Don't archive busy sessions
    if (busySessionIds.has(session.id)) return false;
    // Only archive sessions inactive for 24+ hours
    const lastActivity = getSessionLastActivity(session);
    if (!lastActivity) return false;
    return lastActivity < cutoffTime;
  });
};

type ArchiveResult = {
  archivedIds: string[];
  skippedIds: string[];
  skippedReason?: 'loading' | 'cooldown' | 'no-candidates' | 'running';
};

type ArchiveOptions = {
  autoRun?: boolean;
};

export const useSessionAutoArchive = (options?: ArchiveOptions) => {
  const autoRun = options?.autoRun !== false;

  const sessions = useSessionStore((state) => state.sessions);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const isLoading = useSessionStore((state) => state.isLoading);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const getDirectoryForSession = useSessionStore((state) => state.getDirectoryForSession);

  const autoArchiveLastRunAt = useUIStore((state) => state.autoArchiveLastRunAt);
  const setAutoArchiveLastRunAt = useUIStore((state) => state.setAutoArchiveLastRunAt);

  const [isRunning, setIsRunning] = React.useState(false);
  const runningRef = React.useRef(false);

  const busySessionIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (sessionStatus) {
      sessionStatus.forEach((status, sessionId) => {
        if (status.type === 'busy' || status.type === 'retry') {
          ids.add(sessionId);
        }
      });
    }
    return ids;
  }, [sessionStatus]);

  const candidates = React.useMemo(() => {
    return buildAutoArchiveCandidates({
      sessions,
      currentSessionId,
      busySessionIds,
    });
  }, [currentSessionId, sessions, busySessionIds]);

  const runArchive = React.useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<ArchiveResult> => {
      if (runningRef.current) {
        return { archivedIds: [], skippedIds: [], skippedReason: 'running' };
      }

      if (isLoading) {
        return { archivedIds: [], skippedIds: [], skippedReason: 'loading' };
      }

      const now = Date.now();
      if (!force && autoArchiveLastRunAt && now - autoArchiveLastRunAt < AUTO_ARCHIVE_INTERVAL_MS) {
        return { archivedIds: [], skippedIds: [], skippedReason: 'cooldown' };
      }

      if (sessions.length === 0) {
        return { archivedIds: [], skippedIds: [], skippedReason: 'no-candidates' };
      }

      const candidateSessions = buildAutoArchiveCandidates({
        sessions,
        currentSessionId,
        busySessionIds,
        now,
      });

      if (candidateSessions.length === 0) {
        setAutoArchiveLastRunAt(now);
        return { archivedIds: [], skippedIds: [], skippedReason: 'no-candidates' };
      }

      runningRef.current = true;
      setIsRunning(true);
      try {
        const archivedIds: string[] = [];
        const skippedIds: string[] = [];

        for (const session of candidateSessions) {
          const directory = getDirectoryForSession(session.id);
          if (!directory) {
            skippedIds.push(session.id);
            continue;
          }

          // Skip if already archived
          if (isSessionArchived(session.id, directory)) {
            skippedIds.push(session.id);
            continue;
          }

          archiveSession(session.id, directory);
          archivedIds.push(session.id);
        }

        return { archivedIds, skippedIds };
      } finally {
        runningRef.current = false;
        setIsRunning(false);
        setAutoArchiveLastRunAt(Date.now());
      }
    },
    [
      autoArchiveLastRunAt,
      busySessionIds,
      currentSessionId,
      getDirectoryForSession,
      isLoading,
      sessions,
      setAutoArchiveLastRunAt,
    ]
  );

  React.useEffect(() => {
    if (!autoRun) {
      return;
    }
    if (isLoading || sessions.length === 0) {
      return;
    }
    const now = Date.now();
    if (autoArchiveLastRunAt && now - autoArchiveLastRunAt < AUTO_ARCHIVE_INTERVAL_MS) {
      return;
    }
    void runArchive();
  }, [autoArchiveLastRunAt, autoRun, isLoading, sessions.length, runArchive]);

  return {
    candidates,
    isRunning,
    runArchive,
  };
};
