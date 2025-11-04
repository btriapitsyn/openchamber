import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { getSafeStorage } from "./utils/safeStorage";

export interface GitIdentityProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  sshKey?: string | null;
  color?: string;
  icon?: string;
}

interface GitIdentitiesStore {
  // State
  selectedProfileId: string | null;
  profiles: GitIdentityProfile[];
  globalIdentity: GitIdentityProfile | null;
  isLoading: boolean;

  // Actions
  setSelectedProfile: (id: string | null) => void;
  loadProfiles: () => Promise<boolean>;
  loadGlobalIdentity: () => Promise<boolean>;
  createProfile: (profile: Omit<GitIdentityProfile, 'id'> & { id?: string }) => Promise<boolean>;
  updateProfile: (id: string, updates: Partial<GitIdentityProfile>) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<boolean>;
  getProfileById: (id: string) => GitIdentityProfile | undefined;
}

export const useGitIdentitiesStore = create<GitIdentitiesStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial State
        selectedProfileId: null,
        profiles: [],
        globalIdentity: null,
        isLoading: false,

        // Set selected profile
        setSelectedProfile: (id: string | null) => {
          set({ selectedProfileId: id });
        },

        // Load profiles from backend
        loadProfiles: async () => {
          set({ isLoading: true });
          const previousProfiles = get().profiles;

          try {
            const response = await fetch('/api/git/identities');
            if (!response.ok) {
              throw new Error(`Failed to load profiles: ${response.statusText}`);
            }

            const profiles = await response.json();
            set({ profiles, isLoading: false });
            return true;
          } catch (error) {
            console.error("Failed to load git identity profiles:", error);
            set({ profiles: previousProfiles, isLoading: false });
            return false;
          }
        },

        // Load global Git identity
        loadGlobalIdentity: async () => {
          try {
            const response = await fetch('/api/git/global-identity');
            if (!response.ok) {
              throw new Error(`Failed to load global identity: ${response.statusText}`);
            }

            const data = await response.json();

            // Only create profile object if we have userName and userEmail
            if (data.userName && data.userEmail) {
              const globalProfile: GitIdentityProfile = {
                id: 'global',
                name: 'Global Identity',
                userName: data.userName,
                userEmail: data.userEmail,
                sshKey: data.sshCommand ? data.sshCommand.replace('ssh -i ', '') : null,
                color: 'info',
                icon: 'house'
              };
              set({ globalIdentity: globalProfile });
            } else {
              set({ globalIdentity: null });
            }

            return true;
          } catch (error) {
            console.error("Failed to load global git identity:", error);
            set({ globalIdentity: null });
            return false;
          }
        },

        // Create new profile
        createProfile: async (profileData) => {
          try {
            // Generate ID if not provided
            const profile = {
              ...profileData,
              id: profileData.id || `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              color: profileData.color || 'keyword',
              icon: profileData.icon || 'branch'
            };

            const response = await fetch('/api/git/identities', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(profile)
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || 'Failed to create profile');
            }

            await response.json();

            // Reload profiles to get updated list
            await get().loadProfiles();
            return true;
          } catch (error) {
            console.error("Failed to create git identity profile:", error);
            return false;
          }
        },

        // Update existing profile
        updateProfile: async (id, updates) => {
          try {
            const response = await fetch(`/api/git/identities/${encodeURIComponent(id)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates)
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || 'Failed to update profile');
            }

            // Reload profiles to get updated list
            await get().loadProfiles();
            return true;
          } catch (error) {
            console.error("Failed to update git identity profile:", error);
            return false;
          }
        },

        // Delete profile
        deleteProfile: async (id) => {
          try {
            const response = await fetch(`/api/git/identities/${encodeURIComponent(id)}`, {
              method: 'DELETE'
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.error || 'Failed to delete profile');
            }

            // Clear selection if deleted profile was selected
            if (get().selectedProfileId === id) {
              set({ selectedProfileId: null });
            }

            // Reload profiles to get updated list
            await get().loadProfiles();
            return true;
          } catch (error) {
            console.error("Failed to delete git identity profile:", error);
            return false;
          }
        },

        // Get profile by ID
        getProfileById: (id) => {
          const { profiles, globalIdentity } = get();
          if (id === 'global') {
            return globalIdentity || undefined;
          }
          return profiles.find((p) => p.id === id);
        },
      }),
      {
        name: "git-identities-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selectedProfileId: state.selectedProfileId,
        }),
      },
    ),
    {
      name: "git-identities-store",
    },
  ),
);

// Expose store to window for debugging
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__zustand_git_identities_store__ = useGitIdentitiesStore;
}
