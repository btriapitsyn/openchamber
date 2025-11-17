import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_PROMPT_ENHANCER_GROUP_ORDER,
  isCorePromptEnhancerGroupId,
  type PromptEnhancerConfig,
  type PromptEnhancerGroup,
  type PromptEnhancerGroupId,
  type PromptEnhancerOption,
} from '@/types/promptEnhancer';
import defaultConfigJson from '@/assets/prompt-enhancer-defaults.json';
import { getSafeStorage } from './utils/safeStorage';
import { isDesktopRuntime } from '../lib/desktop';
import {
  loadPromptEnhancerPreferences,
  savePromptEnhancerPreferences,
  type PromptEnhancerPreferences,
} from '../lib/promptEnhancerPersistence';
import {
  fetchPromptEnhancerConfig,
  persistPromptEnhancerConfig,
} from '@/lib/promptApi';

const deepClone = <T>(value: T): T =>
  (typeof structuredClone === 'function' ? structuredClone(value) : (JSON.parse(JSON.stringify(value)) as T));

const DEFAULT_CONFIG: PromptEnhancerConfig = deepClone(defaultConfigJson as PromptEnhancerConfig);

const sanitizeOptionId = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
const sanitizeGroupId = (value: string): string => sanitizeOptionId(value);

const humanizeGroupId = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ') || 'Group';

const DEFAULT_OPTION_TEMPLATE: Pick<PromptEnhancerOption, 'label' | 'summaryLabel' | 'description' | 'instruction'> = {
  label: 'New option',
  summaryLabel: 'New option',
  description: 'Describe what this option influences.',
  instruction: 'Explain the guidance this option should add to the refined prompt.',
};

const buildDefaultGroup = (groupId: PromptEnhancerGroupId, multiSelect?: boolean): PromptEnhancerGroup => {
  const normalizedId = sanitizeGroupId(groupId);
  const label = humanizeGroupId(normalizedId);
  const optionId = 'default';
  const option: PromptEnhancerOption = {
    id: optionId,
    label: DEFAULT_OPTION_TEMPLATE.label,
    summaryLabel: DEFAULT_OPTION_TEMPLATE.summaryLabel,
    description: DEFAULT_OPTION_TEMPLATE.description,
    instruction: DEFAULT_OPTION_TEMPLATE.instruction,
  };
  return {
    id: normalizedId,
    label,
    helperText: undefined,
    summaryHeading: label,
    multiSelect: Boolean(multiSelect),
    defaultOptionId: multiSelect ? undefined : optionId,
    options: [option],
  };
};

const ensureGroupIntegrity = (
  group: Partial<PromptEnhancerGroup> | null | undefined,
  fallback: PromptEnhancerGroup,
): PromptEnhancerGroup => {
  const optionMap = new Map<string, PromptEnhancerOption>();
  const optionsSource = Array.isArray(group?.options) ? group?.options : [];
  for (const entry of optionsSource) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const option = entry as Partial<PromptEnhancerOption>;
    if (!option.id || typeof option.id !== 'string') continue;
    const normalizedId = sanitizeOptionId(option.id);
    if (!normalizedId) continue;
    const instruction = typeof option.instruction === 'string' ? option.instruction.trim() : '';
    if (!instruction) continue;
    const baseLabel =
      typeof option.label === 'string' && option.label.trim().length > 0
        ? option.label.trim()
        : DEFAULT_OPTION_TEMPLATE.label;
    const summaryLabel =
      typeof option.summaryLabel === 'string' && option.summaryLabel.trim().length > 0
        ? option.summaryLabel.trim()
        : baseLabel;
    const description =
      typeof option.description === 'string' && option.description.trim().length > 0
        ? option.description.trim()
        : undefined;
    optionMap.set(normalizedId, {
      id: normalizedId,
      label: baseLabel,
      summaryLabel,
      description,
      instruction,
    });
  }

  const fallbackOptions = fallback.options.map((option) => optionMap.get(option.id) ?? option);
  const extraOptions = Array.from(optionMap.values()).filter(
    (option) => !fallbackOptions.some((existing) => existing.id === option.id),
  );
  const mergedOptions = [...fallbackOptions, ...extraOptions].filter((option) => option.instruction.trim().length > 0);
  const options = mergedOptions.length > 0 ? mergedOptions : fallback.options;

  let defaultOptionId: string | undefined = fallback.defaultOptionId;
  const multiSelect = Boolean(group?.multiSelect ?? fallback.multiSelect);
  if (!multiSelect) {
    const candidateDefault = typeof group?.defaultOptionId === 'string'
      ? sanitizeOptionId(group.defaultOptionId)
      : fallback.defaultOptionId;
    if (candidateDefault && options.some((option) => option.id === candidateDefault)) {
      defaultOptionId = candidateDefault;
    } else {
      defaultOptionId = options[0]?.id ?? fallback.defaultOptionId;
    }
  } else {
    defaultOptionId = undefined;
  }

  const label =
    typeof group?.label === 'string' && group.label.trim().length > 0 ? group.label.trim() : fallback.label;
  const helperText =
    typeof group?.helperText === 'string' && group.helperText.trim().length > 0
      ? group.helperText.trim()
      : fallback.helperText;
  const summaryHeading =
    typeof group?.summaryHeading === 'string' && group.summaryHeading.trim().length > 0
      ? group.summaryHeading.trim()
      : fallback.summaryHeading;

  return {
    id: fallback.id,
    label,
    helperText,
    summaryHeading,
    multiSelect,
    defaultOptionId,
    options,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const sanitizeConfig = (config: unknown): PromptEnhancerConfig => {
  if (!isRecord(config)) {
    return cloneConfig(DEFAULT_CONFIG);
  }

  const configRecord = config as Record<string, unknown>;
  const groupSource = isRecord(configRecord.groups) ? (configRecord.groups as Record<string, unknown>) : {};
  const groupEntries = new Map<string, Partial<PromptEnhancerGroup>>();
  for (const [rawId, rawGroup] of Object.entries(groupSource)) {
    const normalizedId = sanitizeGroupId(rawId);
    if (!normalizedId || groupEntries.has(normalizedId)) {
      continue;
    }
    if (isRecord(rawGroup)) {
      groupEntries.set(normalizedId, rawGroup as Partial<PromptEnhancerGroup>);
    }
  }

  const rawOrder: Array<unknown> = Array.isArray(configRecord.groupOrder)
    ? (configRecord.groupOrder as unknown[])
    : [];
  const normalizedOrder: string[] = Array.from(
    new Set(
      rawOrder
        .map((id) => sanitizeGroupId(String(id)))
        .filter((id): id is string => Boolean(id) && !id.startsWith('_'))
    )
  );

  const groups: Record<PromptEnhancerGroupId, PromptEnhancerGroup> = {};
  const seen = new Set<string>();

  const pushGroup = (groupId: string) => {
    if (!groupId || seen.has(groupId)) {
      return;
    }
    const fallback = isCorePromptEnhancerGroupId(groupId)
      ? DEFAULT_CONFIG.groups[groupId]
      : buildDefaultGroup(groupId, groupEntries.get(groupId)?.multiSelect);
    const sanitized = ensureGroupIntegrity(groupEntries.get(groupId), fallback);
    groups[groupId] = sanitized;
    seen.add(groupId);
  };

  normalizedOrder.forEach((groupId) => pushGroup(groupId));

  for (const coreId of DEFAULT_PROMPT_ENHANCER_GROUP_ORDER) {
    pushGroup(coreId);
  }

  for (const [customId] of groupEntries) {
    pushGroup(customId);
  }

  let groupOrder = Array.from(seen);
  if (groupOrder.length === 0) {
    for (const groupId of DEFAULT_CONFIG.groupOrder) {
      pushGroup(groupId);
    }
    groupOrder = Array.from(seen);
    if (groupOrder.length === 0) {
      groupOrder = [...DEFAULT_CONFIG.groupOrder];
    }
  }

  const versionInput = configRecord.version;
  const version =
    typeof versionInput === 'number' && Number.isFinite(versionInput)
      ? versionInput
      : DEFAULT_CONFIG.version;

  return {
    version,
    groupOrder: groupOrder as PromptEnhancerGroupId[],
    groups,
  };
};

const cloneConfig = (config: PromptEnhancerConfig): PromptEnhancerConfig =>
  typeof structuredClone === 'function'
    ? structuredClone(config)
    : (JSON.parse(JSON.stringify(config)) as PromptEnhancerConfig);

const buildEmptyPreferences = (): PromptEnhancerPreferences => ({
  version: DEFAULT_CONFIG.version,
  groups: cloneConfig(DEFAULT_CONFIG).groups,
  groupOrder: [...DEFAULT_CONFIG.groupOrder],
});

const markUpdated = (
  config: PromptEnhancerConfig,
  previousGroupId?: PromptEnhancerGroupId,
): { config: PromptEnhancerConfig; updatedAt: number; activeGroupId: PromptEnhancerGroupId } => {
  const candidateActive = previousGroupId && config.groupOrder.includes(previousGroupId)
    ? previousGroupId
    : config.groupOrder[0] ?? 'implementation-mode';
  return {
    config,
    updatedAt: Date.now(),
    activeGroupId: candidateActive,
  };
};

interface PromptEnhancerConfigStore {
  config: PromptEnhancerConfig;
  updatedAt: number;
  activeGroupId: PromptEnhancerGroupId;
  isServerSynced: boolean;
  hasAttemptedServerLoad: boolean;
  isDesktopSynced: boolean;
  hasAttemptedDesktopLoad: boolean;
  loadServerPreferences: (options?: { force?: boolean }) => Promise<boolean>;
  saveServerPreferences: () => Promise<boolean>;
  loadDesktopPreferences: (options?: { force?: boolean }) => Promise<boolean>;
  saveDesktopPreferences: () => Promise<boolean>;
  resetToDefaults: () => void;
  setActiveGroupId: (groupId: PromptEnhancerGroupId) => void;
  updateGroupMetadata: (
    groupId: PromptEnhancerGroupId,
    data: Pick<PromptEnhancerGroup, 'label' | 'helperText' | 'summaryHeading'>,
  ) => void;
  setGroupMultiSelect: (groupId: PromptEnhancerGroupId, multiSelect: boolean) => void;
  addGroup: (input?: { id?: string; label?: string; multiSelect?: boolean }) => PromptEnhancerGroupId | null;
  removeGroup: (groupId: PromptEnhancerGroupId) => void;
  reorderGroups: (nextOrder: PromptEnhancerGroupId[]) => void;
  setDefaultOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  addOption: (groupId: PromptEnhancerGroupId, option: Omit<PromptEnhancerOption, 'id'> & { id?: string }) => void;
  updateOption: (
    groupId: PromptEnhancerGroupId,
    optionId: string,
    updater: Partial<Omit<PromptEnhancerOption, 'id'>> & { id?: string },
  ) => void;
  removeOption: (groupId: PromptEnhancerGroupId, optionId: string) => void;
  replaceConfig: (next: PromptEnhancerConfig) => void;
}

export const usePromptEnhancerConfig = create<PromptEnhancerConfigStore>()(
  devtools(
    persist(
      (set, get) => ({
        config: cloneConfig(DEFAULT_CONFIG),
        updatedAt: Date.now(),
        activeGroupId: DEFAULT_CONFIG.groupOrder[0],
        isServerSynced: false,
        hasAttemptedServerLoad: false,
        isDesktopSynced: false,
        hasAttemptedDesktopLoad: false,

        loadServerPreferences: async (options) => {
          const force = Boolean(options?.force);
          const state = get();
          if (!force && state.hasAttemptedServerLoad) {
            return false;
          }
          set({ hasAttemptedServerLoad: true });
          try {
            const payload = await fetchPromptEnhancerConfig();
            if (!payload) {
              return false;
            }
            let sanitized: PromptEnhancerConfig;
            try {
              sanitized = sanitizeConfig(payload);
            } catch (error) {
              console.warn('Malformed prompt enhancer config from server, falling back to defaults:', error);
              sanitized = cloneConfig(DEFAULT_CONFIG);
            }
            set((current) => ({
              ...markUpdated(sanitized, current.activeGroupId),
              isServerSynced: true,
              hasAttemptedServerLoad: true,
            }));
            return true;
          } catch (error) {
            console.warn('Failed to load prompt enhancer settings from server:', error);
            set({ hasAttemptedServerLoad: true });
            return false;
          }
        },

        saveServerPreferences: async () => {
          try {
            const state = get();
            const payload: PromptEnhancerConfig = cloneConfig(state.config);
            const savedConfig = await persistPromptEnhancerConfig(payload);
            const sanitized = sanitizeConfig(savedConfig);
            set((current) => ({
              ...markUpdated(sanitized, current.activeGroupId),
              isServerSynced: true,
              hasAttemptedServerLoad: true,
            }));
            return true;
          } catch (error) {
            console.warn('Failed to save prompt enhancer settings to server:', error);
            return false;
          }
        },

        loadDesktopPreferences: async (options) => {
          if (!isDesktopRuntime()) {
            return false;
          }
          const force = Boolean(options?.force);
          const state = get();
          if (!force && state.hasAttemptedDesktopLoad) {
            return false;
          }
          set({ hasAttemptedDesktopLoad: true });
          try {
            const payload = await loadPromptEnhancerPreferences();
            if (!payload) {
              return false;
            }
            const sanitized = sanitizeConfig({
              version: payload.version ?? DEFAULT_CONFIG.version,
              groupOrder: payload.groupOrder ?? DEFAULT_CONFIG.groupOrder,
              groups: payload.groups ?? DEFAULT_CONFIG.groups,
            });
            set((current) => ({
              ...markUpdated(sanitized, current.activeGroupId),
              isDesktopSynced: true,
              hasAttemptedDesktopLoad: true,
            }));
            return true;
          } catch (error) {
            console.warn('Failed to load prompt enhancer settings from desktop storage:', error);
            return false;
          }
        },

        saveDesktopPreferences: async () => {
          if (!isDesktopRuntime()) {
            return false;
          }
          try {
            const state = get();
            const payload: PromptEnhancerPreferences = {
              version: state.config.version,
              groups: state.config.groups,
              groupOrder: state.config.groupOrder,
            };
            const success = await savePromptEnhancerPreferences(payload);
            if (success) {
              set({ isDesktopSynced: true, hasAttemptedDesktopLoad: true });
            }
            return success;
          } catch (error) {
            console.warn('Failed to save prompt enhancer settings to desktop storage:', error);
            return false;
          }
        },

        resetToDefaults: () => {
          set((state) => ({
            ...markUpdated(cloneConfig(DEFAULT_CONFIG), state.activeGroupId),
            isServerSynced: false,
            isDesktopSynced: false,
            hasAttemptedServerLoad: true,
            hasAttemptedDesktopLoad: state.hasAttemptedDesktopLoad,
          }));
        },

        setActiveGroupId: (groupId) => {
          set((state) => ({
            activeGroupId: state.config.groupOrder.includes(groupId) ? groupId : state.config.groupOrder[0],
          }));
        },

        updateGroupMetadata: (groupId, data) => {
          set((state) => {
            const current = state.config.groups[groupId];
            if (!current) {
              return {};
            }
            const trimmedLabel = data.label?.trim();
            const trimmedHelperText = data.helperText?.trim();
            const trimmedSummary = data.summaryHeading?.trim();
            const nextGroup: PromptEnhancerGroup = {
              ...current,
              label: trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : current.label,
              helperText:
                trimmedHelperText && trimmedHelperText.length > 0 ? trimmedHelperText : undefined,
              summaryHeading:
                trimmedSummary && trimmedSummary.length > 0 ? trimmedSummary : current.summaryHeading,
            };
            if (
              nextGroup.label === current.label &&
              (nextGroup.helperText ?? null) === (current.helperText ?? null) &&
              nextGroup.summaryHeading === current.summaryHeading
            ) {
              return {};
            }
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        setGroupMultiSelect: (groupId, multiSelect) => {
          set((state) => {
            const current = state.config.groups[groupId];
            if (!current) {
              return {};
            }
            if (current.multiSelect === multiSelect) {
              return {};
            }
            const nextGroup: PromptEnhancerGroup = {
              ...current,
              multiSelect,
              defaultOptionId: multiSelect ? undefined : current.defaultOptionId ?? current.options[0]?.id,
            };
            if (!multiSelect && (!nextGroup.defaultOptionId || !nextGroup.options.some((option) => option.id === nextGroup.defaultOptionId))) {
              nextGroup.defaultOptionId = nextGroup.options[0]?.id;
            }
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        addGroup: (input) => {
          const rawId = input?.id?.trim() || '';
          const generatedIdBase = rawId || humanizeGroupId(`group-${Date.now()}`);
          const normalizedId = sanitizeGroupId(generatedIdBase) || `group-${Math.random().toString(36).slice(2, 8)}`;
          const label = input?.label?.trim() || humanizeGroupId(normalizedId);
          const multiSelect = Boolean(input?.multiSelect);

          let createdId: PromptEnhancerGroupId | null = null;
          set((state) => {
            if (state.config.groups[normalizedId]) {
              return {};
            }
            const nextGroup: PromptEnhancerGroup = buildDefaultGroup(normalizedId, multiSelect);
            nextGroup.label = label;
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groupOrder: [...state.config.groupOrder, normalizedId],
              groups: { ...state.config.groups, [normalizedId]: nextGroup },
            };
            createdId = normalizedId;
            return {
              ...markUpdated(nextConfig, normalizedId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
          return createdId;
        },

        removeGroup: (groupId) => {
          const normalized = sanitizeGroupId(groupId);
          if (!normalized || DEFAULT_PROMPT_ENHANCER_GROUP_ORDER.includes(normalized)) {
            return;
          }
          set((state) => {
            if (!state.config.groups[normalized]) {
              return {};
            }
            const nextGroups = { ...state.config.groups };
            delete nextGroups[normalized];
            const nextOrder = state.config.groupOrder.filter((id) => id !== normalized);
            if (nextOrder.length === 0) {
              nextOrder.push(...DEFAULT_CONFIG.groupOrder);
            }
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groupOrder: nextOrder,
              groups: nextGroups,
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        reorderGroups: (nextOrder) => {
          const sanitizedOrder = nextOrder
            .map((id) => sanitizeGroupId(id))
            .filter((id) => id && get().config.groups[id]);
          if (sanitizedOrder.length === 0) {
            return;
          }
          set((state) => {
            const combined = Array.from(
              new Set([...sanitizedOrder, ...state.config.groupOrder.filter((id) => !sanitizedOrder.includes(id))]),
            );
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groupOrder: combined,
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        setDefaultOption: (groupId, optionId) => {
          set((state) => {
            const group = state.config.groups[groupId];
            if (!group || group.multiSelect) {
              return {};
            }
            const normalized = sanitizeOptionId(optionId);
            if (!normalized || group.defaultOptionId === normalized) {
              return {};
            }
            if (!group.options.some((option) => option.id === normalized)) {
              return {};
            }
            const nextGroup: PromptEnhancerGroup = {
              ...group,
              defaultOptionId: normalized,
            };
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        addOption: (groupId, option) => {
          set((state) => {
            const group = state.config.groups[groupId];
            if (!group) {
              return {};
            }
            const generatedId = option.id ? sanitizeOptionId(option.id) : sanitizeOptionId(option.label ?? 'option');
            if (!generatedId || group.options.some((existing) => existing.id === generatedId)) {
              return {};
            }
            const instruction = option.instruction?.trim() ?? '';
            if (!instruction) {
              return {};
            }
            const newOption: PromptEnhancerOption = {
              id: generatedId,
              label: option.label?.trim() || DEFAULT_OPTION_TEMPLATE.label,
              summaryLabel: option.summaryLabel?.trim() || option.label?.trim() || DEFAULT_OPTION_TEMPLATE.summaryLabel,
              description: option.description?.trim() || undefined,
              instruction,
            };
            const nextGroup: PromptEnhancerGroup = {
              ...group,
              options: [...group.options, newOption],
            };
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        updateOption: (groupId, optionId, updater) => {
          set((state) => {
            const group = state.config.groups[groupId];
            if (!group) {
              return {};
            }
            const normalized = sanitizeOptionId(optionId);
            const index = group.options.findIndex((option) => option.id === normalized);
            if (index === -1) {
              return {};
            }
            const currentOption = group.options[index];
            const nextId = updater.id ? sanitizeOptionId(updater.id) : currentOption.id;
            if (!nextId) {
              return {};
            }
            if (
              nextId !== currentOption.id &&
              group.options.some((option, idx) => idx !== index && option.id === nextId)
            ) {
              return {};
            }
            const trimmedLabel = updater.label?.trim();
            const trimmedSummary = updater.summaryLabel?.trim();
            const trimmedDescription = updater.description?.trim();
            const trimmedInstruction = updater.instruction?.trim();
            const nextInstruction = trimmedInstruction && trimmedInstruction.length > 0 ? trimmedInstruction : currentOption.instruction;
            if (!nextInstruction) {
              return {};
            }
            const nextOption: PromptEnhancerOption = {
              ...currentOption,
              id: nextId,
              label: trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : currentOption.label,
              summaryLabel:
                trimmedSummary && trimmedSummary.length > 0
                  ? trimmedSummary
                  : trimmedLabel && trimmedLabel.length > 0
                    ? trimmedLabel
                    : currentOption.summaryLabel,
              description: trimmedDescription && trimmedDescription.length > 0 ? trimmedDescription : undefined,
              instruction: nextInstruction,
            };
            const nextOptions = [...group.options];
            nextOptions[index] = nextOption;

            let defaultOptionId = group.defaultOptionId;
            if (!group.multiSelect) {
              if (!defaultOptionId || defaultOptionId === currentOption.id) {
                defaultOptionId = nextOption.id;
              } else if (!nextOptions.some((option) => option.id === defaultOptionId)) {
                defaultOptionId = nextOption.id;
              }
            }

            const nextGroup: PromptEnhancerGroup = {
              ...group,
              options: nextOptions,
              defaultOptionId,
            };
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        removeOption: (groupId, optionId) => {
          set((state) => {
            const group = state.config.groups[groupId];
            if (!group) {
              return {};
            }
            const normalized = sanitizeOptionId(optionId);
            if (group.options.length <= 1) {
              return {};
            }
            const remaining = group.options.filter((option) => option.id !== normalized);
            if (remaining.length === group.options.length) {
              return {};
            }
            let defaultOptionId = group.defaultOptionId;
            if (!group.multiSelect) {
              if (!defaultOptionId || defaultOptionId === normalized || !remaining.some((option) => option.id === defaultOptionId)) {
                defaultOptionId = remaining[0]?.id;
              }
            }
            const nextGroup: PromptEnhancerGroup = {
              ...group,
              options: remaining,
              defaultOptionId,
            };
            const nextConfig: PromptEnhancerConfig = {
              ...state.config,
              groups: { ...state.config.groups, [groupId]: nextGroup },
            };
            return {
              ...markUpdated(nextConfig, state.activeGroupId),
              isServerSynced: false,
              isDesktopSynced: false,
            };
          });
        },

        replaceConfig: (next) => {
          const sanitized = sanitizeConfig(next);
          set((state) => ({
            ...markUpdated(sanitized, state.activeGroupId),
            isServerSynced: false,
            isDesktopSynced: false,
            hasAttemptedServerLoad: true,
          }));
        },
      }),
      {
        name: 'prompt-enhancer-config',
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          config: state.config,
          updatedAt: state.updatedAt,
        }),
        merge: (persisted, current) => {
          const persistedRecord = isRecord(persisted) ? (persisted as Record<string, unknown>) : {};
          const persistedConfig = sanitizeConfig(persistedRecord.config ?? null);
          const previousGroup = current.activeGroupId;
          const updatedAtValue = persistedRecord.updatedAt;
          const updatedAt =
            typeof updatedAtValue === 'number' && Number.isFinite(updatedAtValue)
              ? updatedAtValue
              : Date.now();
          const fallbackActiveGroup =
            persistedConfig.groupOrder[0] ??
            current.config.groupOrder[0] ??
            DEFAULT_CONFIG.groupOrder[0];
          const activeGroupId = persistedConfig.groupOrder.includes(previousGroup)
            ? previousGroup
            : fallbackActiveGroup;
          return {
            ...current,
            config: persistedConfig,
            updatedAt,
            hasAttemptedServerLoad: current.hasAttemptedServerLoad,
            hasAttemptedDesktopLoad: current.hasAttemptedDesktopLoad,
            activeGroupId,
          };
        },
      },
    ),
    {
      name: 'prompt-enhancer-config',
    },
  ),
);

export const usePromptEnhancerGroup = (groupId: PromptEnhancerGroupId): PromptEnhancerGroup =>
  usePromptEnhancerConfig((state) => state.config.groups[groupId]);

export const getDefaultPromptEnhancerConfig = (): PromptEnhancerConfig => cloneConfig(DEFAULT_CONFIG);

export const getEmptyPromptEnhancerPreferences = (): PromptEnhancerPreferences => buildEmptyPreferences();

if (typeof window !== 'undefined') {
  const store = usePromptEnhancerConfig.getState();
  store.loadServerPreferences().catch((error) => {
    console.warn('Prompt enhancer server preferences load failed:', error);
  });
  if (isDesktopRuntime()) {
    store.loadDesktopPreferences().catch((error) => {
      console.warn('Prompt enhancer desktop preferences load failed:', error);
    });
  }
}
