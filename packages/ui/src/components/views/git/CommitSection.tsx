import {
  RiGitCommitLine,
  RiArrowUpLine,
  RiAiGenerate2,
  RiLoader4Line,
  RiEmotionHappyLine,
} from '@remixicon/react';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ButtonLarge } from '@/components/ui/button-large';
import { CommitInput } from './CommitInput';
import { AIHighlightsBox } from './AIHighlightsBox';
import { useDeviceInfo } from '@/lib/device';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type CommitAction = 'commit' | 'commitAndPush' | null;

interface CommitSectionProps {
  selectedCount: number;
  commitMessage: string;
  onCommitMessageChange: (value: string) => void;
  generatedHighlights: string[];
  onInsertHighlights: () => void;
  onClearHighlights: () => void;
  onGenerateMessage: () => void;
  isGeneratingMessage: boolean;
  onCommit: () => void;
  onCommitAndPush: () => void;
  commitAction: CommitAction;
  isBusy: boolean;
  gitmojiEnabled: boolean;
  onOpenGitmojiPicker: () => void;
}

export const CommitSection: React.FC<CommitSectionProps> = ({
  selectedCount,
  commitMessage,
  onCommitMessageChange,
  generatedHighlights,
  onInsertHighlights,
  onClearHighlights,
  onGenerateMessage,
  isGeneratingMessage,
  onCommit,
  onCommitAndPush,
  commitAction,
  isBusy,
  gitmojiEnabled,
  onOpenGitmojiPicker,
}) => {
  const hasSelectedFiles = selectedCount > 0;
  const canCommit = commitMessage.trim() && hasSelectedFiles && commitAction === null;
  const { isMobile } = useDeviceInfo();

  return (
    <Collapsible
      open={hasSelectedFiles}
      className="rounded-xl border border-border/60 bg-background/70 overflow-hidden"
      data-keyboard-avoid="true"
    >
      <div className="flex w-full items-center justify-between px-3 py-2">
        <h3 className="typography-ui-header font-semibold text-foreground">Commit</h3>
        <span className="typography-meta text-muted-foreground">
          {hasSelectedFiles
            ? `${selectedCount} file${selectedCount === 1 ? '' : 's'} selected`
            : 'No files selected'}
        </span>
      </div>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 p-3 pt-0">
          <AIHighlightsBox
            highlights={generatedHighlights}
            onInsert={onInsertHighlights}
            onClear={onClearHighlights}
          />

          <CommitInput
            value={commitMessage}
            onChange={onCommitMessageChange}
            placeholder="Commit message"
            disabled={commitAction !== null}
          />

          {gitmojiEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenGitmojiPicker}
              className="w-fit"
              type="button"
            >
              <RiEmotionHappyLine className="size-4" />
              Add gitmoji
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerateMessage}
              disabled={
                isGeneratingMessage ||
                commitAction !== null ||
                selectedCount === 0 ||
                isBusy
              }
              type="button"
            >
              {isGeneratingMessage ? (
                <RiLoader4Line className="size-4 animate-spin" />
              ) : (
                <RiAiGenerate2 className="size-4 text-primary" />
              )}
              Generate
            </Button>

            <div className="flex-1" />

            <ButtonLarge
              variant="outline"
              onClick={onCommit}
              disabled={!canCommit || isGeneratingMessage}
              className="whitespace-nowrap"
            >
              {commitAction === 'commit' ? (
                <>
                  <RiLoader4Line className="size-4 animate-spin" />
                  Committing...
                </>
              ) : (
                <>
                  <RiGitCommitLine className="size-4" />
                  Commit
                </>
              )}
            </ButtonLarge>

            {isMobile ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onCommitAndPush}
                    disabled={!canCommit || isGeneratingMessage}
                    className="h-7 w-7 p-0"
                    aria-label="Commit & Push"
                  >
                    {commitAction === 'commitAndPush' ? (
                      <RiLoader4Line className="size-4 animate-spin" />
                    ) : (
                      <RiArrowUpLine className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Commit & Push</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <ButtonLarge
                variant="default"
                onClick={onCommitAndPush}
                disabled={!canCommit || isGeneratingMessage}
              >
                {commitAction === 'commitAndPush' ? (
                  <>
                    <RiLoader4Line className="size-4 animate-spin" />
                    Pushing...
                  </>
                ) : (
                  <>
                    <RiArrowUpLine className="size-4" />
                    Commit &amp; Push
                  </>
                )}
              </ButtonLarge>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
