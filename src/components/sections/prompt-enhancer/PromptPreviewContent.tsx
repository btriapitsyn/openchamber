import React from 'react';
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { PromptEnhancementPreviewResponse } from '@/lib/promptApi';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PromptPreviewContentProps {
  data: PromptEnhancementPreviewResponse | null;
  isLoading?: boolean;
  forceAgentsContext?: boolean;
  forceReadmeContext?: boolean;
  forceRepositoryDiff?: boolean;
}

export const PromptPreviewContent: React.FC<PromptPreviewContentProps> = ({
  data,
  isLoading,
  forceAgentsContext,
  forceReadmeContext,
  forceRepositoryDiff,
}) => {
  const [activeSection, setActiveSection] = React.useState<'user' | 'context' | 'repo'>('user');
  const [copiedSection, setCopiedSection] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<number | null>(null);

  const handleCopy = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSection(label);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopiedSection(null);
        timeoutRef.current = null;
      }, 2000);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const agentsContext = data?.agentsContext ?? '';
  const readmeContext = data?.readmeContext ?? '';
  const repositoryDiff = data?.repositoryDiff ?? '';
  const targetAgentContext = data?.targetAgentContext ?? '';
  const includeAgentsContext = forceAgentsContext ?? data?.includeAgentsContext ?? false;
  const includeReadmeContext = forceReadmeContext ?? data?.includeReadmeContext ?? false;
  const includeRepositoryDiff = forceRepositoryDiff ?? data?.includeRepositoryDiff ?? false;

  const combinedProjectContext = [
    includeAgentsContext ? agentsContext : '',
    includeReadmeContext ? readmeContext : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const hasProjectContext = (includeAgentsContext || includeReadmeContext) || combinedProjectContext.trim().length > 0;
  const hasRepositoryDiffContent = repositoryDiff.trim().length > 0;
  const showRepositoryDiffTab = includeRepositoryDiff || hasRepositoryDiffContent;
  const hasTargetAgentContext = targetAgentContext.trim().length > 0;

  React.useEffect(() => {
    if (activeSection === 'context' && !hasProjectContext) {
      setActiveSection('user');
    } else if (activeSection === 'repo' && !showRepositoryDiffTab) {
      setActiveSection(hasProjectContext ? 'context' : 'user');
    }
  }, [hasProjectContext, showRepositoryDiffTab, activeSection]);

  if (isLoading) {
    return (
      <div className="py-8 text-center typography-meta text-muted-foreground">
        Generating preview…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-8 text-center typography-meta text-muted-foreground">
        Provide prompt inputs to generate a preview.
      </div>
    );
  }

  const userPromptDisplay = data.userPromptPreview ?? data.userContent ?? '';

  return (
    <ScrollArea className="max-h-[65vh] pr-2">
      <div className="space-y-4">
        {(hasProjectContext || showRepositoryDiffTab) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/80 p-3">
            <div>
              <h3 className="typography-ui-label font-semibold text-foreground">Preview content</h3>
              <p className="typography-meta text-muted-foreground">
                Switch between the assembled prompt and embedded context from the repo.
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={activeSection === 'user' ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => setActiveSection('user')}
              >
                RiUser3Line prompt
              </Button>
              {hasProjectContext && (
                <Button
                  type="button"
                  variant={activeSection === 'context' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setActiveSection('context')}
                >
                  Project context
                </Button>
              )}
              {showRepositoryDiffTab && (
                <Button
                  type="button"
                  variant={activeSection === 'repo' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setActiveSection('repo')}
                >
                  Repository diff
                </Button>
              )}
            </div>
          </div>
        )}

        {activeSection === 'context' && hasProjectContext ? (
          <PreviewBlock
            key="project-context"
            title="Project context"
            description="Extracted from AGENTS.md and README.md for reference."
            value={combinedProjectContext}
            onCopy={() => handleCopy(combinedProjectContext, 'Project context')}
            isCopied={copiedSection === 'Project context'}
          />
        ) : activeSection === 'repo' && showRepositoryDiffTab ? (
          <PreviewBlock
            key="repository-diff"
            title="Repository diff"
            description={hasRepositoryDiffContent ? 'Current staged and unstaged changes gathered from Git.' : 'No uncommitted changes detected.'}
            value={hasRepositoryDiffContent ? repositoryDiff : 'No staged or unstaged Git changes detected.'}
            onCopy={() => handleCopy(repositoryDiff, 'Repository diff')}
            isCopied={copiedSection === 'Repository diff'}
          />
        ) : (
          <PreviewBlock
            key="user-prompt"
            title="RiUser3Line prompt"
            description="Full instruction payload composed from your selections."
            value={userPromptDisplay}
            onCopy={() => handleCopy(userPromptDisplay, 'RiUser3Line prompt')}
            isCopied={copiedSection === 'RiUser3Line prompt'}
          />
        )}

        {hasTargetAgentContext && (
          <PreviewBlock
            key="target-agent"
            title="Target agent"
            description="Agent details receiving the refined prompt."
            value={targetAgentContext}
            onCopy={() => handleCopy(targetAgentContext, 'Target agent')}
            isCopied={copiedSection === 'Target agent'}
          />
        )}

        {data.summaryEntries.length > 0 && (
          <section className="space-y-2 rounded-xl border border-border/40 bg-background/65 p-3">
            <header>
              <h3 className="typography-ui-label font-semibold text-foreground">Execution parameters</h3>
            <p className="typography-meta text-muted-foreground">
              Snapshot of how each group shaped the request.
            </p>
          </header>
          <ul className="space-y-1">
            {data.summaryEntries.map((entry, index) => (
              <li key={`${entry}-${index}`} className="typography-meta text-foreground">
                {entry}
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </ScrollArea>
  );
};

interface PreviewBlockProps {
  title: string;
  description?: string;
  value: string;
  onCopy: () => void;
  isCopied?: boolean;
}

const PreviewBlock: React.FC<PreviewBlockProps> = ({ title, description, value, onCopy, isCopied }) => {
  return (
    <section className="space-y-2 rounded-xl border border-border/40 bg-background/75 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="typography-ui-label font-semibold text-foreground">{title}</h3>
          {description && <p className="typography-meta text-muted-foreground">{description}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="px-2" onClick={onCopy}>
          {isCopied ? (
            <>
              <RiCheckLine className="mr-1 size-4" style={{ color: 'var(--status-success)' }} />
              Copied
            </>
          ) : (
            <>
              <RiFileCopyLine className="mr-1 size-4" />
              RiFileCopyLine
            </>
          )}
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/50 bg-background/80">
        <pre className="typography-code whitespace-pre-wrap break-words p-3">{value}</pre>
      </div>
    </section>
  );
};
