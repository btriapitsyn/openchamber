import {
  RiChat4Line,
  RiCodeLine,
  RiFileList3Line,
  RiFolder6Line,
  RiGitBranchLine,
  RiPlayLine,
  RiTerminalBoxLine,
  RiWindow2Line,
} from '@remixicon/react';
import type { RemixiconComponentType } from '@remixicon/react';

export type PaneTabType = 'chat' | 'diff' | 'files' | 'terminal' | 'git' | 'todo' | 'preview' | 'appRunner';

export type DefaultTabType = Exclude<PaneTabType, 'chat' | 'appRunner'>;

export interface TabConfig {
  type: PaneTabType;
  label: string;
  icon: RemixiconComponentType;
  addLabel?: string;
}

export const TAB_CONFIGS: Record<PaneTabType, TabConfig> = {
  chat: { type: 'chat', label: 'Chat', icon: RiChat4Line, addLabel: 'New Chat' },
  files: { type: 'files', label: 'Files', icon: RiFolder6Line },
  diff: { type: 'diff', label: 'Diff', icon: RiCodeLine },
  terminal: { type: 'terminal', label: 'Terminal', icon: RiTerminalBoxLine },
  git: { type: 'git', label: 'Git', icon: RiGitBranchLine },
  todo: { type: 'todo', label: 'Note', icon: RiFileList3Line, addLabel: 'Notes' },
  preview: { type: 'preview', label: 'Preview', icon: RiWindow2Line },
  appRunner: { type: 'appRunner', label: 'Dev Server', icon: RiPlayLine },
};

export const DEFAULT_TAB_TYPES: DefaultTabType[] = ['files', 'diff', 'terminal', 'git', 'todo', 'preview'];

export const getTabLabel = (type: PaneTabType): string => TAB_CONFIGS[type]?.label ?? type;

export const getTabAddLabel = (type: PaneTabType): string => 
  TAB_CONFIGS[type]?.addLabel ?? TAB_CONFIGS[type]?.label ?? type;

export const getTabIcon = (type: PaneTabType): RemixiconComponentType => TAB_CONFIGS[type]?.icon ?? RiFileList3Line;
