export type PromptEnhancerGroupId = string;

export const CORE_PROMPT_ENHANCER_GROUP_IDS = [
  'implementationmode',
  'scope',
  'testing',
  'runtimeaccess',
  'documentation',
  'surfaceareas',
] as const;

export interface PromptEnhancerOption {
  id: string;
  label: string;
  summaryLabel: string;
  description?: string;
  instruction: string;
}

export interface PromptEnhancerGroup {
  id: PromptEnhancerGroupId;
  label: string;
  helperText?: string;
  summaryHeading: string;
  multiSelect: boolean;
  defaultOptionId?: string;
  options: PromptEnhancerOption[];
}

export interface PromptEnhancerConfig {
  version: number;
  groupOrder: PromptEnhancerGroupId[];
  groups: Record<PromptEnhancerGroupId, PromptEnhancerGroup>;
}

export interface PromptEnhancerStateSnapshot {
  config: PromptEnhancerConfig;
  updatedAt: number;
}

export const DEFAULT_PROMPT_ENHANCER_GROUP_ORDER: PromptEnhancerGroupId[] = [...CORE_PROMPT_ENHANCER_GROUP_IDS];

export const isCorePromptEnhancerGroupId = (groupId: PromptEnhancerGroupId): groupId is (typeof CORE_PROMPT_ENHANCER_GROUP_IDS)[number] =>
  CORE_PROMPT_ENHANCER_GROUP_IDS.includes(groupId as (typeof CORE_PROMPT_ENHANCER_GROUP_IDS)[number]);
