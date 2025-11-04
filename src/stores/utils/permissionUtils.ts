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
    return (window as { __zustand_config_store__?: { getState?: () => { agents?: Array<{ name: string; permission?: { edit?: string }; tools?: { edit?: boolean } }> } } }).__zustand_config_store__;
};

const getAgentDefinition = (agentName?: string): { name: string; permission?: { edit?: string }; tools?: { edit?: boolean } } | undefined => {
    if (!agentName) {
        return undefined;
    }

    try {
        const configStore = resolveConfigStore();
        if (configStore?.getState) {
            const state = configStore.getState();
            return state.agents?.find?.((agent: { name: string; permission?: { edit?: string }; tools?: { edit?: boolean } }) => agent.name === agentName);
        }
    } catch {
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

    const editToolEnabled = agent.tools ? agent.tools.edit !== false : true;
    return editToolEnabled ? 'ask' : 'deny';
};