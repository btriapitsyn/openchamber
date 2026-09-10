import { create } from 'zustand';
import type { Session } from '@opencode-ai/sdk/v2';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { getBtwSessionID } from '@/lib/sessionBtwMetadata';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore, type SessionRetentionAction } from '@/stores/useUIStore';
import { useSessionUIStore } from './session-ui-store';
import { useGlobalSessionStatusStore } from './global-session-status';
import { archiveSession, deleteSession } from './session-actions';

const DAY_MS = 86_400_000;
export const RETENTION_KEEP_RECENT = 5;
export const RETENTION_INTERVAL_MS = DAY_MS;

const isOlderThanCutoff = (session: Session, cutoff: number): boolean => {
  const lastActivity = session.time.updated ?? session.time.created;
  return Number.isFinite(lastActivity) && lastActivity > 0 && lastActivity < cutoff;
};

type CandidateOptions = {
  sessions: readonly Session[];
  currentSessionId: string | null;
  cutoffDays: number;
  action: SessionRetentionAction;
  activeSessionIds: ReadonlySet<string>;
  now?: number;
};

/** Archived sessions are retained, including when deletion would reach them through a parent. */
export function buildSessionRetentionCandidates({
  sessions, currentSessionId, cutoffDays, action, activeSessionIds, now = Date.now(),
}: CandidateOptions): string[] {
  if (!Number.isFinite(cutoffDays) || cutoffDays < 1) return [];
  const cutoff = now - cutoffDays * DAY_MS;
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const sorted = sessions.filter((session) => !session.time.archived)
    .sort((a, b) => b.time.updated - a.time.updated);
  const protectedIds = new Set(sorted.slice(0, RETENTION_KEEP_RECENT).map((session) => session.id));
  for (const session of sessions) {
    if (session.time.archived || session.share || getBtwSessionID(session) || session.id === currentSessionId
      || activeSessionIds.has(session.id) || !isOlderThanCutoff(session, cutoff)) {
      protectedIds.add(session.id);
    }
  }
  if (action === 'delete') {
    // OpenCode deletes the whole subtree. Protect every ancestor of a retained session.
    for (const id of protectedIds) {
      const parentId = byId.get(id)?.parentID;
      if (parentId) protectedIds.add(parentId);
    }
  }
  const candidates = sorted.filter((session) => !protectedIds.has(session.id));
  if (action === 'archive') return candidates.map((session) => session.id);

  // Children first: each request deletes one eligible session, and a failed child
  // can prevent its parent from bypassing that failure with a cascading delete.
  const ids = new Set(candidates.map((session) => session.id));
  const childrenLeft = new Map<string, number>();
  for (const session of candidates) {
    if (session.parentID && ids.has(session.parentID)) {
      childrenLeft.set(session.parentID, (childrenLeft.get(session.parentID) ?? 0) + 1);
    }
  }
  const ordered = candidates.filter((session) => !childrenLeft.has(session.id)).map((session) => session.id);
  for (let index = 0; index < ordered.length; index += 1) {
    const parentId = byId.get(ordered[index])?.parentID;
    if (!parentId || !ids.has(parentId)) continue;
    const remaining = (childrenLeft.get(parentId) ?? 0) - 1;
    childrenLeft.set(parentId, remaining);
    if (remaining === 0) ordered.push(parentId);
  }
  // Cyclic/malformed hierarchies never become leaves and cannot be deleted.
  return ordered;
}

type SessionRetentionResult = {
  completedIds: string[];
  failedIds: string[];
  action: SessionRetentionAction;
  skippedReason?: 'disabled' | 'loading' | 'cooldown' | 'no-candidates' | 'running' | 'runtime-changed';
};

// Shared by the app's automatic runner and every Settings mount. Acquire before any await.
export const useSessionRetentionRunStore = create(() => ({ isRunning: false }));

export async function runSessionRetentionCleanup({ force = false } = {}): Promise<SessionRetentionResult> {
  const settings = useUIStore.getState();
  const action = settings.sessionRetentionAction;
  const result: SessionRetentionResult = { completedIds: [], failedIds: [], action };
  if (useSessionRetentionRunStore.getState().isRunning) return { ...result, skippedReason: 'running' };
  if (!Number.isFinite(settings.autoDeleteAfterDays) || settings.autoDeleteAfterDays < 1
    || (!force && !settings.autoDeleteEnabled)) return { ...result, skippedReason: 'disabled' };
  if (!force && useSessionUIStore.getState().isLoading) return { ...result, skippedReason: 'loading' };
  const now = Date.now();
  if (!force && settings.autoDeleteLastRunAt && now - settings.autoDeleteLastRunAt < RETENTION_INTERVAL_MS) {
    return { ...result, skippedReason: 'cooldown' };
  }

  const runtimeKey = getRuntimeKey();
  let runtimeChanged = false;
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => { runtimeChanged = true; });
  const isCurrentRuntime = () => !runtimeChanged && getRuntimeKey() === runtimeKey;
  useSessionRetentionRunStore.setState({ isRunning: true });
  try {
    await useGlobalSessionsStore.getState().loadSessions();
    if (!isCurrentRuntime()) return { ...result, skippedReason: 'runtime-changed' };
    if (useGlobalSessionsStore.getState().status !== 'ready') {
      throw new Error('Session retention requires a complete session list');
    }
    const candidateIds = buildSessionRetentionCandidates({
      sessions: [...useGlobalSessionsStore.getState().entityById.values()],
      currentSessionId: useSessionUIStore.getState().currentSessionId,
      cutoffDays: settings.autoDeleteAfterDays,
      action,
      activeSessionIds: useGlobalSessionStatusStore.getState().activeSessionIds,
      now,
    });
    if (candidateIds.length === 0) return { ...result, skippedReason: 'no-candidates' };

    const failedIds = new Set<string>();
    let archivedSnapshot: readonly Session[] | undefined;
    let archivedParentIds = new Set<string>();
    for (const [index, id] of candidateIds.entries()) {
      if (!isCurrentRuntime()) {
        result.failedIds.push(...candidateIds.slice(index));
        break;
      }
      const state = useGlobalSessionsStore.getState();
      const session = state.entityById.get(id);
      if (!session) continue;
      if (session.time.archived || session.share || getBtwSessionID(session) || session.id === useSessionUIStore.getState().currentSessionId
        || useGlobalSessionStatusStore.getState().activeSessionIds.has(id)
        || !isOlderThanCutoff(session, now - settings.autoDeleteAfterDays * DAY_MS)) continue;
      if (action === 'delete') {
        if (archivedSnapshot !== state.archivedSessions) {
          archivedSnapshot = state.archivedSessions;
          archivedParentIds = new Set(archivedSnapshot.flatMap((archived) => archived.parentID ? [archived.parentID] : []));
        }
        // Planned children ran first. Any child still present either failed,
        // became protected, or arrived mid-run. Never delete it via its parent.
        const children = state.structure.activeChildrenByParentId.get(id) ?? [];
        if (children.length > 0 || archivedParentIds.has(id)) {
          if (children.some((childId) => failedIds.has(childId))) {
            failedIds.add(id);
            result.failedIds.push(id);
          }
          continue;
        }
      }
      if (!resolveGlobalSessionDirectory(session)) {
        failedIds.add(id);
        result.failedIds.push(id);
        continue;
      }
      const completed = action === 'archive'
        ? await archiveSession(id, runtimeKey)
        : await deleteSession(id, { expectedRuntimeKey: runtimeKey });
      if (completed) result.completedIds.push(id);
      else {
        failedIds.add(id);
        result.failedIds.push(id);
      }
    }
    return result;
  } finally {
    if (isCurrentRuntime()) settings.setAutoDeleteLastRunAt(Date.now());
    unsubscribe();
    useSessionRetentionRunStore.setState({ isRunning: false });
  }
}
