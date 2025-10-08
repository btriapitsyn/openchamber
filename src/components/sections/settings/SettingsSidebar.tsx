import React from 'react';
import { SETTINGS_SECTIONS, useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';

export const SettingsSidebar: React.FC = () => {
    const activeSection = useSettingsStore((state) => state.activeSection);
    const setActiveSection = useSettingsStore((state) => state.setActiveSection);
    const isMobile = useUIStore((state) => state.isMobile);
    const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

    return (
        <div className="flex h-full flex-col gap-4 px-3 py-4">
            <div className="px-2">
                <h2 className="typography-ui-header font-semibold text-foreground">Settings</h2>
                <p className="typography-meta text-muted-foreground/80">
                    Personalize the WebUI experience with the available options.
                </p>
            </div>

            <div className="flex-1 overflow-y-auto">
                <nav className="space-y-1">
                    {SETTINGS_SECTIONS.map((section) => {
                        const isActive = section.id === activeSection;
                        return (
                            <button
                                key={section.id}
                                type="button"
                                className={cn(
                                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                                    'hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    isActive
                                        ? 'bg-accent text-foreground shadow-sm'
                                        : 'bg-transparent text-muted-foreground hover:text-foreground'
                                )}
                            onClick={() => {
                                setActiveSection(section.id);
                                if (isMobile) {
                                    setSidebarOpen(false);
                                }
                            }}
                            >
                                <div className="typography-ui-label font-medium">{section.label}</div>
                                <div className="typography-meta text-muted-foreground/80">
                                    {section.description}
                                </div>
                            </button>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
};
