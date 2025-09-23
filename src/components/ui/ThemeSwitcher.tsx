
import { useState } from 'react';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Palette, Upload, Download, Trash2, RefreshCw, Monitor, Sun, Moon, ChevronRight, ChevronDown } from 'lucide-react';

export function ThemeSwitcher() {
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
          console.error('Failed to import theme:', error);
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
      console.error('Failed to export theme:', error);
    }
  };
  
  // Group themes by variant
  const lightThemes = availableThemes.filter(t => t.metadata.variant === 'light');
  const darkThemes = availableThemes.filter(t => t.metadata.variant === 'dark');
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 h-8 px-2">
          <Palette className="h-3.5 w-3.5" />
          <span className="hidden md:inline typography-ui-label">{currentTheme.metadata.name}</span>
        </Button>
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