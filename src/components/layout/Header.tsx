import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import { 
  Menu, 
  Moon, 
  Sun, 
  Monitor,
  Wifi,
  WifiOff,
  Terminal
} from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { cn } from '@/lib/utils';

export const Header: React.FC = () => {
  const { 
    theme, 
    setTheme, 
    toggleSidebar,
    isMobile 
  } = useUIStore();
  
  const {
    providers,
    currentProviderId,
    currentModelId,
    setProvider,
    setModel,
    isConnected,
    getCurrentProvider
  } = useConfigStore();

  const currentProvider = getCurrentProvider();
  const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

  const handleProviderChange = (providerId: string) => {
    setProvider(providerId);
  };

  const handleModelChange = (modelId: string) => {
    setModel(modelId);
  };

  const getModelDisplayName = () => {
    const model = models.find((m: any) => m.id === currentModelId);
    if (!model) return currentModelId;
    
    // Shorten long model names for display
    const name = model?.name || model?.id || currentModelId;
    if (name && name.length > 30) {
      return name.substring(0, 27) + '...';
    }
    return name;
  };

  const getProviderDisplayName = () => {
    const provider = providers.find(p => p.id === currentProviderId);
    return provider?.name || currentProviderId;
  };

  return (
    <header className="border-b bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="md:hidden"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <span className="font-semibold text-lg">OpenCode</span>
          </div>

          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
            isConnected ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"
          )}>
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Disconnected</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Provider Selector */}
          {providers.length > 0 && (
            <Select value={currentProviderId} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>
                  {getProviderDisplayName()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Model Selector */}
          {models.length > 0 && (
            <Select value={currentModelId} onValueChange={handleModelChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue>
                  {getModelDisplayName()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {models.map((model: any) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name || model.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Theme Selector */}
          <div className="flex items-center border rounded-lg p-1">
            <Toggle
              pressed={theme === 'light'}
              onPressedChange={(pressed) => pressed && setTheme('light')}
              size="sm"
              className="rounded-r-none"
            >
              <Sun className="h-4 w-4" />
            </Toggle>
            <Toggle
              pressed={theme === 'system'}
              onPressedChange={(pressed) => pressed && setTheme('system')}
              size="sm"
              className="rounded-none border-x"
            >
              <Monitor className="h-4 w-4" />
            </Toggle>
            <Toggle
              pressed={theme === 'dark'}
              onPressedChange={(pressed) => pressed && setTheme('dark')}
              size="sm"
              className="rounded-l-none"
            >
              <Moon className="h-4 w-4" />
            </Toggle>
          </div>
        </div>
      </div>
    </header>
  );
};