import type { EditPermissionMode } from '@/stores/types/sessionTypes';

export type BashPermissionValue = 'allow' | 'ask' | 'deny';
export type BashPermissionSetting = BashPermissionValue | Record<string, BashPermissionValue | undefined>;
export type SimplePermissionValue = 'allow' | 'ask' | 'deny' | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isBashPermissionMap = (value: unknown): value is Record<string, BashPermissionValue | undefined> => {
    return isRecord(value);
};

const hasBashAskEntry = (permission?: BashPermissionSetting): boolean => {
    if (!permission) {
        return false;
    }
    if (typeof permission === 'string') {
        return permission === 'ask';
    }
    if (isBashPermissionMap(permission)) {
        return Object.values(permission).some((value) => value === 'ask');
    }
    return false;
};

const hasBashDenyEntry = (permission?: BashPermissionSetting): boolean => {
    if (!permission) {
        return false;
    }
    if (typeof permission === 'string') {
        return permission === 'deny';
    }
    if (isBashPermissionMap(permission)) {
        return Object.values(permission).some((value) => value === 'deny');
    }
    return false;
};

export interface EditPermissionInputs {
    agentDefaultEditMode: EditPermissionMode;
    webfetchPermission?: SimplePermissionValue;
    bashPermission?: BashPermissionSetting;
}

export interface EditPermissionUIState {
    cascadeDefaultMode: EditPermissionMode;
    modeAvailability: Record<EditPermissionMode, boolean>;
    autoApproveAvailable: boolean;
    bashHasAsk: boolean;
    bashHasDeny: boolean;
    bashAllAllow: boolean;
    webfetchIsAllow: boolean;
    webfetchNotDeny: boolean;
}

export const calculateEditPermissionUIState = ({
    agentDefaultEditMode,
    webfetchPermission,
    bashPermission,
}: EditPermissionInputs): EditPermissionUIState => {
    const bashHasAsk = hasBashAskEntry(bashPermission);
    const bashHasDeny = hasBashDenyEntry(bashPermission);
    const bashAllAllow = !bashHasAsk && !bashHasDeny;

    const webfetchIsAllow = webfetchPermission === 'allow';
    const webfetchNotDeny = webfetchPermission !== 'deny';

    const editIsAllow = agentDefaultEditMode === 'allow' || agentDefaultEditMode === 'full';
    const editIsAsk = agentDefaultEditMode === 'ask';

    let cascadeDefaultMode: EditPermissionMode = agentDefaultEditMode;
    if (editIsAllow && webfetchIsAllow && bashAllAllow) {
        cascadeDefaultMode = 'full';
    } else if (editIsAllow && bashHasAsk) {
        cascadeDefaultMode = 'allow';
    } else if (editIsAsk) {
        cascadeDefaultMode = 'ask';
    }

    const modeAvailability: Record<EditPermissionMode, boolean> = {
        ask: editIsAsk,
        allow: editIsAsk || (editIsAllow && bashHasAsk),
        full: agentDefaultEditMode !== 'deny' && webfetchNotDeny && bashHasAsk,
        deny: false,
    };

    const autoApproveAvailable = modeAvailability.allow || modeAvailability.full;

    return {
        cascadeDefaultMode,
        modeAvailability,
        autoApproveAvailable,
        bashHasAsk,
        bashHasDeny,
        bashAllAllow,
        webfetchIsAllow,
        webfetchNotDeny,
    };
};
