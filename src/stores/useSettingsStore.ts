import { create } from 'zustand';

type SettingsSection = 'appearance';

interface SettingsStore {
    activeSection: SettingsSection;
    setActiveSection: (section: SettingsSection) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    activeSection: 'appearance',
    setActiveSection: (section) => set({ activeSection: section }),
}));

export const SETTINGS_SECTIONS: { id: SettingsSection; label: string; description: string }[] = [
    {
        id: 'appearance',
        label: 'Appearance',
        description: 'Manage theme, readability, and content hierarchy.',
    },
];
