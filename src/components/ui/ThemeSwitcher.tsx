
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
  Upload,
  Download,
  Trash as Trash2,
  ArrowClockwise as RefreshCw,
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
    customThemes,
    removeCustomTheme,
    exportTheme,
    importTheme,
    refreshThemes
  } = useThemeSystem();
  
  const [lightThemesExpanded, setLightThemesExpanded] = useState(false);
  const [darkThemesExpanded, setDarkThemesExpanded] = useState(false);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);

  const { isMobile } = useDeviceInfo();
  
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        try {
          importTheme(text);
        } catch (error) {
          // Failed to import theme
        }
      }
    };
    input.click();
  };
  
  const handleExport = (themeId: string) => {
    try {
      const json = exportTheme(themeId);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${themeId}-theme.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      // Failed to export theme
    }
  };
  
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

  const handleRemoveTheme = (themeId: string) => {
    removeCustomTheme(themeId);
  };

  const renderThemeList = (themes: typeof availableThemes) => (
    <div className="flex flex-col gap-1">
      {themes.map((theme) => (
        <button
          key={theme.metadata.id}
          type="button"
          onClick={() => handleSelectTheme(theme.metadata.id)}
          className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-accent/40 disabled:opacity-50"
          disabled={isSystemPreference}
        >
          <span className="flex items-center">
            <span className="mr-2 text-muted-foreground">•</span>
            {theme.metadata.name}
          </span>
          {customThemes.includes(theme) && (
            <span className="ml-3 flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExport(theme.metadata.id);
                }}
                className="rounded p-1 hover:bg-muted"
                aria-label={`Export ${theme.metadata.name}`}
              >
                <Download className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveTheme(theme.metadata.id);
                }}
                className="rounded p-1 hover:bg-muted"
                aria-label={`Remove ${theme.metadata.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="h-8 px-2">
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

            <button
              type="button"
              onClick={handleImport}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <Upload className="h-4 w-4" />
              Import Theme
            </button>

            <button
              type="button"
              onClick={() => {
                handleExport(currentTheme.metadata.id);
                setIsMobileDialogOpen(false);
              }}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <Download className="h-4 w-4" />
              Export Current Theme
            </button>

            <button
              type="button"
              onClick={() => {
                refreshThemes();
                setIsMobileDialogOpen(false);
              }}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Themes
            </button>
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
                className="pl-6 justify-between"
                disabled={isSystemPreference}
                onClick={() => setTheme(theme.metadata.id)}
              >
                <span className="flex items-center">
                  <span className="mr-2 text-muted-foreground">•</span>
                  {theme.metadata.name}
                </span>
                {customThemes.includes(theme) && (
                  <div className="flex gap-0.5 ml-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(theme.metadata.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomTheme(theme.metadata.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
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
                className="pl-6 justify-between"
                disabled={isSystemPreference}
                onClick={() => setTheme(theme.metadata.id)}
              >
                <span className="flex items-center">
                  <span className="mr-2 text-muted-foreground">•</span>
                  {theme.metadata.name}
                </span>
                {customThemes.includes(theme) && (
                  <div className="flex gap-0.5 ml-auto">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(theme.metadata.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCustomTheme(theme.metadata.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
        
        <DropdownMenuItem onClick={handleImport}>
          <div className="flex items-center">
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import Theme
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => handleExport(currentTheme.metadata.id)}>
          <div className="flex items-center">
            <Download className="h-3.5 w-3.5 mr-2" />
            Export Current Theme
          </div>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={() => refreshThemes()}>
          <div className="flex items-center">
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Refresh Themes
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
