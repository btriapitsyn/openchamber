import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSkillsStore, type SkillConfig, type SkillScope, type SupportingFile, type PendingFile } from '@/stores/useSkillsStore';
import { RiAddLine, RiBookOpenLine, RiDeleteBinLine, RiFileLine, RiFolderLine, RiSaveLine, RiUser3Line } from '@remixicon/react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ButtonLarge } from '@/components/ui/button-large';
import { AnimatedTabs } from '@/components/ui/animated-tabs';
import { SkillsCatalogPage } from './catalog/SkillsCatalogPage';

export const SkillsPage: React.FC = () => {
  const { 
    selectedSkillName, 
    getSkillByName, 
    getSkillDetail,
    createSkill, 
    updateSkill, 
    skills, 
    skillDraft, 
    setSkillDraft,
    setSelectedSkill,
  } = useSkillsStore();

  const selectedSkill = selectedSkillName ? getSkillByName(selectedSkillName) : null;
  const isNewSkill = Boolean(skillDraft && skillDraft.name === selectedSkillName && !selectedSkill);
  const hasStaleSelection = Boolean(selectedSkillName && !selectedSkill && !skillDraft);

  type SkillsMode = 'manual' | 'external';
  const [mode, setMode] = React.useState<SkillsMode>('manual');

  React.useEffect(() => {
    if (!isNewSkill && mode !== 'manual') {
      setMode('manual');
    }
  }, [isNewSkill, mode]);

  React.useEffect(() => {
    if (!hasStaleSelection) {
      return;
    }

    // Clear persisted selection if it points to a non-existent skill.
    setSelectedSkill(null);
  }, [hasStaleSelection, setSelectedSkill]);

  const modeTabs = isNewSkill ? (
    <AnimatedTabs
      tabs={[
        { value: 'manual', label: 'Manual' },
        { value: 'external', label: 'External' },
      ]}
      value={mode}
      onValueChange={setMode}
      animate={false}
    />
  ) : null;

  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<SkillScope>('user');
  const [description, setDescription] = React.useState('');
  const [instructions, setInstructions] = React.useState('');
  const [supportingFiles, setSupportingFiles] = React.useState<SupportingFile[]>([]);
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]); // For new skills
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  
  // Track original values to detect changes
  const [originalDescription, setOriginalDescription] = React.useState('');
  const [originalInstructions, setOriginalInstructions] = React.useState('');
  
  // File dialog state
  const [isFileDialogOpen, setIsFileDialogOpen] = React.useState(false);
  const [newFileName, setNewFileName] = React.useState('');
  const [newFileContent, setNewFileContent] = React.useState('');
  const [editingFilePath, setEditingFilePath] = React.useState<string | null>(null); // null = adding, string = editing
  const [isLoadingFile, setIsLoadingFile] = React.useState(false);
  const [originalFileContent, setOriginalFileContent] = React.useState(''); // Track original for change detection
  const [deleteFilePath, setDeleteFilePath] = React.useState<string | null>(null);
  const [isDeletingFile, setIsDeletingFile] = React.useState(false);
  
  // Detect if skill-level fields have changed
  const hasSkillChanges = isNewSkill 
    ? (draftName.trim() !== '' || description.trim() !== '' || instructions.trim() !== '' || pendingFiles.length > 0)
    : (description !== originalDescription || instructions !== originalInstructions);
  
  // Detect if file content has changed
  const hasFileChanges = editingFilePath 
    ? newFileContent !== originalFileContent
    : newFileName.trim() !== ''; // For new files, just need a name

  // Load skill details when selection changes
  React.useEffect(() => {
    if (mode === 'external') {
      return;
    }

    const loadSkillDetails = async () => {
      if (isNewSkill && skillDraft) {
        // Prefill from draft (for new or duplicated skills)
        setDraftName(skillDraft.name || '');
        setDraftScope(skillDraft.scope || 'user');
        setDescription(skillDraft.description || '');
        setInstructions(skillDraft.instructions || '');
        setOriginalDescription('');
        setOriginalInstructions('');
        setSupportingFiles([]);
        setPendingFiles(skillDraft.pendingFiles || []);
      } else if (selectedSkillName && selectedSkill) {
        setIsLoading(true);
        try {
          const detail = await getSkillDetail(selectedSkillName);
          if (detail) {
            // Get actual content from the API response
            const md = detail.sources.md;
            setDescription(md.description || '');
            setInstructions(md.instructions || '');
            setOriginalDescription(md.description || '');
            setOriginalInstructions(md.instructions || '');
            setSupportingFiles(md.supportingFiles || []);
          }
        } catch (error) {
          console.error('Failed to load skill details:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadSkillDetails();
  }, [selectedSkill, isNewSkill, selectedSkillName, skills, skillDraft, getSkillDetail, mode]);

  const handleSave = async () => {
    const skillName = isNewSkill ? draftName.trim().replace(/\s+/g, '-').toLowerCase() : selectedSkillName?.trim();

    if (!skillName) {
      toast.error('Skill name is required');
      return;
    }

    // Validate skill name format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skillName) || skillName.length > 64) {
      toast.error('Skill name must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    // Check for duplicate name when creating new skill
    if (isNewSkill && skills.some((s) => s.name === skillName)) {
      toast.error('A skill with this name already exists');
      return;
    }

    setIsSaving(true);

    try {
      const config: SkillConfig = {
        name: skillName,
        description: description.trim(),
        instructions: instructions.trim() || undefined,
        scope: isNewSkill ? draftScope : undefined,
        // Include pending files when creating new skill
        supportingFiles: isNewSkill && pendingFiles.length > 0 ? pendingFiles : undefined,
      };

      let success: boolean;
      if (isNewSkill) {
        success = await createSkill(config);
        if (success) {
          setSkillDraft(null); // Clear draft after successful creation
          setPendingFiles([]); // Clear pending files
          setSelectedSkill(skillName); // Select the newly created skill
        }
      } else {
        success = await updateSkill(skillName, config);
        if (success) {
          // Update original values to reflect saved state
          setOriginalDescription(description.trim());
          setOriginalInstructions(instructions.trim());
        }
      }

      if (success) {
        toast.success(isNewSkill ? 'Skill created successfully' : 'Skill updated successfully');
      } else {
        toast.error(isNewSkill ? 'Failed to create skill' : 'Failed to update skill');
      }
    } catch (error) {
      console.error('Error saving skill:', error);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFile = () => {
    setEditingFilePath(null);
    setNewFileName('');
    setNewFileContent('');
    setOriginalFileContent('');
    setIsFileDialogOpen(true);
  };

  const handleEditFile = async (filePath: string) => {
    setEditingFilePath(filePath);
    setNewFileName(filePath);
    
    // For new skills, get content from pending files
    if (isNewSkill) {
      const pendingFile = pendingFiles.find(f => f.path === filePath);
      const content = pendingFile?.content || '';
      setNewFileContent(content);
      setOriginalFileContent(content);
      setIsFileDialogOpen(true);
      return;
    }
    
    // For existing skills, load content from server
    if (!selectedSkillName) return;
    
    setIsLoadingFile(true);
    setIsFileDialogOpen(true);
    
    try {
      const { readSupportingFile } = useSkillsStore.getState();
      const content = await readSupportingFile(selectedSkillName, filePath);
      setNewFileContent(content || '');
      setOriginalFileContent(content || '');
    } catch {
      toast.error('Failed to load file content');
      setNewFileContent('');
      setOriginalFileContent('');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleSaveFile = async () => {
    if (!newFileName.trim()) {
      toast.error('File name is required');
      return;
    }

    const filePath = newFileName.trim();
    const isEditing = editingFilePath !== null;

    // For new skills, add/update pending files
    if (isNewSkill) {
      if (isEditing) {
        // Update existing pending file
        setPendingFiles(prev => prev.map(f => 
          f.path === editingFilePath ? { path: filePath, content: newFileContent } : f
        ));
        toast.success(`File "${filePath}" updated`);
      } else {
        // Check for duplicate
        if (pendingFiles.some(f => f.path === filePath)) {
          toast.error('A file with this name already exists');
          return;
        }
        setPendingFiles(prev => [...prev, { path: filePath, content: newFileContent }]);
        toast.success(`File "${filePath}" added`);
      }
      setIsFileDialogOpen(false);
      setEditingFilePath(null);
      return;
    }

    // For existing skills, write directly to disk
    if (!selectedSkillName) {
      toast.error('No skill selected');
      return;
    }

    const { writeSupportingFile } = useSkillsStore.getState();
    const success = await writeSupportingFile(selectedSkillName, filePath, newFileContent);
    
    if (success) {
      toast.success(isEditing ? `File "${filePath}" updated` : `File "${filePath}" created`);
      setIsFileDialogOpen(false);
      setEditingFilePath(null);
      // Refresh skill details to get updated file list
      const detail = await getSkillDetail(selectedSkillName);
      if (detail) {
        setSupportingFiles(detail.sources.md.supportingFiles || []);
      }
    } else {
      toast.error(isEditing ? 'Failed to update file' : 'Failed to create file');
    }
  };

  const handleDeleteFile = (filePath: string) => {
    // For new skills, remove from pending files
    if (isNewSkill) {
      setPendingFiles(prev => prev.filter(f => f.path !== filePath));
      toast.success(`File "${filePath}" removed`);
      return;
    }

    // For existing skills, delete from disk
    if (!selectedSkillName) {
      return;
    }

    setDeleteFilePath(filePath);
  };

  const handleConfirmDeleteFile = async () => {
    if (!deleteFilePath || !selectedSkillName) {
      return;
    }

    setIsDeletingFile(true);
    const { deleteSupportingFile } = useSkillsStore.getState();
    const success = await deleteSupportingFile(selectedSkillName, deleteFilePath);

    if (success) {
      toast.success(`File "${deleteFilePath}" deleted`);
      const detail = await getSkillDetail(selectedSkillName);
      if (detail) {
        setSupportingFiles(detail.sources.md.supportingFiles || []);
      }
      setDeleteFilePath(null);
    } else {
      toast.error('Failed to delete file');
    }

    setIsDeletingFile(false);
  };

  if (isNewSkill && mode === 'external') {
    return <SkillsCatalogPage mode={mode} onModeChange={setMode} />;
  }


  // Show empty state when nothing is selected or selection is stale
  if ((!selectedSkillName && !skillDraft) || hasStaleSelection) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <RiBookOpenLine className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select a skill from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="typography-body">Loading skill details...</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
      {isNewSkill ? modeTabs : null}

      {/* Header */}
      <div className="space-y-1">
        <h1 className="typography-ui-header font-semibold text-lg">
          {isNewSkill ? 'New Skill' : selectedSkillName}
        </h1>
        {selectedSkill && (
          <p className="typography-meta text-muted-foreground">
            {selectedSkill.scope === 'project' ? 'Project' : 'User'} skill
            {selectedSkill.source === 'claude' && ' (Claude-compatible)'}
          </p>
        )}
      </div>

      {/* Basic Information */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-ui-header font-semibold text-foreground">Basic Information</h2>
          <p className="typography-meta text-muted-foreground/80">
            Configure skill identity and description
          </p>
        </div>

        {isNewSkill && (
          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Skill Name & Scope
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="skill-name"
                className="flex-1 text-foreground placeholder:text-muted-foreground"
              />
              <Select value={draftScope} onValueChange={(v) => setDraftScope(v as SkillScope)}>
                <SelectTrigger className="!h-9 w-auto gap-1.5">
                  {draftScope === 'user' ? (
                    <RiUser3Line className="h-4 w-4" />
                  ) : (
                    <RiFolderLine className="h-4 w-4" />
                  )}
                  <span className="capitalize">{draftScope}</span>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="user" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <RiUser3Line className="h-4 w-4" />
                        <span>User</span>
                      </div>
                      <span className="typography-micro text-muted-foreground ml-6">Available in all projects</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="project" className="pr-2 [&>span:first-child]:hidden">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <RiFolderLine className="h-4 w-4" />
                        <span>Project</span>
                      </div>
                      <span className="typography-micro text-muted-foreground ml-6">Only in current project</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="typography-meta text-muted-foreground">
              Lowercase letters, numbers, and hyphens only. Cannot start or end with hyphen.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <label className="typography-ui-label font-medium text-foreground">
            Description <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this skill does..."
            rows={2}
            className="max-h-32 resize-none"
          />
          <p className="typography-meta text-muted-foreground">
            The agent uses this to decide when to load the skill
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="typography-h2 font-semibold text-foreground">Instructions</h2>
          <p className="typography-meta text-muted-foreground/80">
            Detailed instructions for the agent when this skill is loaded
          </p>
        </div>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Step-by-step instructions, guidelines, or reference content..."
          rows={12}
          className="font-mono typography-meta max-h-80 resize-y"
        />
      </div>

      {/* Supporting Files */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Supporting Files</h2>
            <p className="typography-meta text-muted-foreground/80">
              Reference documentation, scripts, or templates
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddFile}
            className="gap-1.5"
          >
            <RiAddLine className="h-3.5 w-3.5" />
            Add File
          </Button>
        </div>

        {(() => {
          // For new skills, show pending files
          const filesToShow = isNewSkill ? pendingFiles : supportingFiles;
          
          if (filesToShow.length === 0) {
            return (
              <p className="typography-meta text-muted-foreground py-2">
                {isNewSkill ? 'No files yet. Use "Add File" to include reference materials.' : 'No supporting files. Use "Add File" to include reference materials.'}
              </p>
            );
          }
          
          return (
            <div className="space-y-2">
              {filesToShow.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border bg-muted/30 hover:bg-interactive-hover cursor-pointer transition-colors"
                  onClick={() => handleEditFile(file.path)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <RiFileLine className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="typography-ui-label truncate">{file.path}</span>
                    {isNewSkill && (
                      <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
                        pending
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFile(file.path);
                    }}
                  >
                    <RiDeleteBinLine className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Save Button */}
      <div className="flex justify-end border-t border-border/40 pt-4">
        <Button
          size="sm"
          variant="default"
          onClick={handleSave}
          disabled={isSaving || !hasSkillChanges}
          className="gap-2 h-6 px-2 text-xs w-fit"
        >
          <RiSaveLine className="h-3 w-3" />
          {isSaving ? 'Saving...' : isNewSkill ? 'Create Skill' : 'Save Changes'}
        </Button>
      </div>

      {/* Add/Edit File Dialog */}
      <Dialog
        open={deleteFilePath !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingFile) {
            setDeleteFilePath(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Supporting File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteFilePath}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteFilePath(null)}
              disabled={isDeletingFile}
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
            >
              Cancel
            </Button>
            <ButtonLarge onClick={handleConfirmDeleteFile} disabled={isDeletingFile}>
              Delete
            </ButtonLarge>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFileDialogOpen} onOpenChange={(open) => {
        setIsFileDialogOpen(open);
        if (!open) setEditingFilePath(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" keyboardAvoid>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{editingFilePath ? 'Edit Supporting File' : 'Add Supporting File'}</DialogTitle>
            <DialogDescription>
              {editingFilePath ? 'Modify the file content' : 'Create a new file in the skill directory'}
            </DialogDescription>
          </DialogHeader>
          {isLoadingFile ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <span className="typography-meta text-muted-foreground">Loading file content...</span>
            </div>
          ) : (
            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              <div className="space-y-2 flex-shrink-0">
                <label className="typography-ui-label font-medium text-foreground">
                  File Path
                </label>
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="example.md or docs/reference.txt"
                  className="text-foreground placeholder:text-muted-foreground"
                  disabled={editingFilePath !== null}
                />
                {!editingFilePath && (
                  <p className="typography-micro text-muted-foreground">
                    Relative path within the skill directory. Subdirectories will be created automatically.
                  </p>
                )}
              </div>
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <label className="typography-ui-label font-medium text-foreground flex-shrink-0">
                  Content
                </label>
                <Textarea
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  placeholder="File content..."
                  className="font-mono typography-meta flex-1 min-h-[200px] max-h-full resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsFileDialogOpen(false);
                setEditingFilePath(null);
              }}
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
            >
              Cancel
            </Button>
            <ButtonLarge onClick={handleSaveFile} disabled={isLoadingFile || !hasFileChanges}>
              {editingFilePath ? 'Save Changes' : 'Create File'}
            </ButtonLarge>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ScrollableOverlay>
  );
};
