import type { Message } from '@opencode-ai/sdk';

export interface MessageRoleInfo {
    role: string;
    isUser: boolean;
}

export const deriveMessageRole = (
    messageInfo: Message | (Message & { clientRole?: string; userMessageMarker?: boolean }),
    pendingUserMessageIds: Set<string>
): MessageRoleInfo => {
    const info: any = messageInfo;
    const clientRole = info?.clientRole;
    const serverRole = info?.role;
    const userMarker = info?.userMessageMarker === true;

    const isUser =
        userMarker ||
        clientRole === 'user' ||
        serverRole === 'user' ||
        pendingUserMessageIds.has(info?.id) ||
        info?.origin === 'user' ||
        info?.source === 'user';

    if (isUser) {
        return {
            role: 'user',
            isUser: true,
        };
    }

    return {
        role: clientRole || serverRole || 'assistant',
        isUser: false,
    };
};
