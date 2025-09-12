import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Square, Settings } from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { FileAttachmentButton, AttachedFilesList } from './FileAttachment';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onOpenSettings?: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onOpenSettings }) => {
  const [message, setMessage] = React.useState('');
  const [isDragging, setIsDragging] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = React.useRef<HTMLDivElement>(null);
  
  const { 
    sendMessage, 
    isLoading, 
    currentSessionId,
    abortCurrentOperation,
    streamingMessageId,
    attachedFiles,
    clearAttachedFiles,
    addAttachedFile 
  } = useSessionStore();
  
  const { currentProviderId, currentModelId, currentAgentName } = useConfigStore();

  const canSend = (message.trim() || attachedFiles.length > 0) && currentSessionId && !isLoading;
  const canAbort = isLoading || streamingMessageId;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!canSend) return;
    
    const messageToSend = message.trim();
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    
    await sendMessage(messageToSend, currentProviderId, currentModelId, currentAgentName);
    
    // Clear attached files after sending
    clearAttachedFiles();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAbort = () => {
    abortCurrentOperation();
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  React.useEffect(() => {
    // Focus textarea when session changes
    if (currentSessionId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [currentSessionId]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentSessionId && !isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!currentSessionId) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await addAttachedFile(file);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="pt-0 pb-4 px-4">
      <div 
        ref={dropZoneRef}
        className={cn(
          "max-w-3xl mx-auto relative",
          isDragging && "ring-2 ring-primary ring-offset-2 rounded-lg"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="text-center">
              <FileAttachmentButton />
              <p className="mt-2 text-sm text-muted-foreground">Drop files here to attach</p>
            </div>
          </div>
        )}
        <AttachedFilesList />
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setMessage(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder={currentSessionId ? "Type your message..." : "Select or create a session to start chatting"}
            disabled={!currentSessionId || !!canAbort}
            className={cn(
              "min-h-[52px] max-h-[200px] resize-none pr-20",
              "focus-visible:ring-2 focus-visible:ring-primary/20",
              "border-border/20 bg-background"
            )}
            rows={1}
          />
          
          <div className="absolute bottom-2 right-2 flex gap-1">
            <FileAttachmentButton />
            {canAbort ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleAbort}
                className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
              >
                <Square className="h-4 w-4 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={!canSend}
                className={cn(
                  "h-8 w-8 p-0 transition-colors",
                  canSend ? "hover:bg-primary/10 hover:text-primary" : "opacity-30"
                )}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {onOpenSettings && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onOpenSettings}
            className="h-[52px] w-[52px]"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
        
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="text-xs text-muted-foreground/60">
            {canAbort ? 'Processing...' : 'Press Enter to send, Shift+Enter for new line'}
          </span>
          <span className="text-xs text-muted-foreground/60">
            Ctrl+X for commands
          </span>
        </div>
      </div>
    </form>
  );
};