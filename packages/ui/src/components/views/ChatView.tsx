import React from 'react';
import { ChatContainer } from '@/components/chat/ChatContainer';
import { ChatErrorBoundary } from '@/components/chat/ChatErrorBoundary';
import { AgentLoopStatusView, PlanSessionBar } from '@/components/agentloop';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';

export const ChatView: React.FC = () => {
    const currentSessionId = useSessionStore((state) => state.currentSessionId);

    const agentLoopId = useAgentLoopStore((state) => {
        if (!currentSessionId) return undefined;
        for (const loop of state.loops.values()) {
            if (loop.parentSessionId === currentSessionId) return loop.id;
        }
        return undefined;
    });

    const isPlanningSession = useAgentLoopStore((state) => {
        if (!currentSessionId) return false;
        return state.planningSessions.has(currentSessionId);
    });

    if (agentLoopId) {
        return <AgentLoopStatusView loopId={agentLoopId} />;
    }

    const planBar = isPlanningSession && currentSessionId
        ? <PlanSessionBar sessionId={currentSessionId} />
        : undefined;

    return (
        <ChatErrorBoundary sessionId={currentSessionId || undefined}>
            <ChatContainer aboveInput={planBar} />
        </ChatErrorBoundary>
    );
};
