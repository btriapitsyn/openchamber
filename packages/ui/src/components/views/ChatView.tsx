import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { PaneRoot } from '@/components/panes/PaneRoot';

export const ChatView: React.FC = () => {
    const leftPaneSessionId = useSessionUIStore((state) => state.leftPaneSessionId);
    const rightPaneSessionId = useSessionUIStore((state) => state.rightPaneSessionId);
    const focusedPane = useSessionUIStore((state) => state.focusedPane);
    const draftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));

    // A pane is "occupied" when it has a session OR when a draft is attached to it.
    const leftOccupied = leftPaneSessionId !== null || (draftOpen && focusedPane === 'left');
    const rightOccupied = rightPaneSessionId !== null || (draftOpen && focusedPane === 'right');
    const isSplit = leftOccupied && rightOccupied;

    return (
        <div className="flex h-full w-full">
            <PaneRoot
                key="pane-left"
                pane="left"
                sessionId={leftPaneSessionId}
                isFocused={focusedPane === 'left'}
                showHeader={isSplit}
                showClose={isSplit}
            />
            {isSplit ? (
                <>
                    <div className="w-px flex-shrink-0 bg-border/60" aria-hidden />
                    <PaneRoot
                        key="pane-right"
                        pane="right"
                        sessionId={rightPaneSessionId}
                        isFocused={focusedPane === 'right'}
                        showHeader={true}
                        showClose={true}
                    />
                </>
            ) : null}
        </div>
    );
};
