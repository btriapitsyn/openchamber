import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import {
  startConfigUpdate,
  finishConfigUpdate,
} from "@/lib/configUpdate";
import { getSafeStorage } from "./utils/safeStorage";

import { opencodeClient } from '@/lib/opencode/client';

const getCurrentDirectory = (): string | null => {
  const opencodeDirectory = opencodeClient.getDirectory();
  if (typeof opencodeDirectory === 'string' && opencodeDirectory.trim().length > 0) {
    return opencodeDirectory;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = (window as any).__zustand_directory_store__;
    if (store) {
      return store.getState().currentDirectory;
    }
  } catch {
    // ignore
  }

  return null;
};

export type SkillScope = 'user' | 'project';
export type SkillSource = 'opencode' | 'claude' | 'agents';

export interface SupportingFile {
  name: string;
  path: string;
  fullPath: string;
}

export interface SkillSources {
  md: {
    exists: boolean;
    path: string | null;
    dir: string | null;
    fields: string[];
    scope?: SkillScope | null;
    source?: SkillSource | null;
    supportingFiles: SupportingFile[];
    // Actual content values
    name?: string;
    description?: string;
    instructions?: string;
  };
  projectMd?: { exists: boolean; path: string | null };
  claudeMd?: { exists: boolean; path: string | null };
  userMd?: { exists: boolean; path: string | null };
}

export interface DiscoveredSkill {
  name: string;
  path: string;
  scope: SkillScope;
  source: SkillSource;
  description?: string;
}

// Raw skill response from API before transformation
interface RawSkillResponse {
  name: string;
  path: string;
  scope?: SkillScope;
  source?: SkillSource;
  sources?: {
    md?: {
      description?: string;
    };
  };
}

export interface SkillConfig {
  name: string;
  description: string;
  instructions?: string;
  scope?: SkillScope;
  source?: SkillSource;
  supportingFiles?: Array<{ path: string; content: string }>;
}

export interface PendingFile {
  path: string;
  content: string;
}

export interface SkillDraft {
  name: string;
  scope: SkillScope;
  source?: SkillSource;
  description: string;
  instructions?: string;
  pendingFiles?: PendingFile[];
}

export interface SkillDetail {
  name: string;
  sources: SkillSources;
  scope?: SkillScope | null;
  source?: SkillSource | null;
}

interface SkillsStore {
  selectedSkillName: string | null;
  skills: DiscoveredSkill[];
  isLoading: boolean;
  skillDraft: SkillDraft | null;

  setSelectedSkill: (name: string | null) => void;
  setSkillDraft: (draft: SkillDraft | null) => void;
  loadSkills: () => Promise<boolean>;
  getSkillDetail: (name: string) => Promise<SkillDetail | null>;
  createSkill: (config: SkillConfig) => Promise<boolean>;
  updateSkill: (name: string, config: Partial<SkillConfig>) => Promise<boolean>;
  deleteSkill: (name: string) => Promise<boolean>;
  getSkillByName: (name: string) => DiscoveredSkill | undefined;
  
  // Supporting files
  readSupportingFile: (skillName: string, filePath: string) => Promise<string | null>;
  writeSupportingFile: (skillName: string, filePath: string, content: string) => Promise<boolean>;
  deleteSupportingFile: (skillName: string, filePath: string) => Promise<boolean>;
}

declare global {
  interface Window {
    __zustand_skills_store__?: UseBoundStore<StoreApi<SkillsStore>>;
  }
}

const CONFIG_EVENT_SOURCE = "useSkillsStore";

export const useSkillsStore = create<SkillsStore>()(
  devtools(
    persist(
      (set, get) => ({
        selectedSkillName: null,
        skills: [],
        isLoading: false,
        skillDraft: null,

        setSelectedSkill: (name: string | null) => {
          set({ selectedSkillName: name });
        },

        setSkillDraft: (draft: SkillDraft | null) => {
          set({ skillDraft: draft });
        },

        loadSkills: async () => {
          set({ isLoading: true });
          const previousSkills = get().skills;
          let lastError: unknown = null;

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const currentDirectory = getCurrentDirectory();
              const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';
              
              const response = await fetch(`/api/config/skills${queryParams}`);
              if (!response.ok) {
                throw new Error(`Failed to list skills: ${response.status}`);
              }
              
              const data = await response.json();
              const rawSkills: RawSkillResponse[] = data.skills || [];
              const skills: DiscoveredSkill[] = rawSkills.map((s) => ({
                name: s.name,
                path: s.path,
                scope: s.scope ?? 'user',
                source: s.source ?? 'opencode',
                description: s.sources?.md?.description || '',
              }));
              
              set({ skills, isLoading: false });
              return true;
            } catch (error) {
              lastError = error;
              const waitMs = 200 * (attempt + 1);
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }

          console.error("Failed to load skills:", lastError);
          set({ skills: previousSkills, isLoading: false });
          return false;
        },

        getSkillDetail: async (name: string) => {
          try {
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';
            
            const response = await fetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`);
            if (!response.ok) {
              return null;
            }
            
            return await response.json() as SkillDetail;
          } catch {
            return null;
          }
        },

        createSkill: async (config: SkillConfig) => {
          startConfigUpdate("Creating skill...");
          try {
            const skillConfig: Record<string, unknown> = {
              name: config.name,
              description: config.description,
            };

            if (config.instructions) skillConfig.instructions = config.instructions;
            if (config.scope) skillConfig.scope = config.scope;
            if (config.source) skillConfig.source = config.source;
            if (config.supportingFiles) skillConfig.supportingFiles = config.supportingFiles;

            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/skills/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(skillConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create skill';
              throw new Error(message);
            }

            // Skills are just files - no need to reload OpenCode
            // Just refresh our local list
            const loaded = await get().loadSkills();
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          } finally {
            finishConfigUpdate();
          }
        },

        updateSkill: async (name: string, config: Partial<SkillConfig>) => {
          startConfigUpdate("Updating skill...");
          try {
            const skillConfig: Record<string, unknown> = {};

            if (config.description !== undefined) skillConfig.description = config.description;
            if (config.instructions !== undefined) skillConfig.instructions = config.instructions;
            if (config.supportingFiles !== undefined) skillConfig.supportingFiles = config.supportingFiles;

            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(skillConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update skill';
              throw new Error(message);
            }

            // Skills are just files - no need to reload OpenCode
            // Just refresh our local list
            const loaded = await get().loadSkills();
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          } finally {
            finishConfigUpdate();
          }
        },

        deleteSkill: async (name: string) => {
          startConfigUpdate("Deleting skill...");
          try {
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';

            const response = await fetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE'
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete skill';
              throw new Error(message);
            }

            // Skills are just files - no need to reload OpenCode
            // Just refresh our local list
            const loaded = await get().loadSkills();
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selectedSkillName === name) {
              set({ selectedSkillName: null });
            }

            return loaded;
          } catch {
            return false;
          } finally {
            finishConfigUpdate();
          }
        },

        getSkillByName: (name: string) => {
          const { skills } = get();
          return skills.find((s) => s.name === name);
        },

        readSupportingFile: async (skillName: string, filePath: string) => {
          try {
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `&directory=${encodeURIComponent(currentDirectory)}` : '';
            
            const response = await fetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}?${queryParams.slice(1)}`
            );
            if (!response.ok) {
              return null;
            }
            
            const data = await response.json();
            return data.content ?? null;
          } catch {
            return null;
          }
        },

        writeSupportingFile: async (skillName: string, filePath: string, content: string) => {
          try {
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';
            
            const response = await fetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}${queryParams}`,
              {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
              }
            );
            
            return response.ok;
          } catch {
            return false;
          }
        },

        deleteSupportingFile: async (skillName: string, filePath: string) => {
          try {
            const currentDirectory = getCurrentDirectory();
            const queryParams = currentDirectory ? `?directory=${encodeURIComponent(currentDirectory)}` : '';
            
            const response = await fetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}${queryParams}`,
              { method: 'DELETE' }
            );
            
            return response.ok;
          } catch {
            return false;
          }
        },
      }),
      {
        name: "skills-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selectedSkillName: state.selectedSkillName,
        }),
      },
    ),
    {
      name: "skills-store",
    },
  ),
);

if (typeof window !== "undefined") {
  window.__zustand_skills_store__ = useSkillsStore;
}

// Subscribe to config changes from other stores
let unsubscribeSkillsConfigChanges: (() => void) | null = null;

if (!unsubscribeSkillsConfigChanges) {
  unsubscribeSkillsConfigChanges = subscribeToConfigChanges((event) => {
    if (event.source === CONFIG_EVENT_SOURCE) {
      return;
    }

    if (scopeMatches(event, "skills")) {
      const { loadSkills } = useSkillsStore.getState();
      void loadSkills();
    }
  });
}
