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
  GitBranch,
  Control,
  ArrowFatUp,
  Terminal,
  Gear,
  Sparkle,
  CursorText,
  Gear as Keyboard,
  Question as HelpCircle,
  ListStar,
  PauseCircle,
} from '@phosphor-icons/react';

const renderKeyToken = (token: string, index: number) => {
  const normalized = token.trim().toLowerCase();

  if (normalized === 'ctrl' || normalized === 'control') {
    return <Control key={`ctrl-${index}`} className="h-3.5 w-3.5" weight="regular" />;
  }

  if (normalized === 'shift' || normalized === '⇧') {
    return <ArrowFatUp key={`shift-${index}`} className="h-3.5 w-3.5" weight="regular" />;
  }

  if (normalized === '⌘' || normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
    return <Command key={`cmd-${index}`} className="h-3.5 w-3.5" weight="regular" />;
  }

  return <span key={`key-${index}`} className="text-xs font-medium">{token.trim()}</span>;
};

const renderKeyCombo = (combo: string) => {
  const tokens = combo.split('+').map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    return combo.trim();
  }

  return tokens.map((token, index) => (
    <React.Fragment key={`${token}-${index}`}>
      {index > 0 && <span className="text-muted-foreground text-[10px]">+</span>}
      {renderKeyToken(token, index)}
    </React.Fragment>
  ));
};

type ShortcutIcon = React.ComponentType<{ className?: string; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;

type ShortcutItem = {
  keys: string | string[];
  description: string;
  icon: ShortcutIcon | null;
};

type ShortcutSection = {
  category: string;
  items: ShortcutItem[];
};

export const HelpDialog: React.FC = () => {
  const { isHelpDialogOpen, setHelpDialogOpen } = useUIStore();

  const shortcuts: ShortcutSection[] = [
    {
      category: "Navigation & Commands",
      items: [
        { keys: ["Ctrl + X"], description: "Open Command Palette", icon: Command },
        { keys: ["Ctrl + H"], description: "Show Keyboard Shortcuts (this dialog)", icon: HelpCircle },
        { keys: ["Ctrl + L"], description: "Open Session Switcher", icon: ListStar },
      ]
    },
    {
      category: "Session Management",
      items: [
        { keys: ["Ctrl + N"], description: "Create New Session", icon: Plus },
        { keys: ["Shift + Ctrl + N"], description: "Open Session Creator (worktree support)", icon: GitBranch },
        { keys: ["Ctrl + I"], description: "Focus Chat Input", icon: CursorText },
        { keys: ["Esc + Esc"], description: "Abort active run (double press)", icon: PauseCircle },
      ]
    },
    {
      category: "Interface",
      items: [
        { keys: ["⌘ + /", "Ctrl + /"], description: "Cycle Theme (Light → Dark → System)", icon: Palette },
        { keys: ["Ctrl + G"], description: "Open Git Panel", icon: GitBranch },
        { keys: ["Ctrl + T"], description: "Open Terminal", icon: Terminal },
        { keys: ["Ctrl + P"], description: "Open Prompt Enhancer", icon: Sparkle },
        { keys: ["Ctrl + ,"], description: "Open Settings", icon: Gear },
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
            Use these keyboard shortcuts to navigate OpenChamber efficiently
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-3">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="typography-meta font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
                        <shortcut.icon className="h-3.5 w-3.5 text-muted-foreground" weight="regular" />
                      )}
                      <span className="typography-meta">{shortcut.description}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {(Array.isArray(shortcut.keys) ? shortcut.keys : shortcut.keys.split(' / ')).map((keyCombo: string, i: number) => (
                        <React.Fragment key={`${keyCombo}-${i}`}>
                          {i > 0 && <span className="typography-meta text-muted-foreground mx-1">or</span>}
                          <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 typography-meta font-mono bg-muted rounded border border-border/20">
                            {renderKeyCombo(keyCombo)}
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

        <div className="mt-4 p-2 bg-muted/30 rounded-xl">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
            <div className="typography-meta text-muted-foreground">
              <p className="font-medium mb-1">Pro Tips:</p>
              <ul className="space-y-0.5 typography-meta">
                <li>• Use Command Palette (Ctrl + X) to quickly access all actions</li>
                <li>• The 5 most recent sessions appear in the Command Palette</li>
                <li>• Theme cycling remembers your preference across sessions</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
