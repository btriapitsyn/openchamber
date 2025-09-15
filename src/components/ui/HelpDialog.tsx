import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUIStore } from '@/stores/useUIStore';
import { 
  Command, 
  Plus, 
  Palette, 
  PanelLeftClose, 
  Keyboard,
  HelpCircle,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';

export const HelpDialog: React.FC = () => {
  const { isHelpDialogOpen, setHelpDialogOpen } = useUIStore();

  const shortcuts = [
    {
      category: "Navigation & Commands",
      items: [
        { keys: "Ctrl+X", description: "Open Command Palette", icon: Command },
        { keys: "Ctrl+H", description: "Show Keyboard Shortcuts (this dialog)", icon: HelpCircle },
        { keys: "Escape", description: "Close dialog / Abort operation", icon: null },
      ]
    },
    {
      category: "Session Management", 
      items: [
        { keys: "⌘N / Ctrl+N", description: "Create New Session", icon: Plus },
        { keys: "Enter", description: "Send message", icon: null },
        { keys: "Shift+Enter", description: "New line in message", icon: null },
      ]
    },
    {
      category: "Interface",
      items: [
        { keys: "⌘/ / Ctrl+/", description: "Cycle Theme (Light → Dark → System)", icon: Palette },
        { keys: "Toggle Sidebar", description: "Available in Command Palette", icon: PanelLeftClose },
      ]
    }
  ];

  return (
    <Dialog open={isHelpDialogOpen} onOpenChange={setHelpDialogOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these keyboard shortcuts to navigate OpenCode WebUI efficiently
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 mt-3">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="typography-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-1 px-2"
                  >
                    <div className="flex items-center gap-2">
                      {shortcut.icon && (
                        <shortcut.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="typography-xs">{shortcut.description}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.split(' / ').map((keyCombo, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="typography-xs text-muted-foreground mx-1">or</span>}
                          <kbd className="inline-flex items-center px-1.5 py-0.5 typography-xs font-mono bg-muted rounded border border-border/20">
                            {keyCombo}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-2 bg-muted/30 rounded-lg">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div className="typography-xs text-muted-foreground">
              <p className="font-medium mb-1">Pro Tips:</p>
              <ul className="space-y-0.5 typography-xs">
                <li>• Use Command Palette (Ctrl+X) to quickly access all actions</li>
                <li>• Recent sessions and directories appear in Command Palette</li>
                <li>• Theme cycling remembers your preference across sessions</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};