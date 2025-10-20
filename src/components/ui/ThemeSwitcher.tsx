
import React, { useState } from 'react';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Palette,
  Monitor,
  Sun,
  Moon,
  CaretRight as ChevronRight,
  CaretDown as ChevronDown,
} from '@phosphor-icons/react';
import { useDeviceInfo } from '@/lib/device';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ThemeSwitcherProps {
  customTrigger?: React.ReactNode;
}

export function ThemeSwitcher({ customTrigger }: ThemeSwitcherProps = {}) {
  const {
    currentTheme,
    availableThemes,
    setTheme,
    isSystemPreference,
    setSystemPreference,
  } = useThemeSystem();
  
  const [lightThemesExpanded, setLightThemesExpanded] = useState(false);
  const [darkThemesExpanded, setDarkThemesExpanded] = useState(false);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);

  const { isMobile } = useDeviceInfo();

  // Group themes by variant
  const lightThemes = availableThemes.filter(t => t.metadata.variant === 'light');
  const darkThemes = availableThemes.filter(t => t.metadata.variant === 'dark');

  const handleSelectTheme = (themeId: string) => {
    setTheme(themeId);
    if (isMobile) {
      setIsMobileDialogOpen(false);
    }
  };

  const handleSystemToggle = () => {
    setSystemPreference(!isSystemPreference);
    if (isMobile) {
      setIsMobileDialogOpen(false);
    }
  };

  const renderThemeList = (themes: typeof availableThemes) => (
    <div className="flex flex-col gap-1">
      {themes.map((theme) => (
        <button
          key={theme.metadata.id}
          type="button"
          onClick={() => handleSelectTheme(theme.metadata.id)}
          className="flex items-center rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
          disabled={isSystemPreference}
        >
          <span className="mr-2 text-muted-foreground">•</span>
          {theme.metadata.name}
        </button>
      ))}
    </div>
  );

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="h-6 px-2">
      <Palette className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Current theme: {currentTheme.metadata.name}</span>
    </Button>
  );

  if (isMobile) {
    return (
      <Dialog open={isMobileDialogOpen} onOpenChange={setIsMobileDialogOpen}>
        <DialogTrigger asChild>
          {customTrigger ?? defaultTrigger}
        </DialogTrigger>
        <DialogContent className="max-h-[80vh] overflow-y-auto px-0 text-foreground">
          <DialogHeader className="px-4 pb-2 text-left">
            <DialogTitle className="typography-ui-label">Theme settings</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            <button
              type="button"
              onClick={handleSystemToggle}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <Monitor className="h-4 w-4" />
              Use System Theme
            </button>

            {lightThemes.length > 0 && (
              <div className="rounded-md border border-border/40">
                <button
                  type="button"
                  onClick={() => setLightThemesExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Sun className="h-4 w-4" />
                    Light Themes
                  </span>
                  {lightThemesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {lightThemesExpanded && <div className="px-1 pb-1.5">{renderThemeList(lightThemes)}</div>}
              </div>
            )}

            {darkThemes.length > 0 && (
              <div className="rounded-md border border-border/40">
                <button
                  type="button"
                  onClick={() => setDarkThemesExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Moon className="h-4 w-4" />
                    Dark Themes
                  </span>
                  {darkThemesExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {darkThemesExpanded && <div className="px-1 pb-1.5">{renderThemeList(darkThemes)}</div>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {customTrigger ?? defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => setSystemPreference(!isSystemPreference)}
        >
          <div className="flex items-center">
            <Monitor className="h-3.5 w-3.5 mr-2" />
            Use System Theme
          </div>
        </DropdownMenuItem>
        
        {lightThemes.length > 0 && (
          <>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setLightThemesExpanded(!lightThemesExpanded);
              }}
            >
              <div className="flex items-center">
                <Sun className="h-3.5 w-3.5 mr-2" />
                Light Themes
              </div>
              {lightThemesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            {lightThemesExpanded && lightThemes.map(theme => (
              <DropdownMenuItem
                key={theme.metadata.id}
                className="pl-6"
                disabled={isSystemPreference}
                onClick={() => setTheme(theme.metadata.id)}
              >
                <span className="mr-2 text-muted-foreground">•</span>
                {theme.metadata.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        {darkThemes.length > 0 && (
          <>
            <DropdownMenuItem
              className="flex items-center justify-between cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                setDarkThemesExpanded(!darkThemesExpanded);
              }}
            >
              <div className="flex items-center">
                <Moon className="h-3.5 w-3.5 mr-2" />
                Dark Themes
              </div>
              {darkThemesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            {darkThemesExpanded && darkThemes.map(theme => (
              <DropdownMenuItem
                key={theme.metadata.id}
                className="pl-6"
                disabled={isSystemPreference}
                onClick={() => setTheme(theme.metadata.id)}
              >
                <span className="mr-2 text-muted-foreground">•</span>
                {theme.metadata.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
