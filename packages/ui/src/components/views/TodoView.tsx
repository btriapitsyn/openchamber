import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RiFileList3Line } from '@remixicon/react';
import { useNotesStore } from '@/stores/useNotesStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { cn } from '@/lib/utils';

export const TodoView: React.FC = () => {
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
  const worktreeId = currentDirectory ?? 'global';
  
  const getNote = useNotesStore((s) => s.getNote);
  const setNote = useNotesStore((s) => s.setNote);
  
  const [content, setContent] = useState(() => getNote(worktreeId));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(getNote(worktreeId));
  }, [worktreeId, getNote]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      setNote(worktreeId, newContent);
    }, 300);
  }, [worktreeId, setNote]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newValue = content.substring(0, start) + '  ' + content.substring(end);
      setContent(newValue);
      setNote(worktreeId, newValue);
      
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [content, worktreeId, setNote]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--interactive-border)' }}>
        <RiFileList3Line className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Notes</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {worktreeId === 'global' ? 'Global' : 'Project'}
        </span>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write your notes here...

Use markdown syntax:
- [ ] Task item
- [x] Completed task
# Heading
**bold** *italic*"
          className={cn(
            'w-full h-full resize-none bg-transparent p-4',
            'text-sm text-foreground placeholder:text-muted-foreground/50',
            'focus:outline-none',
            'font-mono leading-relaxed'
          )}
          spellCheck={false}
        />
      </div>
    </div>
  );
};
