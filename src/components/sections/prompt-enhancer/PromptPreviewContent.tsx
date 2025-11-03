import React from 'react';
import { CopySimple } from '@phosphor-icons/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { PromptEnhancementPreviewResponse } from '@/lib/promptApi';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PromptPreviewContentProps {
  data: PromptEnhancementPreviewResponse | null;
  isLoading?: boolean;
  forceProjectContext?: boolean;
  forceRepositoryDiff?: boolean;
}

export const PromptPreviewContent: React.FC<PromptPreviewContentProps> = ({
  data,
  isLoading,
  forceProjectContext,
  forceRepositoryDiff,
}) => {
  const handleCopy = React.useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch (error) {
      toast.error(`Unable to copy ${label.toLowerCase()}`);
    }
  }, []);

  const [activeSection, setActiveSection] = React.useState<'user' | 'context' | 'repo'>('user');

  const projectContext = data?.projectContext ?? '';
  const repositoryDiff = data?.repositoryDiff ?? '';
  const includeProjectContext = forceProjectContext ?? data?.includeProjectContext ?? false;
  const includeRepositoryDiff = forceRepositoryDiff ?? data?.includeRepositoryDiff ?? false;
  const hasProjectContext = includeProjectContext || projectContext.trim().length > 0;
  const hasRepositoryDiffContent = repositoryDiff.trim().length > 0;
  const showRepositoryDiffTab = includeRepositoryDiff || hasRepositoryDiffContent;

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
        <PreviewBlock
          title="System prompt"
          description="Role and output requirements shared with the refinement model."
          value={data.systemPrompt}
          onCopy={() => handleCopy(data.systemPrompt, 'System prompt')}
        />
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
                User prompt
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
            value={projectContext}
            onCopy={() => handleCopy(projectContext, 'Project context')}
          />
        ) : activeSection === 'repo' && showRepositoryDiffTab ? (
          <PreviewBlock
            key="repository-diff"
            title="Repository diff"
            description={hasRepositoryDiffContent ? 'Current staged and unstaged changes gathered from Git.' : 'No uncommitted changes detected.'}
            value={hasRepositoryDiffContent ? repositoryDiff : 'No staged or unstaged Git changes detected.'}
            onCopy={() => handleCopy(repositoryDiff, 'Repository diff')}
          />
        ) : (
          <PreviewBlock
            key="user-prompt"
            title="User prompt"
            description="Full instruction payload composed from your selections."
            value={userPromptDisplay}
            onCopy={() => handleCopy(userPromptDisplay, 'User prompt')}
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
}

const PreviewBlock: React.FC<PreviewBlockProps> = ({ title, description, value, onCopy }) => {
  return (
    <section className="space-y-2 rounded-xl border border-border/40 bg-background/75 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="typography-ui-label font-semibold text-foreground">{title}</h3>
          {description && <p className="typography-meta text-muted-foreground">{description}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="px-2" onClick={onCopy}>
          <CopySimple className="mr-1 size-4" />
          Copy
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/50 bg-background/80">
        <pre className="typography-code whitespace-pre-wrap break-words p-3">{value}</pre>
      </div>
    </section>
  );
};
