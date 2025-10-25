import type { EditPermissionMode } from "../types/sessionTypes";

const EDIT_PERMISSION_TOOL_NAMES = new Set([
    'edit',
    'multiedit',
    'str_replace',
    'str_replace_based_edit_tool',
    'write',
]);

export const isEditPermissionType = (type?: string | null): boolean => {
    if (!type) {
        return false;
    }
    return EDIT_PERMISSION_TOOL_NAMES.has(type.toLowerCase());
};

const resolveConfigStore = () => {
    if (typeof window === 'undefined') {
        return undefined;
    }
    return (window as any).__zustand_config_store__;
};

const getAgentDefinition = (agentName?: string): any => {
    if (!agentName) {
        return undefined;
    }

    try {
        const configStore = resolveConfigStore();
        if (configStore?.getState) {
            const state = configStore.getState();
            return state.agents?.find?.((agent: any) => agent.name === agentName);
        }
    } catch (error) {
        // Ignore lookup errors and fall back to defaults
    }

    return undefined;
};

export const getAgentDefaultEditPermission = (agentName?: string): EditPermissionMode => {
    const agent = getAgentDefinition(agentName);
    if (!agent) {
        return 'ask';
    }

    const permission = agent.permission?.edit;
    if (permission === 'allow' || permission === 'ask' || permission === 'deny' || permission === 'full') {
        return permission;
    }

    const editToolEnabled = agent.tools ? (agent.tools as any).edit !== false : true;
    return editToolEnabled ? 'ask' : 'deny';
};