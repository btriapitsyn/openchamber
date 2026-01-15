import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/useUIStore";
import { useConfigStore } from "@/stores/useConfigStore";
import {
  RiAddLine,
  RiAiAgentLine,
  RiAiGenerate2,
  RiArrowUpSLine,
  RiBrainAi3Line,
  RiCloseCircleLine,
  RiCodeLine,
  RiCommandLine,
  RiFolder6Line,
  RiGitBranchLine,
  RiLayoutLeftLine,
  RiPaletteLine,
  RiQuestionLine,
  RiSettings3Line,
  RiTerminalBoxLine,
  RiText,
  RiTimeLine,
} from "@remixicon/react";
import { getModifierLabel } from "@/lib/utils";

const renderKeyToken = (token: string, index: number) => {
  const normalized = token.trim().toLowerCase();

  if (normalized === "ctrl" || normalized === "control") {
    return <RiArrowUpSLine key={`ctrl-${index}`} className="h-3.5 w-3.5" />;
  }

  if (
    normalized === "⌘" ||
    normalized === "cmd" ||
    normalized === "command" ||
    normalized === "meta"
  ) {
    return <RiCommandLine key={`cmd-${index}`} className="h-3.5 w-3.5" />;
  }

  return (
    <span key={`key-${index}`} className="text-xs font-medium">
      {token.trim()}
    </span>
  );
};

const renderKeyCombo = (combo: string) => {
  const tokens = combo
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return combo.trim();
  }

  return tokens.map((token, index) => (
    <React.Fragment key={`${token}-${index}`}>
      {index > 0 && (
        <span className="text-muted-foreground text-[10px]">+</span>
      )}
      {renderKeyToken(token, index)}
    </React.Fragment>
  ));
};

type ShortcutIcon = React.ComponentType<{ className?: string }>;

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
  const settingsAutoCreateWorktree = useConfigStore((state) => state.settingsAutoCreateWorktree);

  const mod = getModifierLabel();

  const shortcuts: ShortcutSection[] = [
    {
      category: "Navigation & Commands",
      items: [
        {
          keys: [`${mod} + K`],
          description: "Open Command Palette",
          icon: RiCommandLine,
        },
        {
          keys: [`${mod} + .`],
          description: "Show Keyboard Shortcuts (this dialog)",
          icon: RiQuestionLine,
        },
        {
          keys: [`${mod} + L`],
          description: "Toggle Session Sidebar",
          icon: RiLayoutLeftLine,
        },
        {
          keys: ["Shift + Tab"],
          description: "Cycle Agent (chat input)",
          icon: RiAiAgentLine,
        },
        {
          keys: [`Shift + ${mod} + M`],
          description: "Open Model Selector",
          icon: RiAiGenerate2,
        },
        {
          keys: [`Shift + ${mod} + T`],
          description: "Cycle Thinking Variant",
          icon: RiBrainAi3Line,
        },
      ],
    },
    {
      category: "Session Management",
      items: [
        {
          keys: [`${mod} + N`],
          description: settingsAutoCreateWorktree ? "Create New Session in Worktree" : "Create New Session",
          icon: settingsAutoCreateWorktree ? RiGitBranchLine : RiAddLine,
        },
        {
          keys: [`Shift + ${mod} + N`],
          description: settingsAutoCreateWorktree ? "Create New Session" : "Create New Session in Worktree",
          icon: settingsAutoCreateWorktree ? RiAddLine : RiGitBranchLine,
        },
        { keys: [`${mod} + I`], description: "Focus Chat Input", icon: RiText },
        {
          keys: ["Esc + Esc"],
          description: "Abort active run (double press)",
          icon: RiCloseCircleLine,
        },
      ],
    },
    {
      category: "Interface",
      items: [
        {
          keys: [`${mod} + /`],
          description: "Cycle Theme (Light → Dark → System)",
          icon: RiPaletteLine,
        },
        {
          keys: [`${mod} + 2`],
          description: "Open Diff Panel",
          icon: RiCodeLine,
        },
        {
          keys: [`${mod} + 3`],
          description: "Open Files",
          icon: RiFolder6Line,
        },
        {
          keys: [`${mod} + 4`],
          description: "Open Terminal",
          icon: RiTerminalBoxLine,
        },
        {
          keys: [`${mod} + 5`],
          description: "Open Git Panel",
          icon: RiGitBranchLine,
        },
        {
          keys: [`${mod} + T`],
          description: "Open Timeline",
          icon: RiTimeLine,
        },
        {
          keys: [`${mod} + ,`],
          description: "Open Settings",
          icon: RiSettings3Line,
        },
      ],
    },
  ];

  return (
      <Dialog open={isHelpDialogOpen} onOpenChange={setHelpDialogOpen}>
      <DialogContent className="max-w-2xl w-[min(42rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiSettings3Line className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these keyboard shortcuts to navigate OpenChamber efficiently
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-3 pr-1">
          <div className="space-y-4">
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
                          <shortcut.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="typography-meta">
                          {shortcut.description}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(Array.isArray(shortcut.keys)
                          ? shortcut.keys
                          : shortcut.keys.split(" / ")
                        ).map((keyCombo: string, i: number) => (
                          <React.Fragment key={`${keyCombo}-${i}`}>
                            {i > 0 && (
                              <span className="typography-meta text-muted-foreground mx-1">
                                or
                              </span>
                            )}
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
              <RiQuestionLine className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
              <div className="typography-meta text-muted-foreground">
                <p className="font-medium mb-1">Pro Tips:</p>
                <ul className="space-y-0.5 typography-meta">
                  <li>
                    • Use Command Palette ({mod} + K) to quickly access all
                    actions
                  </li>
                  <li>
                    • The 5 most recent sessions appear in the Command Palette
                  </li>
                  <li>
                    • Theme cycling remembers your preference across sessions
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
