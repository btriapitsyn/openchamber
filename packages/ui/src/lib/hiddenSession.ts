/**
 * Utility for creating hidden sessions that don't appear in the UI.
 * These sessions are used for background tasks like summarization.
 */

import { opencodeClient } from '@/lib/opencode/client';

// Set to track hidden session IDs
const hiddenSessionIds = new Set<string>();

/**
 * Check if a session is hidden
 */
export function isHiddenSession(sessionId: string): boolean {
  return hiddenSessionIds.has(sessionId);
}

/**
 * Mark a session as hidden
 */
export function markSessionAsHidden(sessionId: string): void {
  hiddenSessionIds.add(sessionId);
}

/**
 * Mark a session as visible (remove from hidden set)
 */
export function markSessionAsVisible(sessionId: string): void {
  hiddenSessionIds.delete(sessionId);
}

/**
 * Get all hidden session IDs
 */
export function getHiddenSessionIds(): string[] {
  return Array.from(hiddenSessionIds);
}

/**
 * Create a hidden session for background tasks.
 * The session won't appear in the UI session list.
 * 
 * @param title - Session title (will be prefixed with '[hidden]')
 * @returns The created session or null if creation failed
 */
export async function createHiddenSession(
  title: string
): Promise<{ id: string; title: string } | null> {
  try {
    // Create the session using the SDK
    // Note: The session will be created in the current directory context
    const session = await opencodeClient.createSession({
      title: `[hidden] ${title}`,
    });

    if (!session?.id) {
      console.error('[createHiddenSession] Failed to create session: no ID returned');
      return null;
    }

    // Mark it as hidden
    markSessionAsHidden(session.id);

    console.log(`[createHiddenSession] Created hidden session: ${session.id}`);
    return { id: session.id, title: session.title };
  } catch (error) {
    console.error('[createHiddenSession] Failed to create hidden session:', error);
    return null;
  }
}

/**
 * Delete a hidden session and clean up tracking
 */
export async function deleteHiddenSession(sessionId: string): Promise<void> {
  try {
    await opencodeClient.deleteSession(sessionId);
    markSessionAsVisible(sessionId);
    console.log(`[deleteHiddenSession] Deleted hidden session: ${sessionId}`);
  } catch (error) {
    console.error(`[deleteHiddenSession] Failed to delete session ${sessionId}:`, error);
    // Still remove from tracking even if delete failed
    markSessionAsVisible(sessionId);
  }
}
