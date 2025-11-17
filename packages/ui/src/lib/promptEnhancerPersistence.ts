import type { PromptEnhancerConfig, PromptEnhancerGroup } from '@/types/promptEnhancer';
import { isDesktopRuntime } from '@/lib/desktop';

export interface PromptEnhancerPreferences {
  version: number;
  groups: PromptEnhancerConfig['groups'];
  groupOrder: PromptEnhancerConfig['groupOrder'];
}

type RawPreferences = {
  version?: unknown;
  groups?: Record<string, unknown>;
  groupOrder?: unknown;
};

const sanitizeGroupId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  return normalized;
};

const sanitizeOption = (option: unknown): PromptEnhancerGroup['options'][number] | null => {
  if (!option || typeof option !== 'object') {
    return null;
  }
  const candidate = option as Record<string, unknown>;
  const id = typeof candidate.id === 'string' ? candidate.id : null;
  const label = typeof candidate.label === 'string' ? candidate.label : null;
  const summaryLabel = typeof candidate.summaryLabel === 'string' ? candidate.summaryLabel : label;
  const description = typeof candidate.description === 'string' ? candidate.description : undefined;
  const instruction = typeof candidate.instruction === 'string' ? candidate.instruction : null;
  if (!id || !label || !instruction) {
    return null;
  }
  return {
    id,
    label,
    summaryLabel: summaryLabel ?? label,
    description,
    instruction,
  };
};

const sanitizeGroup = (group: unknown, groupId: string): PromptEnhancerGroup | null => {
  if (!group || typeof group !== 'object') {
    return null;
  }
  const candidate = group as Record<string, unknown>;
  const optionsSource = Array.isArray(candidate.options) ? candidate.options : [];
  const options = optionsSource
    .map((option) => sanitizeOption(option))
    .filter((option): option is PromptEnhancerGroup['options'][number] => Boolean(option));
  if (options.length === 0) {
    return null;
  }
  const multiSelect = Boolean(candidate.multiSelect);
  const defaultOptionId =
    !multiSelect && typeof candidate.defaultOptionId === 'string' && options.some((option) => option.id === candidate.defaultOptionId)
      ? (candidate.defaultOptionId as string)
      : undefined;
  return {
    id: groupId as PromptEnhancerGroup['id'],
    label: typeof candidate.label === 'string' ? candidate.label : '',
    helperText: typeof candidate.helperText === 'string' ? candidate.helperText : undefined,
    summaryHeading: typeof candidate.summaryHeading === 'string' ? candidate.summaryHeading : '',
    multiSelect,
    defaultOptionId,
    options,
  };
};

const sanitizePreferences = (payload: RawPreferences | null | undefined): PromptEnhancerPreferences | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const groupsInput = payload.groups;
  if (!groupsInput || typeof groupsInput !== 'object') {
    return null;
  }
  const groups: Record<string, PromptEnhancerGroup> = {};
  for (const [groupId, groupValue] of Object.entries(groupsInput)) {
    const sanitized = sanitizeGroup(groupValue, groupId);
    if (sanitized) {
      groups[groupId] = sanitized;
    }
  }
  if (Object.keys(groups).length === 0) {
    return null;
  }
  const version = typeof payload.version === 'number' && Number.isFinite(payload.version) ? payload.version : 1;
  const orderSource = Array.isArray(payload.groupOrder) ? payload.groupOrder : [];
  const groupOrder = orderSource
    .map((entry) => sanitizeGroupId(entry))
    .filter((id): id is string => id.length > 0 && Boolean(groups[id]));
  if (groupOrder.length === 0) {
    groupOrder.push(...Object.keys(groups));
  }
  return {
    version,
    groups: groups as PromptEnhancerConfig['groups'],
    groupOrder: groupOrder as PromptEnhancerConfig['groupOrder'],
  };
};

export const loadPromptEnhancerPreferences = async (): Promise<PromptEnhancerPreferences | null> => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return null;
  }
  const api = window.opencodePromptEnhancer;
  if (!api || typeof api.load !== 'function') {
    return null;
  }
  try {
    const raw = (await api.load()) as RawPreferences | null | undefined;
    return sanitizePreferences(raw);
  } catch (error) {
    console.warn('Failed to load prompt enhancer preferences from desktop storage:', error);
    return null;
  }
};

export const savePromptEnhancerPreferences = async (
  preferences: PromptEnhancerPreferences,
): Promise<boolean> => {
  if (typeof window === 'undefined' || !isDesktopRuntime()) {
    return false;
  }
  const api = window.opencodePromptEnhancer;
  if (!api || typeof api.save !== 'function') {
    return false;
  }
  try {
    const result = await api.save(preferences);
    return Boolean(result?.success);
  } catch (error) {
    console.warn('Failed to save prompt enhancer preferences to desktop storage:', error);
    return false;
  }
};
