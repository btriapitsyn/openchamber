import React from 'react';
import {
  RiAddCircleLine,
  RiCloseLine,
  RiFileImageLine,
  RiFileLine,
  RiGitBranchLine,
  RiHourglassFill,
  RiSendPlane2Line,
} from '@remixicon/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { ModelMultiSelect, generateInstanceId, type ModelSelectionWithId } from '@/components/multirun/ModelMultiSelect';
import { BranchSelector, useBranchOptions } from '@/components/multirun/BranchSelector';
import { AgentSelector } from '@/components/multirun/AgentSelector';
import type { CreateMultiRunParams, MultiRunFileAttachment } from '@/types/multirun';

/** Max file size in bytes (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Max number of concurrent runs */
const MAX_MODELS = 5;

/** Attached file for agent manager */
interface AttachedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface AgentManagerEmptyStateProps {
  className?: string;
  /** Called when the user submits to create a new agent group */
  onCreateGroup?: (params: CreateMultiRunParams) => Promise<void> | void;
  /** Indicates if a group creation is in progress */
  isCreating?: boolean;
}

export const AgentManagerEmptyState: React.FC<AgentManagerEmptyStateProps> = ({ 
  className,
  onCreateGroup,
  isCreating = false,
}) => {
  const [groupName, setGroupName] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [selectedModels, setSelectedModels] = React.useState<ModelSelectionWithId[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState<string>('');
  const [baseBranch, setBaseBranch] = React.useState('HEAD');
  const [attachedFiles, setAttachedFiles] = React.useState<AttachedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory ?? null);
  const { isGitRepository, isLoading: isLoadingBranches } = useBranchOptions(currentDirectory);

  const handleAddModel = React.useCallback((model: ModelSelectionWithId) => {
    if (selectedModels.length >= MAX_MODELS) {
      return;
    }
    setSelectedModels((prev) => [...prev, model]);
  }, [selectedModels.length]);

  const handleRemoveModel = React.useCallback((index: number) => {
    setSelectedModels((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

        const newFile: AttachedFile = {
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

  // Use either local submitting state or external isCreating prop
  const isSubmittingOrCreating = isSubmitting || isCreating;

  const isValid = Boolean(
    groupName.trim() && 
    prompt.trim() && 
    selectedModels.length >= 1 && 
    isGitRepository && 
    !isLoadingBranches
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValid || isSubmittingOrCreating) return;

    setIsSubmitting(true);

    try {
      const models = selectedModels.map(({ providerID, modelID, displayName }) => ({
        providerID,
        modelID,
        displayName,
      }));

      const files: MultiRunFileAttachment[] | undefined = attachedFiles.length > 0
        ? attachedFiles.map((f) => ({
            mime: f.mimeType,
            filename: f.filename,
            url: f.dataUrl,
          }))
        : undefined;

      await onCreateGroup?.({
        name: groupName.trim(),
        prompt: prompt.trim(),
        models,
        agent: selectedAgent || undefined,
        worktreeBaseBranch: baseBranch,
        files,
      });

      // Reset form on success - only after onCreateGroup completes
      setGroupName('');
      setPrompt('');
      setSelectedModels([]);
      setSelectedAgent('');
      setAttachedFiles([]);
      setBaseBranch('HEAD');
    } catch (error) {
      console.error('Failed to create agent group:', error);
      toast.error('Failed to create agent group');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits if valid, Shift+Enter adds newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isValid && !isSubmittingOrCreating) {
        handleSubmit(e as unknown as React.FormEvent);
      }
      // If not valid, do nothing (no newline, no submit)
    }
    // Shift+Enter: default textarea behavior (adds newline)
  };

  return (
    <div className={cn('flex flex-col items-center justify-center h-full w-full p-4', className)}>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-4">
        {/* Group Name Input */}
        <div className="space-y-1.5">
          <label htmlFor="group-name" className="typography-ui-label font-medium text-foreground">
            Group Name
          </label>
          <Input
            id="group-name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. feature-auth, bugfix-login"
            className="typography-body"
          />
          <p className="typography-micro text-muted-foreground">
            Used for worktree directory and branch naming
          </p>
        </div>

        {/* Branch Selection */}
        <div className="space-y-1.5">
          <label className="typography-ui-label font-medium text-foreground flex items-center gap-1.5">
            <RiGitBranchLine className="h-4 w-4 text-muted-foreground" />
            Base Branch
          </label>
          <BranchSelector
            directory={currentDirectory}
            value={baseBranch}
            onChange={setBaseBranch}
          />
          <p className="typography-micro text-muted-foreground">
            Creates new branches from <code className="font-mono text-xs">{baseBranch}</code>
          </p>
        </div>

        {/* Agent Selection */}
        <div className="space-y-1.5">
          <label className="typography-ui-label font-medium text-foreground">
            Agent
          </label>
          <AgentSelector
            value={selectedAgent}
            onChange={setSelectedAgent}
          />
          <p className="typography-micro text-muted-foreground">
            Optional agent to use for all runs
          </p>
        </div>

        {/* Model Selection */}
        <div className="space-y-1.5">
          <label className="typography-ui-label font-medium text-foreground">
            Models
          </label>
          <ModelMultiSelect
            selectedModels={selectedModels}
            onAdd={handleAddModel}
            onRemove={handleRemoveModel}
            minModels={1}
            addButtonLabel="Add model"
            maxModels={5}
          />
        </div>

        {/* Chat Input Style Prompt */}
        <div className="space-y-1.5">
          <label htmlFor="prompt" className="typography-ui-label font-medium text-foreground">
            Prompt
          </label>
          <div className="rounded-xl border border-border/60 bg-input/10 dark:bg-input/30 overflow-hidden">
            {/* Text Area */}
            <Textarea
              ref={textareaRef}
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="min-h-[100px] max-h-[300px] resize-none border-0 bg-transparent px-4 py-3 typography-markdown focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            
            {/* Attached Files Display */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pb-2">
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
            )}
            
            {/* Footer Controls */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/40">
              {/* Left Controls - Attachments */}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  accept="*/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Add attachment"
                >
                  <RiAddCircleLine className="h-[18px] w-[18px]" />
                </button>
              </div>
              
              {/* Right Controls - Model Count */}
              <div className="flex items-center gap-2">
                <span className="typography-meta text-muted-foreground">
                  {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              {/* Submit Button */}
               <button
                  type="submit"
                  disabled={!isValid || isSubmittingOrCreating}
                  className={cn(
                      'flex items-center justify-center text-muted-foreground transition-none outline-none focus:outline-none flex-shrink-0',
                      isValid
                          ? 'text-primary hover:text-primary'
                          : 'opacity-30'
                  )}
                  aria-label="Start Agent Group"
                >
                  {isSubmittingOrCreating ? (
                    <RiHourglassFill className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <RiSendPlane2Line className="h-[18px] w-[18px]" />
                  )}
                </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
