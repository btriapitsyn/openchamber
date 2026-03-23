import React from 'react';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { useSessionStore } from '@/stores/useSessionStore';

export const ChatView: React.FC = () => {
    const currentSessionId = useSessionStore((state) => state.currentSessionId);

    return (
        <ChatErrorBoundary sessionId={currentSessionId || undefined}>
            <ChatContainer />
        </ChatErrorBoundary>
    );
};
