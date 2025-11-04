import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import type { Permission, PermissionResponse } from "@/types/permission";
import { isEditPermissionType, getAgentDefaultEditPermission } from "./utils/permissionUtils";
import { getSafeStorage } from "./utils/safeStorage";
import { useMessageStore } from "./messageStore";

interface PermissionState {
    permissions: Map<string, Permission[]>; // sessionId -> permissions
}

interface PermissionActions {
    addPermission: (permission: Permission, contextData?: { currentAgentContext?: Map<string, string>, sessionAgentSelections?: Map<string, string>, getSessionAgentEditMode?: (sessionId: string, agentName: string | undefined) => string }) => void;
    respondToPermission: (sessionId: string, permissionId: string, response: PermissionResponse) => Promise<void>;
}

type PermissionStore = PermissionState & PermissionActions;

export const usePermissionStore = create<PermissionStore>()(
    devtools(
        persist(
            (set, get) => ({
                // Initial State
                permissions: new Map(),

                // Add permission request
                addPermission: (permission: Permission, contextData?: { currentAgentContext?: Map<string, string>, sessionAgentSelections?: Map<string, string>, getSessionAgentEditMode?: (sessionId: string, agentName: string | undefined) => string }) => {
                    const sessionId = permission.sessionID;
                    if (!sessionId) {
                        return;
                    }

                    const permissionType = permission.type?.toLowerCase?.() ?? null;

                    let agentName = contextData?.currentAgentContext?.get(sessionId);
                    if (!agentName) {
                        agentName = contextData?.sessionAgentSelections?.get(sessionId) ?? undefined;
                    }
                    if (!agentName) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const configStore = (window as any).__zustand_config_store__;
                            if (configStore?.getState) {
                                agentName = configStore.getState().currentAgentName;
                            }
                        } catch {
                            // Ignore lookup failure and fall back to defaults
                        }
                    }

                    const defaultMode = getAgentDefaultEditPermission(agentName);
                    const effectiveMode = contextData?.getSessionAgentEditMode?.(sessionId, agentName) ?? defaultMode;

                    const shouldAutoApprove = effectiveMode === 'full'
                        || (effectiveMode === 'allow' && isEditPermissionType(permissionType));

                    if (shouldAutoApprove) {
                        get().respondToPermission(sessionId, permission.id, 'once').catch(() => {
                            // Swallow auto-response errors – user can still respond manually if needed
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

                // Respond to permission request
                respondToPermission: async (sessionId: string, permissionId: string, response: PermissionResponse) => {
                    await opencodeClient.respondToPermission(sessionId, permissionId, response);

                    // If rejecting, abort the operation (same behavior as abort button)
                    if (response === 'reject') {
                        const messageStore = useMessageStore.getState();
                        // Use the abort operation which properly marks message as aborted
                        await messageStore.abortCurrentOperation(sessionId);
                    }

                    // Remove permission from store after responding
                    set((state) => {
                        const sessionPermissions = state.permissions.get(sessionId) || [];
                        const updatedPermissions = sessionPermissions.filter((p) => p.id !== permissionId);
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                merge: (persistedState: any, currentState) => ({
                    ...currentState,
                    ...(persistedState as object),
                    permissions: new Map(persistedState?.permissions || []),
                }),
            }
        ),
        {
            name: "permission-store",
        }
    )
);
