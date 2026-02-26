import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  AgentLoopInstance,
  AgentLoopStatus,
  StartAgentLoopParams,
  Workpackage,
  WorkpackageFile,
  WorkpackageStatus,
} from '@/types/agentloop';
import { validateWorkpackageFile } from '@/types/agentloop';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from './sessionStore';
import { useMessageStore } from './messageStore';

/**
 * Agent Loop Store
 *
 * Manages sequential execution of workpackages through OpenCode sessions.
 * Each workpackage gets its own session (as a child of a "root" session).
 * The store subscribes to session status changes to detect completion
 * and automatically advance to the next workpackage.
 */

/** Status of a planning session */
export type PlanningSessionStatus = 'planning' | 'validating' | 'done' | 'failed';

/** Tracks a session created to generate a workpackage plan */
export interface PlanningSession {
  sessionId: string;
  goal: string;
  status: PlanningSessionStatus;
  /** Validated workpackage file (set when status is 'done') */
  workpackageFile?: WorkpackageFile;
  error?: string;
  /** How many times we've reprompted for valid JSON */
  repromptCount: number;
  /** Provider + model used, so we can reprompt with the same config */
  providerID: string;
  modelID: string;
  agent?: string;
}

/** Parameters for starting a planning session */
export interface StartPlanningSessionParams {
  goal: string;
  providerID: string;
  modelID: string;
  agent?: string;
}

interface AgentLoopState {
  /** All agent loop instances (keyed by loop ID) */
  loops: Map<string, AgentLoopInstance>;
  /** Active planning sessions (keyed by sessionId) */
  planningSessions: Map<string, PlanningSession>;
  /** Whether a loop is currently being created */
  isCreating: boolean;
  /** Error from the last operation */
  error: string | null;
}

interface AgentLoopActions {
  /** Start a new agent loop from a workpackage file */
  startLoop: (params: StartAgentLoopParams) => Promise<string | null>;
  /** Pause the loop (stops advancing to the next workpackage) */
  pauseLoop: (loopId: string) => void;
  /** Resume a paused loop */
  resumeLoop: (loopId: string) => void;
  /** Skip the current workpackage and move to the next */
  skipCurrent: (loopId: string) => void;
  /** Stop the loop entirely */
  stopLoop: (loopId: string) => void;
  /** Called when a session transitions to idle — advances the loop */
  onSessionCompleted: (sessionId: string) => void;
  /** Clear error */
  clearError: () => void;
  /** Get a loop instance by ID */
  getLoop: (loopId: string) => AgentLoopInstance | undefined;
  /** Get loop instance by parent session ID */
  getLoopByParentSession: (sessionId: string) => AgentLoopInstance | undefined;
  /** Get loop instance that contains a specific child session */
  getLoopByChildSession: (sessionId: string) => AgentLoopInstance | undefined;
  /** Record activity for a running subsession (heartbeat) */
  recordHeartbeat: (sessionId: string) => void;
  /** Check all running loops for stalled subsessions and restart or error them */
  checkForStalledSessions: () => void;
  /** Update model/agent config on an existing loop (applies to new sessions only) */
  updateLoopConfig: (loopId: string, patch: Pick<Partial<AgentLoopInstance>, 'providerID' | 'modelID' | 'agent'>) => void;

  // Planning session actions
  /** Start a session to generate a workpackage plan from a goal description */
  startPlanningSession: (params: StartPlanningSessionParams) => Promise<string | null>;
  /** Called when a planning session goes idle — reads the workpackage file and validates it */
  onPlanningSessionCompleted: (sessionId: string) => Promise<void>;
  /** Dismiss/remove a planning session from tracking */
  dismissPlanningSession: (sessionId: string) => void;
  /** Get a planning session by its session ID */
  getPlanningSession: (sessionId: string) => PlanningSession | undefined;
  /** Start an agent loop from a completed planning session */
  implementPlan: (sessionId: string, extras?: { systemPrompt?: string }) => Promise<string | null>;
  /**
   * Re-register (or refresh) a planning session after a page refresh.
   * Called by the detector hook for sessions whose title starts with "[Plan]".
   */
  registerOrRefreshPlanningSession: (
    sessionId: string,
    sessionTitle: string,
    isSessionBusy: boolean,
  ) => Promise<void>;
  /**
   * Re-register (or refresh) an agent loop after a page refresh.
   * Called by the detector hook for sessions whose title starts with "[Loop]".
   */
  registerOrRefreshLoopSession: (
    parentSessionId: string,
    sessionTitle: string,
    childSessions: { id: string; title: string; isBusy: boolean }[],
  ) => Promise<void>;
}

type AgentLoopStore = AgentLoopState & AgentLoopActions;

/** Generate a unique loop ID */
const generateLoopId = (): string =>
  `loop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Delay before advancing to the next workpackage to avoid overwhelming the server */
const TASK_ADVANCEMENT_DELAY_MS = 2000;

const VALID_PRESERVED_STATUSES = new Set<string>(['completed', 'failed', 'skipped']);

/** Max auto-reprompt attempts if the model outputs invalid JSON */
const MAX_REPROMPT_ATTEMPTS = 2;

/** How long a subsession can go without activity before being considered stalled */
const HEARTBEAT_STALL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/** Maximum number of times a stalled workpackage will be restarted before erroring the loop */
const MAX_STALL_RETRIES = 3;

/**
 * Ephemeral map tracking the last known message-part count per session.
 * Used by heartbeat checks to detect real message activity independently
 * of status polling. Not stored in Zustand to avoid unnecessary re-renders.
 */
const lastKnownPartCounts = new Map<string, number>();

/** Count total message parts for a session from the message store */
function getSessionPartCount(sessionId: string): number {
  const messages = useMessageStore.getState().messages.get(sessionId);
  if (!messages) return 0;
  let count = 0;
  for (const msg of messages) {
    count += msg.parts.length;
  }
  return count;
}

/** Permission ruleset that allows all operations without prompting */
const ALLOW_ALL_PERMISSIONS = [
  { permission: '*' as const, pattern: '*' as const, action: 'allow' as const },
];

/** The filename the planning agent always writes the workpackage plan to */
export const WORKPACKAGE_FILENAME = 'workpackage.json';

/** Prompt template for generating a workpackage plan */
export const PLAN_GENERATION_PROMPT = `You are a project planning assistant. The user wants to accomplish the following:

{USER_GOAL}

Your job:
1. Analyse the codebase to understand its structure and conventions.
2. Produce a detailed workpackage plan as JSON matching the schema below.
3. Write the plan to the file \`workpackage.json\` in the project root using the write-file tool — do NOT print the JSON to the chat.
4. Once the file is saved, reply with a short confirmation, e.g. "Plan saved — N tasks ready."

JSON schema for the file:
{
  "name": "Short human-readable plan name",
  "workpackages": [
    {
      "id": "unique-kebab-case-id",
      "title": "Short task title",
      "description": "Full context needed for an AI agent to complete this task independently.",
      "status": "pending"
    }
  ]
}

Rules:
- Break work into small, focused tasks each completable independently
- Include enough context in each description so an agent can work without the others
- Order tasks so dependencies come first
- Use descriptive kebab-case IDs (e.g. "setup-database", "add-auth-middleware")
- All statuses must be "pending"`;

/** Prompt sent when the plan file was not found or was invalid */
const REPROMPT_WRITE_FILE = `The workpackage plan was not found. Please write it now to \`workpackage.json\` in the project root using the write-file tool with the following structure (all statuses "pending"):

{
  "name": "Short plan name",
  "workpackages": [
    {
      "id": "unique-kebab-id",
      "title": "Task title",
      "description": "Full task description",
      "status": "pending"
    }
  ]
}

After writing, reply with a short confirmation.`;

/**
 * Build the prompt for a single workpackage, optionally prepending
 * a system prompt.
 */
const buildTaskPrompt = (
  wp: Workpackage,
  loop: { workpackages: Workpackage[]; workpackageFile?: WorkpackageFile },
  systemPrompt?: string,
): string => {
  const parts: string[] = [];
  if (systemPrompt && systemPrompt.trim()) {
    parts.push(systemPrompt.trim());
  }
  parts.push(`## Task: ${wp.title}\n\n${wp.description}`);

  // If we know the workpackage file path, tell the agent to update it on completion
  const filePath = loop.workpackageFile?.filePath;
  if (filePath) {
    parts.push(
      `## Progress tracking\n\nOnce you have fully completed the task above, update \`${filePath}\` by changing the \`"status"\` field for workpackage id \`"${wp.id}"\` from \`"pending"\` (or \`"running"\`) to \`"completed"\`.`
    );
  }

  return parts.join('\n\n');
};

/**
 * Normalise a workpackage file's tasks so they all have valid statuses.
 * Preserves completed/failed/skipped statuses from previously-run files;
 * everything else (including 'running') resets to 'pending'.
 */
const normalizeWorkpackages = (file: WorkpackageFile): Workpackage[] =>
  file.workpackages.map((wp) => ({
    ...wp,
    status: wp.status && VALID_PRESERVED_STATUSES.has(wp.status) ? wp.status : 'pending',
    sessionId: wp.sessionId ?? undefined,
    error: wp.error ?? undefined,
  }));

/**
 * Search through all fields of an object for a string value that looks like
 * a file path ending in the target filename.
 */
function findPathInObject(obj: Record<string, unknown>, target: string): string | null {
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' && val.length < 500) {
      if (
        val === target ||
        val.endsWith(`/${target}`) ||
        val.endsWith(`\\${target}`)
      ) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Search through all fields of an object for a string that parses as valid
 * workpackage JSON.
 */
function findWorkpackageJsonInObject(obj: Record<string, unknown>): unknown | null {
  for (const val of Object.values(obj)) {
    if (typeof val !== 'string' || val.length < 10) continue;
    try {
      const parsed = JSON.parse(val);
      if (validateWorkpackageFile(parsed)) return parsed;
    } catch {
      // not JSON
    }
  }
  return null;
}

/**
 * Extract the workpackage plan from the tool call parts in a session's messages.
 *
 * When the AI writes workpackage.json via a tool, the tool call part contains
 * both the file path and the file content somewhere in its state/input.
 * This function searches broadly across ALL tool parts to find a write to
 * workpackage.json regardless of the exact tool name or input shape.
 */
function extractWorkpackageFromToolCalls(sessionId: string): WorkpackageFile | null {
  const messages = useMessageStore.getState().messages.get(sessionId);
  if (!messages || messages.length === 0) {
    console.warn('[AgentLoop] extractWorkpackageFromToolCalls: no messages for session', sessionId);
    return null;
  }

  // Walk messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.info?.role !== 'assistant') continue;

    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (p.type !== 'tool') continue;

      // Look in both p.state.input and p itself for the data
      const state = (p.state ?? {}) as Record<string, unknown>;
      const input = (state.input ?? {}) as Record<string, unknown>;
      const metadata = (state.metadata ?? {}) as Record<string, unknown>;

      // Search for the file path in input, metadata, and state
      const filePath =
        findPathInObject(input, WORKPACKAGE_FILENAME) ??
        findPathInObject(metadata, WORKPACKAGE_FILENAME) ??
        findPathInObject(state, WORKPACKAGE_FILENAME);

      // Also check metadata.files array (used by apply_patch)
      const metadataFilePath = (() => {
        if (!Array.isArray(metadata.files)) return null;
        for (const f of metadata.files) {
          if (!f || typeof f !== 'object') continue;
          const fp = findPathInObject(f as Record<string, unknown>, WORKPACKAGE_FILENAME);
          if (fp) return fp;
        }
        return null;
      })();

      const resolvedPath = filePath ?? metadataFilePath;
      if (!resolvedPath) continue;

      // Found a tool that references workpackage.json — now find the content
      const parsed =
        findWorkpackageJsonInObject(input) ??
        findWorkpackageJsonInObject(state);

      if (parsed && validateWorkpackageFile(parsed)) {
        console.info('[AgentLoop] Extracted workpackage from tool call:', resolvedPath);
        return { ...(parsed as WorkpackageFile), filePath: resolvedPath };
      }

      console.warn('[AgentLoop] Found tool referencing workpackage.json but content not extractable. Tool:', p.tool, 'State keys:', Object.keys(state));
    }
  }

  // Log all tool parts for debugging
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.info?.role !== 'assistant') continue;
    for (const part of msg.parts) {
      const p = part as Record<string, unknown>;
      if (p.type === 'tool') {
        const state = (p.state ?? {}) as Record<string, unknown>;
        const input = (state.input ?? {}) as Record<string, unknown>;
        console.warn('[AgentLoop] Tool part:', {
          tool: p.tool,
          stateKeys: Object.keys(state),
          inputKeys: Object.keys(input),
          inputValues: Object.fromEntries(
            Object.entries(input).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 100) : typeof v])
          ),
        });
      }
    }
  }

  console.warn('[AgentLoop] extractWorkpackageFromToolCalls: no matching tool call found');
  return null;
}

export const useAgentLoopStore = create<AgentLoopStore>()(
  devtools(
    (set, get) => ({
      loops: new Map(),
      planningSessions: new Map(),
      isCreating: false,
      error: null,

      getLoop: (loopId) => get().loops.get(loopId),

      getLoopByParentSession: (sessionId) => {
        for (const loop of get().loops.values()) {
          if (loop.parentSessionId === sessionId) return loop;
        }
        return undefined;
      },

      getLoopByChildSession: (sessionId) => {
        for (const loop of get().loops.values()) {
          if (loop.workpackages.some((wp) => wp.sessionId === sessionId)) return loop;
        }
        return undefined;
      },

      recordHeartbeat: (sessionId) => {
        const now = Date.now();
        for (const loop of get().loops.values()) {
          if (loop.status !== 'running') continue;
          const wpIdx = loop.workpackages.findIndex(
            (wp) => wp.sessionId === sessionId && wp.status === 'running'
          );
          if (wpIdx === -1) continue;

          // Only update if the timestamp actually changes (avoid unnecessary renders)
          if (loop.lastActivityAt && now - loop.lastActivityAt < 5000) return;

          set((state) => {
            const updated = new Map(state.loops);
            updated.set(loop.id, { ...loop, lastActivityAt: now });
            return { loops: updated };
          });
          return;
        }
      },

      checkForStalledSessions: () => {
        const now = Date.now();
        for (const loop of get().loops.values()) {
          if (loop.status !== 'running') continue;

          const runningWpIdx = loop.workpackages.findIndex((wp) => wp.status === 'running');
          if (runningWpIdx === -1) continue;

          const wp = loop.workpackages[runningWpIdx];
          const sessionId = wp.sessionId;

          // Check message-level activity: if new parts arrived, the session is alive
          if (sessionId) {
            const currentCount = getSessionPartCount(sessionId);
            const lastCount = lastKnownPartCounts.get(sessionId) ?? 0;
            if (currentCount > lastCount) {
              lastKnownPartCounts.set(sessionId, currentCount);
              // Update lastActivityAt since we have proof of real work
              set((state) => {
                const current = state.loops.get(loop.id);
                if (!current) return state;
                const updated = new Map(state.loops);
                updated.set(loop.id, { ...current, lastActivityAt: now });
                return { loops: updated };
              });
              continue; // Not stalled
            }
          }

          const lastActivity = loop.lastActivityAt ?? loop.startedAt;
          const elapsed = now - lastActivity;

          if (elapsed < HEARTBEAT_STALL_TIMEOUT_MS) continue;

          const retryCount = wp.retryCount ?? 0;

          console.warn(
            `[AgentLoop] Heartbeat stall detected for workpackage "${wp.id}" in loop "${loop.id}". ` +
            `No activity for ${Math.round(elapsed / 1000)}s. Retry ${retryCount + 1}/${MAX_STALL_RETRIES}.`
          );

          if (retryCount >= MAX_STALL_RETRIES) {
            // Max retries exceeded — error the entire loop
            const errorMsg =
              `Task "${wp.title}" stalled ${MAX_STALL_RETRIES} times without making progress. ` +
              `The agent loop has been stopped.`;

            console.error(`[AgentLoop] ${errorMsg}`);

            const updatedWps = [...loop.workpackages];
            updatedWps[runningWpIdx] = {
              ...wp,
              status: 'failed',
              error: `Stalled after ${MAX_STALL_RETRIES} retries`,
            };

            set((state) => {
              const updated = new Map(state.loops);
              updated.set(loop.id, {
                ...loop,
                workpackages: updatedWps,
                status: 'error',
                error: errorMsg,
              });
              return { loops: updated };
            });

            // Best-effort abort the stalled session
            if (sessionId) {
              void opencodeClient.abortSession(sessionId).catch(() => {});
            }
            continue;
          }

          // Abort the stalled session and restart the workpackage
          const updatedWps = [...loop.workpackages];
          updatedWps[runningWpIdx] = {
            ...wp,
            status: 'pending',
            sessionId: undefined,
            error: undefined,
            retryCount: retryCount + 1,
          };

          set((state) => {
            const updated = new Map(state.loops);
            updated.set(loop.id, {
              ...loop,
              workpackages: updatedWps,
              lastActivityAt: now, // Reset so the retry gets a fresh window
            });
            return { loops: updated };
          });

          // Abort the old session, then re-execute
          const abortAndRestart = async () => {
            if (sessionId) {
              try {
                await opencodeClient.abortSession(sessionId);
              } catch {
                // Session may already be dead — that's fine
              }
            }
            // Small delay before restart to let the server settle
            await new Promise((r) => setTimeout(r, TASK_ADVANCEMENT_DELAY_MS));
            void executeWorkpackage(loop.id, runningWpIdx);
          };

          void abortAndRestart();
        }
      },

      clearError: () => set({ error: null }),

      // ── Planning session actions ──────────────────────────────────────────

      getPlanningSession: (sessionId) => get().planningSessions.get(sessionId),

      startPlanningSession: async ({ goal, providerID, modelID, agent }) => {
        try {
          const shortGoal = goal.trim().slice(0, 60);
          const session = await opencodeClient.createSession({
            title: `[Plan] ${shortGoal}${goal.trim().length > 60 ? '...' : ''}`,
          });

          const planning: PlanningSession = {
            sessionId: session.id,
            goal: goal.trim(),
            status: 'planning',
            repromptCount: 0,
            providerID,
            modelID,
            agent,
          };

          set((state) => {
            const next = new Map(state.planningSessions);
            next.set(session.id, planning);
            return { planningSessions: next };
          });

          try {
            await useSessionStore.getState().loadSessions();
          } catch {
            // Ignore
          }

          const prompt = PLAN_GENERATION_PROMPT.replace('{USER_GOAL}', goal.trim());
          await opencodeClient.sendMessage({
            id: session.id,
            providerID,
            modelID,
            text: prompt,
            agent: agent || undefined,
          });

          return session.id;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to start planning session' });
          return null;
        }
      },

      onPlanningSessionCompleted: async (sessionId) => {
        const state = get();
        const ps = state.planningSessions.get(sessionId);
        if (!ps || ps.status !== 'planning') return;

        // Mark as validating so we don't process it multiple times
        set((s) => {
          const next = new Map(s.planningSessions);
          next.set(sessionId, { ...ps, status: 'validating' });
          return { planningSessions: next };
        });

        try {
          // Extract the workpackage data directly from the write tool call in messages
          const result = extractWorkpackageFromToolCalls(sessionId);

          if (result) {
            set((s) => {
              const next = new Map(s.planningSessions);
              next.set(sessionId, {
                ...ps,
                status: 'done',
                workpackageFile: result,
                repromptCount: ps.repromptCount,
              });
              return { planningSessions: next };
            });
            return;
          }

          // File not found / invalid — reprompt or fail
          if (ps.repromptCount < MAX_REPROMPT_ATTEMPTS) {
            set((s) => {
              const next = new Map(s.planningSessions);
              next.set(sessionId, { ...ps, status: 'planning', repromptCount: ps.repromptCount + 1 });
              return { planningSessions: next };
            });
            await opencodeClient.sendMessage({
              id: sessionId,
              providerID: ps.providerID,
              modelID: ps.modelID,
              text: REPROMPT_WRITE_FILE,
              agent: ps.agent || undefined,
            });
          } else {
            set((s) => {
              const next = new Map(s.planningSessions);
              next.set(sessionId, {
                ...ps,
                status: 'failed',
                error: `Could not find a valid ${WORKPACKAGE_FILENAME} after writing. Check that the file was created in the project root.`,
              });
              return { planningSessions: next };
            });
          }
        } catch (error) {
          set((s) => {
            const next = new Map(s.planningSessions);
            next.set(sessionId, {
              ...ps,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Failed to validate plan',
            });
            return { planningSessions: next };
          });
        }
      },

      registerOrRefreshPlanningSession: async (sessionId, sessionTitle, isSessionBusy) => {
        const existing = get().planningSessions.get(sessionId);
        // Already tracked and not stale — skip
        if (existing && existing.status !== 'planning') return;

        if (isSessionBusy) {
          // Session is still running — register as 'planning' if not already tracked
          if (!existing) {
            const goal = sessionTitle.replace(/^\[Plan\]\s*/, '').replace(/\.{3}$/, '');
            const ps: PlanningSession = {
              sessionId,
              goal,
              status: 'planning',
              repromptCount: 0,
              providerID: '',
              modelID: '',
            };
            set((s) => {
              const next = new Map(s.planningSessions);
              next.set(sessionId, ps);
              return { planningSessions: next };
            });
          }
          return;
        }

        // Session is idle — try to extract the workpackage from tool call parts
        const result = extractWorkpackageFromToolCalls(sessionId);
        const goal = sessionTitle.replace(/^\[Plan\]\s*/, '').replace(/\.{3}$/, '');

        const ps: PlanningSession = result
          ? {
              sessionId,
              goal,
              status: 'done',
              workpackageFile: result,
              repromptCount: 0,
              providerID: '',
              modelID: '',
            }
          : {
              sessionId,
              goal,
              status: 'failed',
              error: `Could not find ${WORKPACKAGE_FILENAME}. Try regenerating the plan.`,
              repromptCount: MAX_REPROMPT_ATTEMPTS,
              providerID: '',
              modelID: '',
            };

        set((s) => {
          const next = new Map(s.planningSessions);
          next.set(sessionId, ps);
          return { planningSessions: next };
        });
      },

      dismissPlanningSession: (sessionId) => {
        set((state) => {
          const next = new Map(state.planningSessions);
          next.delete(sessionId);
          return { planningSessions: next };
        });
      },

      implementPlan: async (sessionId, extras) => {
        const ps = get().planningSessions.get(sessionId);
        if (!ps || ps.status !== 'done' || !ps.workpackageFile) return null;

        const loopId = await get().startLoop({
          workpackageFile: ps.workpackageFile,
          providerID: ps.providerID,
          modelID: ps.modelID,
          agent: ps.agent,
          systemPrompt: extras?.systemPrompt,
        });

        if (loopId) {
          // Remove the planning session now that the loop is running
          get().dismissPlanningSession(sessionId);
        }

        return loopId;
      },

      // ── Loop session re-registration (page refresh) ─────────────────────

      registerOrRefreshLoopSession: async (parentSessionId, sessionTitle, childSessions) => {
        // Already tracked — skip
        for (const loop of get().loops.values()) {
          if (loop.parentSessionId === parentSessionId) return;
        }

        const loopName = sessionTitle.replace(/^\[Loop\]\s*/, '');

        // Parse child session titles: "Task N/Total: <title>"
        const TASK_TITLE_RE = /^Task (\d+)\/(\d+): (.+)$/;
        const parsedChildren = childSessions
          .map((child) => {
            const match = TASK_TITLE_RE.exec(child.title);
            if (!match) return null;
            return {
              index: parseInt(match[1], 10) - 1, // 0-based
              total: parseInt(match[2], 10),
              title: match[3],
              sessionId: child.id,
              isBusy: child.isBusy,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .sort((a, b) => a.index - b.index);

        const totalTasks = parsedChildren.length > 0
          ? Math.max(parsedChildren[0].total, parsedChildren.length)
          : 0;

        if (totalTasks === 0) return; // No recognisable child sessions

        // Try to read the workpackage file from disk for full descriptions
        let fileWorkpackages: WorkpackageFile | null = null;
        try {
          const raw = await opencodeClient.readLocalFile(WORKPACKAGE_FILENAME);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (validateWorkpackageFile(parsed)) {
              fileWorkpackages = parsed as WorkpackageFile;
            }
          }
        } catch {
          // File not available — reconstruct from sessions only
        }

        // Build workpackage list — merge file data with session data
        const workpackages: Workpackage[] = [];
        for (let i = 0; i < totalTasks; i++) {
          const child = parsedChildren.find((c) => c.index === i);
          const fileWp = fileWorkpackages?.workpackages[i];

          if (child) {
            // We have a child session for this task
            const wpStatus: WorkpackageStatus = child.isBusy
              ? 'running'
              : fileWp?.status && VALID_PRESERVED_STATUSES.has(fileWp.status)
                ? (fileWp.status as WorkpackageStatus)
                : 'completed';

            workpackages.push({
              id: fileWp?.id ?? `task-${i}`,
              title: fileWp?.title ?? child.title,
              description: fileWp?.description ?? child.title,
              status: wpStatus,
              sessionId: child.sessionId,
            });
          } else if (fileWp) {
            // No child session yet — use file data
            const wpStatus: WorkpackageStatus =
              fileWp.status && VALID_PRESERVED_STATUSES.has(fileWp.status)
                ? (fileWp.status as WorkpackageStatus)
                : 'pending';

            workpackages.push({
              id: fileWp.id,
              title: fileWp.title,
              description: fileWp.description,
              status: wpStatus,
            });
          } else {
            // Neither session nor file data — create placeholder
            workpackages.push({
              id: `task-${i}`,
              title: `Task ${i + 1}`,
              description: `Task ${i + 1}`,
              status: 'pending',
            });
          }
        }

        // Determine overall loop status
        const hasRunning = workpackages.some((wp) => wp.status === 'running');
        const hasPending = workpackages.some((wp) => wp.status === 'pending');
        const loopStatus: AgentLoopStatus = hasRunning
          ? 'running'
          : hasPending
            ? 'paused'
            : 'completed';

        const currentIndex = hasRunning
          ? workpackages.findIndex((wp) => wp.status === 'running')
          : hasPending
            ? workpackages.findIndex((wp) => wp.status === 'pending')
            : workpackages.length - 1;

        const loopId = generateLoopId();
        const instance: AgentLoopInstance = {
          id: loopId,
          name: loopName,
          status: loopStatus,
          workpackages,
          workpackageFile: fileWorkpackages
            ? { ...fileWorkpackages, filePath: WORKPACKAGE_FILENAME }
            : undefined,
          providerID: '',
          modelID: '',
          parentSessionId,
          currentIndex,
          startedAt: Date.now(),
        };

        set((state) => {
          const next = new Map(state.loops);
          next.set(loopId, instance);
          return { loops: next };
        });
      },

      // ─────────────────────────────────────────────────────────────────────

      startLoop: async (params) => {
        const { workpackageFile, providerID, modelID, agent, variant, systemPrompt } = params;

        set({ isCreating: true, error: null });

        try {
          const loopId = generateLoopId();
          const workpackages = normalizeWorkpackages(workpackageFile);

          // Find the first pending workpackage to start from
          const startIndex = workpackages.findIndex((wp) => wp.status === 'pending');
          if (startIndex === -1) {
            set({ error: 'All workpackages are already completed', isCreating: false });
            return null;
          }

          // Create a root/parent session for the agent loop
          const rootSession = await opencodeClient.createSession({
            title: `[Loop] ${workpackageFile.name}`,
          });

          const instance: AgentLoopInstance = {
            id: loopId,
            name: workpackageFile.name,
            status: 'running',
            workpackages,
            workpackageFile,
            providerID,
            modelID,
            agent,
            variant,
            systemPrompt,
            parentSessionId: rootSession.id,
            currentIndex: startIndex,
            startedAt: Date.now(),
          };

          set((state) => {
            const next = new Map(state.loops);
            next.set(loopId, instance);
            return { loops: next, isCreating: false };
          });

          // Refresh sessions so the root appears in the sidebar
          try {
            await useSessionStore.getState().loadSessions();
          } catch {
            // Ignore refresh errors
          }

          // Kick off the first workpackage
          void executeWorkpackage(loopId, startIndex);

          return loopId;
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to start agent loop',
            isCreating: false,
          });
          return null;
        }
      },

      pauseLoop: (loopId) => {
        set((state) => {
          const loop = state.loops.get(loopId);
          if (!loop || loop.status !== 'running') return state;
          const next = new Map(state.loops);
          next.set(loopId, { ...loop, status: 'paused' });
          return { loops: next };
        });
      },

      resumeLoop: (loopId) => {
        const loop = get().loops.get(loopId);
        if (!loop || loop.status !== 'paused') return;

        set((state) => {
          const updated = new Map(state.loops);
          updated.set(loopId, { ...loop, status: 'running' });
          return { loops: updated };
        });

        // Find the next pending task and run it
        const nextIndex = loop.workpackages.findIndex(
          (wp, i) => i >= loop.currentIndex && wp.status === 'pending'
        );
        if (nextIndex !== -1) {
          void executeWorkpackage(loopId, nextIndex);
        }
      },

      skipCurrent: (loopId) => {
        const loop = get().loops.get(loopId);
        if (!loop) return;

        const idx = loop.currentIndex;
        const wp = loop.workpackages[idx];
        if (!wp || wp.status !== 'running') return;

        // Mark as skipped
        const updatedWps = [...loop.workpackages];
        updatedWps[idx] = { ...wp, status: 'skipped' };

        const nextIndex = updatedWps.findIndex(
          (w, i) => i > idx && w.status === 'pending'
        );

        set((state) => {
          const updated = new Map(state.loops);
          updated.set(loopId, {
            ...loop,
            workpackages: updatedWps,
            currentIndex: nextIndex !== -1 ? nextIndex : idx,
            status: nextIndex === -1 ? 'completed' : loop.status,
          });
          return { loops: updated };
        });

        // Advance to next if the loop is running
        if (nextIndex !== -1 && loop.status === 'running') {
          void executeWorkpackage(loopId, nextIndex);
        }
      },

      stopLoop: (loopId) => {
        // Collect running session IDs before updating state so we can abort them
        const loop = get().loops.get(loopId);
        const runningSessionIds = loop
          ? loop.workpackages
              .filter((wp) => wp.status === 'running' && wp.sessionId)
              .map((wp) => wp.sessionId!)
          : [];

        set((state) => {
          const current = state.loops.get(loopId);
          if (!current) return state;

          // Clean up heartbeat tracking for all sessions in this loop
          for (const wp of current.workpackages) {
            if (wp.sessionId) lastKnownPartCounts.delete(wp.sessionId);
          }

          const updatedWps = current.workpackages.map((wp) =>
            wp.status === 'running' ? { ...wp, status: 'skipped' as const } : wp
          );

          const next = new Map(state.loops);
          next.set(loopId, { ...current, workpackages: updatedWps, status: 'stopped' });
          return { loops: next };
        });

        // Best-effort abort running sessions
        for (const sessionId of runningSessionIds) {
          void opencodeClient.abortSession(sessionId).catch(() => {});
        }
      },

      updateLoopConfig: (loopId, patch) => {
        set((state) => {
          const loop = state.loops.get(loopId);
          if (!loop) return state;
          const next = new Map(state.loops);
          next.set(loopId, { ...loop, ...patch });
          return { loops: next };
        });
      },

      onSessionCompleted: (sessionId) => {
        // Clean up heartbeat tracking for this session
        lastKnownPartCounts.delete(sessionId);

        // Perform the entire update atomically inside set() so we always
        // read the latest state and never overwrite a concurrent stop/pause.
        let shouldAdvance = false;
        let advanceLoopId = '';
        let advanceIndex = -1;

        set((prev) => {
          for (const loop of prev.loops.values()) {
            if (loop.status !== 'running') continue;
            const wpIdx = loop.workpackages.findIndex(
              (wp) => wp.sessionId === sessionId && wp.status === 'running'
            );
            if (wpIdx === -1) continue;

            // Found the matching loop + workpackage — update it
            const updatedWps = [...loop.workpackages];
            updatedWps[wpIdx] = { ...updatedWps[wpIdx], status: 'completed' };

            const nextIdx = updatedWps.findIndex(
              (wp, i) => i > wpIdx && wp.status === 'pending'
            );

            const isAllDone = nextIdx === -1;
            const newStatus: AgentLoopStatus = isAllDone ? 'completed' : 'running';

            const updated = new Map(prev.loops);
            updated.set(loop.id, {
              ...loop,
              workpackages: updatedWps,
              currentIndex: nextIdx !== -1 ? nextIdx : wpIdx,
              status: newStatus,
            });

            if (nextIdx !== -1) {
              shouldAdvance = true;
              advanceLoopId = loop.id;
              advanceIndex = nextIdx;
            }

            return { loops: updated };
          }
          return prev; // No matching loop found
        });

        // Advance to the next workpackage (outside set to avoid nested updates)
        if (shouldAdvance) {
          setTimeout(() => {
            void executeWorkpackage(advanceLoopId, advanceIndex);
          }, TASK_ADVANCEMENT_DELAY_MS);
        }
      },
    }),
    { name: 'agent-loop-store' }
  )
);

/**
 * Execute a specific workpackage by index within a loop.
 * Creates a child session and sends the task prompt.
 */
async function executeWorkpackage(loopId: string, wpIndex: number): Promise<void> {
  const store = useAgentLoopStore.getState();
  const loop = store.loops.get(loopId);
  if (!loop || loop.status !== 'running') return;

  const wp = loop.workpackages[wpIndex];
  if (!wp || wp.status !== 'pending') return;

  try {
    // Mark as running and set initial heartbeat timestamp
    updateWorkpackage(loopId, wpIndex, { status: 'running' });
    useAgentLoopStore.setState((state) => {
      const current = state.loops.get(loopId);
      if (!current) return state;
      const updated = new Map(state.loops);
      updated.set(loopId, { ...current, lastActivityAt: Date.now() });
      return { loops: updated };
    });

    // Create a child session under the root with all permissions allowed
    const session = await opencodeClient.createSession({
      title: `Task ${wpIndex + 1}/${loop.workpackages.length}: ${wp.title}`,
      parentID: loop.parentSessionId,
      permission: ALLOW_ALL_PERMISSIONS,
    });

    // Save the session ID to the workpackage
    updateWorkpackage(loopId, wpIndex, { sessionId: session.id });

    // Refresh sessions so the child appears in the sidebar
    try {
      await useSessionStore.getState().loadSessions();
    } catch {
      // Ignore
    }

    // Re-check: the loop may have been stopped while we were creating the session
    const freshLoop = useAgentLoopStore.getState().loops.get(loopId);
    if (!freshLoop || freshLoop.status !== 'running') return;

    // Build and send the prompt — read config from the latest loop state
    // so mid-loop model/agent changes are picked up.
    const prompt = buildTaskPrompt(wp, freshLoop, freshLoop.systemPrompt);

    await opencodeClient.sendMessage({
      id: session.id,
      providerID: freshLoop.providerID,
      modelID: freshLoop.modelID,
      text: prompt,
      agent: freshLoop.agent,
      variant: freshLoop.variant,
    });
  } catch (error) {
    console.warn('[AgentLoop] Failed to execute workpackage:', error);
    updateWorkpackage(loopId, wpIndex, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Try to advance to next
    const updatedLoop = useAgentLoopStore.getState().loops.get(loopId);
    if (updatedLoop && updatedLoop.status === 'running') {
      const nextIndex = updatedLoop.workpackages.findIndex(
        (w, i) => i > wpIndex && w.status === 'pending'
      );
      if (nextIndex !== -1) {
        void executeWorkpackage(loopId, nextIndex);
      } else {
        useAgentLoopStore.setState((state) => {
          const updated = new Map(state.loops);
          updated.set(loopId, { ...updatedLoop, status: 'completed' });
          return { loops: updated };
        });
      }
    }
  }
}

/**
 * Helper to update a single workpackage's fields within a loop.
 */
function updateWorkpackage(
  loopId: string,
  wpIndex: number,
  patch: Partial<Workpackage>
): void {
  useAgentLoopStore.setState((state) => {
    const loop = state.loops.get(loopId);
    if (!loop) return state;

    const updatedWps = [...loop.workpackages];
    updatedWps[wpIndex] = { ...updatedWps[wpIndex], ...patch };

    const updated = new Map(state.loops);
    updated.set(loopId, { ...loop, workpackages: updatedWps });
    return { loops: updated };
  });
}
