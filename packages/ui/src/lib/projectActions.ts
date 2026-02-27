import {
  RiBrainAi3Line,
  RiCheckboxCircleLine,
  RiBugLine,
  RiCodeLine,
  RiCommandLine,
  RiFileTextLine,
  RiFlaskLine,
  RiGitBranchLine,
  RiHammerLine,
  RiPlayLine,
  RiRocketLine,
  RiRobot2Line,
  RiSearchLine,
  RiServerLine,
  RiSettings3Line,
  RiStackLine,
  RiTerminalBoxLine,
  RiToolsLine,
} from '@remixicon/react';
import type { ComponentType } from 'react';
import type {
  OpenChamberProjectAction,
  OpenChamberProjectActionPlatform,
} from '@/lib/openchamberConfig';

export type ProjectActionIconKey =
  | 'play'
  | 'build'
  | 'lint'
  | 'terminal'
  | 'tools'
  | 'bug'
  | 'flask'
  | 'rocket'
  | 'code'
  | 'server'
  | 'branch'
  | 'search'
  | 'settings'
  | 'brain'
  | 'stack'
  | 'robot'
  | 'command'
  | 'file';

export const PROJECT_ACTION_ICONS: Array<{
  key: ProjectActionIconKey;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { key: 'play', label: 'Play', Icon: RiPlayLine },
  { key: 'build', label: 'Build', Icon: RiHammerLine },
  { key: 'lint', label: 'Lint', Icon: RiCheckboxCircleLine },
  { key: 'terminal', label: 'Terminal', Icon: RiTerminalBoxLine },
  { key: 'tools', label: 'Tools', Icon: RiToolsLine },
  { key: 'bug', label: 'Bug', Icon: RiBugLine },
  { key: 'flask', label: 'Flask', Icon: RiFlaskLine },
  { key: 'rocket', label: 'Rocket', Icon: RiRocketLine },
  { key: 'code', label: 'Code', Icon: RiCodeLine },
  { key: 'server', label: 'Server', Icon: RiServerLine },
  { key: 'branch', label: 'Branch', Icon: RiGitBranchLine },
  { key: 'search', label: 'Search', Icon: RiSearchLine },
  { key: 'settings', label: 'Settings', Icon: RiSettings3Line },
  { key: 'brain', label: 'Brain', Icon: RiBrainAi3Line },
  { key: 'stack', label: 'Stack', Icon: RiStackLine },
  { key: 'robot', label: 'Robot', Icon: RiRobot2Line },
  { key: 'command', label: 'Command', Icon: RiCommandLine },
  { key: 'file', label: 'File', Icon: RiFileTextLine },
];

export const PROJECT_ACTION_ICON_MAP = Object.fromEntries(
  PROJECT_ACTION_ICONS.map((entry) => [entry.key, entry.Icon])
) as Record<ProjectActionIconKey, ComponentType<{ className?: string }>>;

export const PROJECT_ACTIONS_UPDATED_EVENT = 'openchamber:project-actions-updated';

export const normalizeProjectActionDirectory = (value: string): string => {
  const trimmed = (value || '').trim().replace(/\\/g, '/');
  if (!trimmed) {
    return '';
  }
  if (trimmed === '/') {
    return '/';
  }
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, '') : trimmed;
};

export const getCurrentProjectActionPlatform = (): OpenChamberProjectActionPlatform => {
  if (typeof navigator === 'undefined') {
    return 'macos';
  }
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('windows')) {
    return 'windows';
  }
  if (ua.includes('linux')) {
    return 'linux';
  }
  return 'macos';
};

export const isProjectActionEnabledOnPlatform = (
  action: OpenChamberProjectAction,
  platform: OpenChamberProjectActionPlatform
): boolean => {
  if (!Array.isArray(action.platforms) || action.platforms.length === 0) {
    return true;
  }
  return action.platforms.includes(platform);
};

export const toProjectActionRunKey = (directory: string, actionId: string): string => {
  return `${normalizeProjectActionDirectory(directory)}::${actionId}`;
};
