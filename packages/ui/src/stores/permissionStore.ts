import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import type { PermissionRequest, PermissionResponse } from "@/types/permission";
import { isEditPermissionType, getAgentDefaultEditPermission } from "./utils/permissionUtils";
import { getSafeStorage } from "./utils/safeStorage";
import { useMessageStore } from "./messageStore";
import { useSessionStore } from "./sessionStore";

interface PermissionState {
    permissions: Map<string, PermissionRequest[]>;
}

interface PermissionActions {
    addPermission: (permission: PermissionRequest, contextData?: { currentAgentContext?: Map<string, string>, sessionAgentSelections?: Map<string, string>, getSessionAgentEditMode?: (sessionId: string, agentName: string | undefined) => string }) => void;
    respondToPermission: (sessionId: string, requestId: string, response: PermissionResponse) => Promise<void>;
}

type PermissionStore = PermissionState & PermissionActions;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const sanitizePermissionEntries = (value: unknown): Array<[string, PermissionRequest[]]> => {
    if (!Array.isArray(value)) {
        return [];
    }
    const entries: Array<[string, PermissionRequest[]]> = [];
    value.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
            return;
        }
        const [sessionId, permissions] = entry;
        if (typeof sessionId !== "string" || !Array.isArray(permissions)) {
            return;
        }
        entries.push([sessionId, permissions as PermissionRequest[]]);
    });
    return entries;
};

const executeWithPermissionDirectory = async <T>(sessionId: string, operation: () => Promise<T>): Promise<T> => {
    try {
        const sessionStore = useSessionStore.getState();
        const directory = sessionStore.getDirectoryForSession(sessionId);
        if (directory) {
            return opencodeClient.withDirectory(directory, operation);
        }
    } catch (error) {
        console.warn('Failed to resolve session directory for permission handling:', error);
    }
    return operation();
};

export const usePermissionStore = create<PermissionStore>()(
    devtools(
        persist(
            (set, get) => ({

                permissions: new Map(),

                addPermission: (permission: PermissionRequest, contextData?: { currentAgentContext?: Map<string, string>, sessionAgentSelections?: Map<string, string>, getSessionAgentEditMode?: (sessionId: string, agentName: string | undefined) => string }) => {
                    const sessionId = permission.sessionID;
                    if (!sessionId) {
                        return;
                    }

                    const existing = get().permissions.get(sessionId);
                    if (existing?.some((entry) => entry.id === permission.id)) {
                        return;
                    }

                    const permissionType = permission.permission?.toLowerCase?.() ?? null;

                    let agentName = contextData?.currentAgentContext?.get(sessionId);
                    if (!agentName) {
                        agentName = contextData?.sessionAgentSelections?.get(sessionId) ?? undefined;
                    }
                    if (!agentName) {
                        if (typeof window !== "undefined") {
                            const configStore = window.__zustand_config_store__;
                            if (configStore?.getState) {
                                agentName = configStore.getState().currentAgentName ?? undefined;
                            }
                        }
                    }

                    const defaultMode = getAgentDefaultEditPermission(agentName);
                    const effectiveMode = contextData?.getSessionAgentEditMode?.(sessionId, agentName) ?? defaultMode;

                    const shouldAutoApprove = (effectiveMode === 'allow' || effectiveMode === 'full')
                        && isEditPermissionType(permissionType);

                    if (shouldAutoApprove) {
                        get().respondToPermission(sessionId, permission.id, 'once').catch(() => {

                        });
                        return;
                    }

                    set((state) => {
                        const sessionPermissions = state.permissions.get(sessionId) || [];
                        const newPermissions = new Map(state.permissions);
                        newPermissions.set(sessionId, [...sessionPermissions, permission]);
                        return { permissions: newPermissions };
                    });
                },

                respondToPermission: async (sessionId: string, requestId: string, response: PermissionResponse) => {
                    await executeWithPermissionDirectory(sessionId, () => opencodeClient.replyToPermission(requestId, response));

                    if (response === 'reject') {
                        const messageStore = useMessageStore.getState();

                        await messageStore.abortCurrentOperation(sessionId);
                    }

                    set((state) => {
                        const sessionPermissions = state.permissions.get(sessionId) || [];
                        const updatedPermissions = sessionPermissions.filter((p) => p.id !== requestId);
                        const newPermissions = new Map(state.permissions);
                        newPermissions.set(sessionId, updatedPermissions);
                        return { permissions: newPermissions };
                    });
                },
            }),
            {
                name: "permission-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state) => ({
                    permissions: Array.from(state.permissions.entries()),
                }),
                merge: (persistedState, currentState) => {
                    if (!isRecord(persistedState)) {
                        return currentState;
                    }
                    const entries = sanitizePermissionEntries(persistedState.permissions);
                    return {
                        ...currentState,
                        permissions: new Map(entries),
                    };
                },
            }
        ),
        {
            name: "permission-store",
        }
    )
);
