import React, { useCallback, useState } from 'react';
import { RiChat3Line, RiCheckLine, RiSendPlaneLine, RiArrowDownSLine, RiArrowRightSLine, RiFileLine, RiRefreshLine, RiMagicLine, RiCheckboxMultipleLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useContextStore } from '@/stores/contextStore';
import { useUIStore } from '@/stores/useUIStore';
import { toast } from 'sonner';
import type { PrReviewThread, PrReviewComment } from '@/lib/api/types';

interface PrReviewSectionProps {
  threads: PrReviewThread[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const formatDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const CommentItem: React.FC<{ 
  comment: PrReviewComment; 
  onSendToAgent: (comment: PrReviewComment) => void;
  isSending: boolean;
}> = ({ comment, onSendToAgent, isSending }) => {
  return (
    <div className="flex flex-col gap-1.5 py-2 px-3 border-l-2 border-border/40 ml-2">
      <div className="flex items-center gap-2">
        <span className="typography-meta font-medium text-foreground">{comment.author.login}</span>
        {comment.createdAt && (
          <span className="typography-meta text-muted-foreground">{formatDate(comment.createdAt)}</span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 ml-auto"
          onClick={() => onSendToAgent(comment)}
          disabled={isSending}
        >
          <RiSendPlaneLine className="w-3.5 h-3.5 mr-1" />
          <span className="text-xs">Send to Agent</span>
        </Button>
      </div>
      <div className="typography-small text-foreground/90 whitespace-pre-wrap break-words">
        {comment.body}
      </div>
    </div>
  );
};

const ThreadItem: React.FC<{ 
  thread: PrReviewThread; 
  onSendToAgent: (comment: PrReviewComment, thread: PrReviewThread) => void;
  sendingCommentId: string | null;
}> = ({ thread, onSendToAgent, sendingCommentId }) => {
  const [isExpanded, setIsExpanded] = useState(!thread.isResolved);
  const firstComment = thread.comments[0];
  const path = firstComment?.path || 'Unknown file';
  const line = firstComment?.line;

  return (
    <li className="border-b border-border/40 last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/30 transition-colors text-left"
      >
        {isExpanded ? (
          <RiArrowDownSLine className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <RiArrowRightSLine className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        {thread.isResolved ? (
          <RiCheckLine className="w-4 h-4 text-green-500 flex-shrink-0" />
        ) : (
          <RiChat3Line className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        )}
        <RiFileLine className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="typography-small text-foreground truncate flex-1">{path}</span>
        {line && (
          <span className="typography-meta text-muted-foreground flex-shrink-0">L{line}</span>
        )}
        <span className="typography-meta text-muted-foreground flex-shrink-0">
          {thread.comments.length} {thread.comments.length === 1 ? 'comment' : 'comments'}
        </span>
      </button>
      {isExpanded && (
        <div className="pb-2">
          {thread.comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onSendToAgent={(c) => onSendToAgent(c, thread)}
              isSending={sendingCommentId === comment.id}
            />
          ))}
        </div>
      )}
    </li>
  );
};

export const PrReviewSection: React.FC<PrReviewSectionProps> = ({ threads, onRefresh, isRefreshing }) => {
  const [sendingCommentId, setSendingCommentId] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  
  const sendMessage = useSessionStore(state => state.sendMessage);
  const createSession = useSessionStore(state => state.createSession);
  const currentSessionId = useSessionStore(state => state.currentSessionId);
  const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore();
  const getSessionAgentSelection = useContextStore(state => state.getSessionAgentSelection);
  const getAgentModelForSession = useContextStore(state => state.getAgentModelForSession);
  const getAgentModelVariantForSession = useContextStore(state => state.getAgentModelVariantForSession);
  const setActiveMainTab = useUIStore(state => state.setActiveMainTab);

  const handleSendToAgent = useCallback(async (comment: PrReviewComment, thread: PrReviewThread) => {
    if (!currentSessionId) {
      toast.error('Select a session to send comment');
      return;
    }

    const sessionAgent = getSessionAgentSelection(currentSessionId) || currentAgentName;
    const sessionModel = sessionAgent ? getAgentModelForSession(currentSessionId, sessionAgent) : null;
    const effectiveProviderId = sessionModel?.providerId || currentProviderId;
    const effectiveModelId = sessionModel?.modelId || currentModelId;

    if (!effectiveProviderId || !effectiveModelId) {
      toast.error('Select a model to send comment');
      return;
    }

    const effectiveVariant = sessionAgent && effectiveProviderId && effectiveModelId
      ? getAgentModelVariantForSession(currentSessionId, sessionAgent, effectiveProviderId, effectiveModelId) ?? currentVariant
      : currentVariant;

    const location = comment.line ? `${comment.path}:${comment.line}` : comment.path;
    const resolvedStatus = thread.isResolved ? ' (resolved)' : '';
    
    const message = `PR Review Comment on \`${location}\`${resolvedStatus}:

**${comment.author.login}** wrote:
> ${comment.body.split('\n').join('\n> ')}

Please address this review comment.`;

    setSendingCommentId(comment.id);
    setActiveMainTab('chat');

    try {
      await sendMessage(
        message,
        effectiveProviderId,
        effectiveModelId,
        sessionAgent,
        undefined,
        undefined,
        undefined,
        effectiveVariant
      );
      toast.success('Sent to agent');
    } catch (e) {
      console.error('Failed to send comment to agent', e);
      toast.error('Failed to send comment');
    } finally {
      setSendingCommentId(null);
    }
  }, [currentSessionId, currentProviderId, currentModelId, currentAgentName, currentVariant, 
      sendMessage, setActiveMainTab, getSessionAgentSelection, getAgentModelForSession, getAgentModelVariantForSession]);

  const getEffectiveConfig = useCallback((sessionId: string | null) => {
    if (!sessionId) return { providerId: currentProviderId, modelId: currentModelId, agent: currentAgentName, variant: currentVariant };
    
    const sessionAgent = getSessionAgentSelection(sessionId) || currentAgentName;
    const sessionModel = sessionAgent ? getAgentModelForSession(sessionId, sessionAgent) : null;
    const effectiveProviderId = sessionModel?.providerId || currentProviderId;
    const effectiveModelId = sessionModel?.modelId || currentModelId;
    const effectiveVariant = sessionAgent && effectiveProviderId && effectiveModelId
      ? getAgentModelVariantForSession(sessionId, sessionAgent, effectiveProviderId, effectiveModelId) ?? currentVariant
      : currentVariant;
    
    return { providerId: effectiveProviderId, modelId: effectiveModelId, agent: sessionAgent, variant: effectiveVariant };
  }, [currentProviderId, currentModelId, currentAgentName, currentVariant, getSessionAgentSelection, getAgentModelForSession, getAgentModelVariantForSession]);

  const handleFixTopIssues = useCallback(async () => {
    const unresolvedThreads = threads.filter(t => !t.isResolved);
    if (unresolvedThreads.length === 0) {
      toast.info('No unresolved comments to fix');
      return;
    }

    setIsFixing(true);
    setActiveMainTab('chat');

    try {
      const newSession = await createSession('PR Review Fixes');
      if (!newSession) {
        toast.error('Failed to create session');
        return;
      }

      const topIssues = unresolvedThreads.slice(0, 10);
      const issuesList = topIssues.map((thread, idx) => {
        const comment = thread.comments[0];
        const location = comment?.line ? `${comment.path}:${comment.line}` : comment?.path || 'Unknown';
        const body = comment?.body || 'No description';
        return `${idx + 1}. **${location}**\n   ${body.split('\n').join('\n   ')}`;
      }).join('\n\n');

      const message = `# PR Review Comments to Fix

There are ${unresolvedThreads.length} unresolved review comments. Here are the top ${topIssues.length} that need attention:

${issuesList}

Please analyze these review comments and fix each issue. For each fix:
1. Read the relevant file and understand the context
2. Make the necessary code changes
3. Commit with a clear message referencing the review comment

Start with the most critical issues first.`;

      const config = getEffectiveConfig(newSession.id);
      if (!config.providerId || !config.modelId) {
        toast.error('Select a model first');
        return;
      }

      await sendMessage(
        message,
        config.providerId,
        config.modelId,
        config.agent,
        undefined,
        undefined,
        undefined,
        config.variant
      );
      toast.success(`Started fixing ${topIssues.length} issues`);
    } catch (e) {
      console.error('Failed to start fix session', e);
      toast.error('Failed to start fix session');
    } finally {
      setIsFixing(false);
    }
  }, [threads, createSession, sendMessage, setActiveMainTab, getEffectiveConfig]);

  const handleReviewAndResolve = useCallback(async () => {
    if (threads.length === 0) {
      toast.info('No review comments to process');
      return;
    }

    setIsReviewing(true);
    setActiveMainTab('chat');

    try {
      const newSession = await createSession('PR Review Cleanup');
      if (!newSession) {
        toast.error('Failed to create session');
        return;
      }

      const threadSummary = threads.map((thread, idx) => {
        const comment = thread.comments[0];
        const location = comment?.line ? `${comment.path}:${comment.line}` : comment?.path || 'Unknown';
        const status = thread.isResolved ? '✅ Resolved' : '⚠️ Open';
        const body = comment?.body?.slice(0, 200) || 'No description';
        return `${idx + 1}. [${status}] **${location}**\n   ${body}${comment?.body && comment.body.length > 200 ? '...' : ''}`;
      }).join('\n\n');

      const unresolvedCount = threads.filter(t => !t.isResolved).length;
      const resolvedCount = threads.filter(t => t.isResolved).length;

      const message = `# PR Review Comments Audit

This PR has ${threads.length} review comments (${unresolvedCount} open, ${resolvedCount} resolved).

${threadSummary}

## Your Task

For each **open** comment:
1. Check if the issue has already been fixed in the current code
2. If fixed, use \`gh\` CLI to mark the thread as resolved
3. If not fixed but the comment is outdated/invalid, explain why and resolve it
4. If the issue still needs fixing, note it for follow-up

Report which comments you resolved and which still need attention.`;

      const config = getEffectiveConfig(newSession.id);
      if (!config.providerId || !config.modelId) {
        toast.error('Select a model first');
        return;
      }

      await sendMessage(
        message,
        config.providerId,
        config.modelId,
        config.agent,
        undefined,
        undefined,
        undefined,
        config.variant
      );
      toast.success('Started review audit');
    } catch (e) {
      console.error('Failed to start review session', e);
      toast.error('Failed to start review session');
    } finally {
      setIsReviewing(false);
    }
  }, [threads, createSession, sendMessage, setActiveMainTab, getEffectiveConfig]);

  const unresolvedCount = threads.filter(t => !t.isResolved).length;
  const resolvedCount = threads.filter(t => t.isResolved).length;

  if (threads.length === 0) {
    return null;
  }

  const isActionInProgress = isFixing || isReviewing || isRefreshing;

  return (
    <section className="flex flex-col rounded-xl border border-border/60 bg-background/70">
      <header className="flex flex-col gap-2 px-3 py-2 border-b border-border/40">
        <div className="flex items-center justify-between gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Review Comments</h3>
          <div className="flex items-center gap-3 typography-meta text-muted-foreground">
            {unresolvedCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-500">
                <RiChat3Line className="w-3.5 h-3.5" />
                {unresolvedCount} open
              </span>
            )}
            {resolvedCount > 0 && (
              <span className="flex items-center gap-1 text-green-500">
                <RiCheckLine className="w-3.5 h-3.5" />
                {resolvedCount} resolved
              </span>
            )}
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RiRefreshLine className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
        {unresolvedCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={handleFixTopIssues}
              disabled={isActionInProgress}
            >
              <RiMagicLine className={`w-3.5 h-3.5 mr-1 ${isFixing ? 'animate-pulse' : ''}`} />
              {isFixing ? 'Starting...' : `Fix Top ${Math.min(unresolvedCount, 10)} Issues`}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleReviewAndResolve}
              disabled={isActionInProgress}
            >
              <RiCheckboxMultipleLine className={`w-3.5 h-3.5 mr-1 ${isReviewing ? 'animate-pulse' : ''}`} />
              {isReviewing ? 'Starting...' : 'Review & Resolve'}
            </Button>
          </div>
        )}
      </header>
      <ScrollableOverlay outerClassName="flex-1 min-h-0 max-h-[40vh]" className="w-full">
        <ul>
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              onSendToAgent={handleSendToAgent}
              sendingCommentId={sendingCommentId}
            />
          ))}
        </ul>
      </ScrollableOverlay>
    </section>
  );
};
