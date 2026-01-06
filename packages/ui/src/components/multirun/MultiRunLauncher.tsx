import React from 'react';
import { RiAttachment2, RiCloseLine, RiFileImageLine, RiFileLine, RiPlayLine } from '@remixicon/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import type { CreateMultiRunParams, MultiRunModelSelection } from '@/types/multirun';
import { ModelMultiSelect, generateInstanceId, type ModelSelectionWithId } from './ModelMultiSelect';
import { BranchSelector, useBranchOptions } from './BranchSelector';
import { AgentSelector } from './AgentSelector';

/** Max file size in bytes (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Max number of concurrent runs */
const MAX_MODELS = 5;

/** Attached file for multi-run (simplified from sessionStore's AttachedFile) */
interface MultiRunAttachedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface MultiRunLauncherProps {
  /** Prefill prompt textarea (optional) */
  initialPrompt?: string;
  /** Called when multi-run is successfully created */
  onCreated?: () => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

/**
 * Launcher form for creating a new Multi-Run group.
 * Replaces the main content area (tabs) with a form.
 */
export const MultiRunLauncher: React.FC<MultiRunLauncherProps> = ({
  initialPrompt,
  onCreated,
  onCancel,
}) => {
  const [name, setName] = React.useState('');
  const [prompt, setPrompt] = React.useState(() => initialPrompt ?? '');
  const [selectedModels, setSelectedModels] = React.useState<ModelSelectionWithId[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('');
  const [attachedFiles, setAttachedFiles] = React.useState<MultiRunAttachedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory ?? null);
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);

  const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
  });

  const isMacPlatform = React.useMemo(() => {
    if (typeof navigator === 'undefined') {
      return false;
    }
    return /Macintosh|Mac OS X/.test(navigator.userAgent || '');
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const detected = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    setIsDesktopApp(detected);
  }, []);

  const desktopHeaderPaddingClass = React.useMemo(() => {
    if (isDesktopApp && isMacPlatform) {
      return isSidebarOpen ? 'pl-0' : 'pl-[8.0rem]';
    }
    return 'pl-3';
  }, [isDesktopApp, isMacPlatform, isSidebarOpen]);

  // Use the BranchSelector hook for branch state management
  const [worktreeBaseBranch, setWorktreeBaseBranch] = React.useState<string>('HEAD');
  const { isLoading: isLoadingWorktreeBaseBranches, isGitRepository } = useBranchOptions(currentDirectory);

  const createMultiRun = useMultiRunStore((state) => state.createMultiRun);
  const error = useMultiRunStore((state) => state.error);
  const clearError = useMultiRunStore((state) => state.clearError);

  React.useEffect(() => {
    if (typeof initialPrompt === 'string' && initialPrompt.trim().length > 0) {
      setPrompt((prev) => (prev.trim().length > 0 ? prev : initialPrompt));
    }
  }, [initialPrompt]);

  const handleAddModel = (model: ModelSelectionWithId) => {
    if (selectedModels.length >= MAX_MODELS) {
      return;
    }
    setSelectedModels((prev) => [...prev, model]);
    clearError();
  };

  const handleRemoveModel = (index: number) => {
    setSelectedModels((prev) => prev.filter((_, i) => i !== index));
    clearError();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let attachedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File "${file.name}" is too large (max 10MB)`);
        continue;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const newFile: MultiRunAttachedFile = {
          id: generateInstanceId(),
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
        };

        setAttachedFiles((prev) => [...prev, newFile]);
        attachedCount++;
      } catch (error) {
        console.error('File attach failed', error);
        toast.error(`Failed to attach "${file.name}"`);
      }
    }

    if (attachedCount > 0) {
      toast.success(`Attached ${attachedCount} file${attachedCount > 1 ? 's' : ''}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prompt.trim()) {
      return;
    }
    if (selectedModels.length < 2) {
      return;
    }

    setIsSubmitting(true);
    clearError();

    try {
      // Strip instanceId before passing to store (UI-only field)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const modelsForStore: MultiRunModelSelection[] = selectedModels.map(({ instanceId: _instanceId, ...rest }) => rest);
      
      // Convert attached files to the format expected by the store
      const filesForStore = attachedFiles.map((f) => ({
        mime: f.mimeType,
        filename: f.filename,
        url: f.dataUrl,
      }));

      const params: CreateMultiRunParams = {
        name: name.trim(),
        prompt: prompt.trim(),
        models: modelsForStore,
        agent: selectedAgent || undefined,
        worktreeBaseBranch,
        files: filesForStore.length > 0 ? filesForStore : undefined,
      };

      const result = await createMultiRun(params);
       if (result) {
         if (result.firstSessionId) {
           useSessionStore.getState().setCurrentSession(result.firstSessionId);
         }

         // Close launcher
         onCreated?.();
       }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = Boolean(
    name.trim() && prompt.trim() && selectedModels.length >= 2 && isGitRepository && !isLoadingWorktreeBaseBranches
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header - same height as app header (h-12 = 48px) */}
      <header
        className={cn(
          'flex h-12 items-center justify-between border-b app-region-drag',
          desktopHeaderPaddingClass
        )}
        style={{ borderColor: 'var(--interactive-border)' }}
      >
        <div
          className={cn(
            'flex items-center gap-3',
            isDesktopApp && isMacPlatform && isSidebarOpen && 'pl-4'
          )}
        >
          <h1 className="typography-ui-label font-medium">New Multi-Run</h1>
        </div>
        {onCancel && (
          <div className="flex items-center pr-3">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary app-region-no-drag"
                >
                  <RiCloseLine className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Close</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </header>

      {/* Content with chat-column max-width */}
      <div className="flex-1 overflow-auto">
        <div className="chat-column py-6">
          <form onSubmit={handleSubmit} className="space-y-6" data-keyboard-avoid="true">
            {/* Group name (required) */}
            <div className="space-y-2">
              <label htmlFor="group-name" className="typography-ui-label font-medium text-foreground">
                Group name <span className="text-destructive">*</span>
              </label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. feature-auth, bugfix-login"
                className="typography-body max-w-full sm:max-w-xs"
                required
              />
              <p className="typography-micro text-muted-foreground">
                Used for worktree directory and branch names
              </p>
            </div>

            {/* Worktree creation */}
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="typography-ui-label font-medium text-foreground">Worktrees</p>
                <p className="typography-micro text-muted-foreground">
                  Create one worktree per model by creating a new branch from a base branch.
                </p>
              </div>

              <div className="space-y-2">
                <label
                  className="typography-meta font-medium text-foreground"
                  htmlFor="multirun-worktree-base-branch"
                >
                  Base branch
                </label>
                <BranchSelector
                  directory={currentDirectory}
                  value={worktreeBaseBranch}
                  onChange={setWorktreeBaseBranch}
                  id="multirun-worktree-base-branch"
                />
                <p className="typography-micro text-muted-foreground">
                  Creates new branches from{' '}
                  <code className="font-mono text-xs text-muted-foreground">{worktreeBaseBranch || 'HEAD'}</code>.
                </p>
              </div>
            </div>

            {/* Agent selection */}
            <div className="space-y-2">
              <label
                className="typography-ui-label font-medium text-foreground"
                htmlFor="multirun-agent"
              >
                Agent
              </label>
              <AgentSelector
                value={selectedAgent}
                onChange={setSelectedAgent}
                id="multirun-agent"
              />
              <p className="typography-micro text-muted-foreground">
                Defaults to your configured default agent.
              </p>
            </div>

            {/* Prompt */}
            <div className="space-y-2">
              <label htmlFor="prompt" className="typography-ui-label font-medium text-foreground">
                Prompt <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter the prompt to send to all models..."
                className="typography-body min-h-[120px] max-h-[400px] resize-none overflow-y-auto field-sizing-content"
                required
              />
            </div>

            {/* File attachments */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="typography-ui-label font-medium text-foreground">
                  Attachments
                </label>
                <span className="typography-micro text-muted-foreground">(optional, same files for all runs)</span>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="*/*"
              />
              
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RiAttachment2 className="h-3.5 w-3.5 mr-1.5" />
                  Attach files
                </Button>
                
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/30 border border-border/30 rounded-md typography-meta"
                  >
                    {file.mimeType.startsWith('image/') ? (
                      <RiFileImageLine className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <RiFileLine className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[120px]" title={file.filename}>
                      {file.filename}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      ({file.size < 1024 ? `${file.size}B` : file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)}KB` : `${(file.size / (1024 * 1024)).toFixed(1)}MB`})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                    >
                      <RiCloseLine className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Model selection */}
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Models <span className="text-destructive">*</span>
              </label>
              <ModelMultiSelect
                selectedModels={selectedModels}
                onAdd={handleAddModel}
                onRemove={handleRemoveModel}
                minModels={2}
                maxModels={MAX_MODELS}
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive typography-body">
                {error}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || isSubmitting}
              >
                {isSubmitting ? (
                  'Creating...'
                ) : (
                  <>
                    <RiPlayLine className="h-4 w-4 mr-2" />
                    Start ({selectedModels.length} models)
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
