import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiRefreshLine,
  RiCursorLine,
  RiCloseLine,
  RiWindow2Line,
  RiExternalLinkLine,
  RiShieldLine,
  RiTerminalBoxLine,
  RiArrowDownSLine,
  RiDeleteBinLine,
  RiCodeBoxLine,
  RiToolsLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/fileStore';
import { useUIStore } from '@/stores/useUIStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useShallow } from 'zustand/shallow';
import { toast } from 'sonner';
import { useTabContext } from '@/contexts/useTabContext';

/**
 * Check if we're running in the desktop (Tauri) app.
 * Desktop mode enables advanced features like element selection and DevTools
 * that require proxying to work with cross-origin content.
 */
function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && !!window.__OPENCHAMBER_DESKTOP_SERVER__;
}

interface ElementData {
  selector: string;
  xpath: string;
  tagName: string;
  outerHTML: string;
  innerHTML: string;
  innerText: string;
  textContent: string;
  attributes: Record<string, string>;
  dataAttributes: Record<string, string>;
  computedStyles: Record<string, string>;
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
    bottom: number;
    right: number;
    x: number;
    y: number;
  };
  accessibility: {
    role: string;
    ariaLabel: string | null;
    ariaDescribedBy: string | null;
    ariaLabelledBy: string | null;
    tabIndex: number;
    title: string | null;
  };
  context: {
    url: string;
    title: string;
    parentSelector: string | null;
    childCount: number;
    siblingCount: number;
  };
  metadata: {
    timestamp: number;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number };
  };
}

interface LegacyElementSelection {
  html: string;
  selector: string;
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  boundingRect: DOMRect;
}

interface ConsoleEntry {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

type DevToolsMode = 'basic' | 'advanced';

function buildProxyUrl(targetUrl: string, devToolsMode: DevToolsMode = 'basic'): string {
  return `/api/preview-proxy?url=${encodeURIComponent(targetUrl)}&devtools_mode=${devToolsMode}`;
}

const DEFAULT_URL = 'http://localhost:3000';

interface PreviewTabMetadata {
  url?: string;
  historyStack?: string[];
  historyIndex?: number;
  useProxy?: boolean;
  showConsole?: boolean;
  devToolsMode?: DevToolsMode;
  showDevTools?: boolean;
}

export const PreviewView: React.FC = () => {
  const { isGlobalResizing, setGlobalResizing } = useUIStore(
    useShallow((state) => ({
      isGlobalResizing: state.isGlobalResizing,
      setGlobalResizing: state.setGlobalResizing,
    }))
  );
  const tabContext = useTabContext();
  const metadata = (tabContext?.tab.metadata ?? {}) as PreviewTabMetadata;

  // Check if we're in desktop mode - enables advanced features
  const isDesktop = useMemo(() => isDesktopApp(), []);

  const initialUrl = metadata.url ?? DEFAULT_URL;
  const initialHistoryStack = metadata.historyStack ?? [initialUrl];
  const initialHistoryIndex = metadata.historyIndex ?? 0;
  // Only enable proxy by default in desktop mode
  const initialUseProxy = metadata.useProxy ?? isDesktop;
  const initialShowConsole = metadata.showConsole ?? false;
  const initialDevToolsMode = metadata.devToolsMode ?? 'basic';
  const initialShowDevTools = metadata.showDevTools ?? false;
  
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [useProxy, setUseProxy] = useState(initialUseProxy);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [showConsole, setShowConsole] = useState(initialShowConsole);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [consoleHeight, setConsoleHeight] = useState(200);
  const [devToolsMode, setDevToolsMode] = useState<DevToolsMode>(initialDevToolsMode);
  const [showDevTools, setShowDevTools] = useState(initialShowDevTools);
  const [isDevToolsReady, setIsDevToolsReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const historyStack = useRef<string[]>(initialHistoryStack);
  const historyIndex = useRef(initialHistoryIndex);
  const consoleIdCounter = useRef(0);
  const isResizingConsole = useRef(false);
  
  const [, forceUpdate] = useState({});
  
  const canGoBack = historyIndex.current > 0;
  const canGoForward = historyIndex.current < historyStack.current.length - 1;
  
  const addAttachedFile = useFileStore((s) => s.addAttachedFile);
  
  const persistState = useCallback((updates: Partial<PreviewTabMetadata> = {}) => {
    if (tabContext) {
      tabContext.updateMetadata({
        url: updates.url ?? url,
        historyStack: historyStack.current,
        historyIndex: historyIndex.current,
        useProxy: updates.useProxy ?? useProxy,
        showConsole: updates.showConsole ?? showConsole,
        devToolsMode: updates.devToolsMode ?? devToolsMode,
        showDevTools: updates.showDevTools ?? showDevTools,
      });
    }
  }, [tabContext, url, useProxy, showConsole, devToolsMode, showDevTools]);

  const hasValidUrl = url && url !== DEFAULT_URL && url.trim() !== '';

  // Check if we're in desktop mode (for iframeSrc calculation)
  const isDesktopForSrc = useMemo(() => isDesktopApp(), []);

  const iframeSrc = useMemo(() => {
    // Web mode: always direct load, no proxy
    if (!isDesktopForSrc) {
      return hasValidUrl ? url : 'about:blank';
    }
    // Desktop mode: use proxy when enabled
    if (!useProxy) {
      return url;
    }
    if (!hasValidUrl) {
      return 'about:blank';
    }
    // When proxy is ON and we have a valid URL, ALWAYS use proxy
    // (regardless of whether it's cross-origin or same-origin)
    return buildProxyUrl(url, devToolsMode);
  }, [url, useProxy, hasValidUrl, devToolsMode, isDesktopForSrc]);

  const formatElementInfo = useCallback((data: ElementData): string => {
    const lines: string[] = [];
    
    lines.push('# Selected Element');
    lines.push('');
    lines.push('## Selectors');
    lines.push(`CSS: ${data.selector}`);
    lines.push(`XPath: ${data.xpath}`);
    lines.push('');
    
    lines.push('## Element Info');
    lines.push(`Tag: <${data.tagName}>`);
    if (data.attributes.id) lines.push(`ID: #${data.attributes.id}`);
    if (data.attributes.class) lines.push(`Classes: .${data.attributes.class.split(' ').filter(Boolean).join('.')}`);
    lines.push('');
    
    if (data.innerText.trim()) {
      lines.push('## Text Content');
      lines.push(data.innerText.substring(0, 500));
      lines.push('');
    }
    
    const attrEntries = Object.entries(data.attributes).filter(
      ([k]) => k !== 'class' && k !== 'id' && k !== 'style'
    );
    if (attrEntries.length > 0) {
      lines.push('## Attributes');
      for (const [key, value] of attrEntries) {
        lines.push(`${key}: ${value}`);
      }
      lines.push('');
    }
    
    if (Object.keys(data.dataAttributes).length > 0) {
      lines.push('## Data Attributes');
      for (const [key, value] of Object.entries(data.dataAttributes)) {
        lines.push(`${key}: ${value}`);
      }
      lines.push('');
    }
    
    lines.push('## Accessibility');
    lines.push(`Role: ${data.accessibility.role}`);
    if (data.accessibility.ariaLabel) lines.push(`aria-label: ${data.accessibility.ariaLabel}`);
    if (data.accessibility.title) lines.push(`title: ${data.accessibility.title}`);
    lines.push(`tabIndex: ${data.accessibility.tabIndex}`);
    lines.push('');
    
    lines.push('## Bounding Rect');
    lines.push(`Position: (${Math.round(data.boundingRect.x)}, ${Math.round(data.boundingRect.y)})`);
    lines.push(`Size: ${Math.round(data.boundingRect.width)} x ${Math.round(data.boundingRect.height)}`);
    lines.push('');
    
    if (Object.keys(data.computedStyles).length > 0) {
      lines.push('## Computed Styles');
      for (const [prop, value] of Object.entries(data.computedStyles)) {
        lines.push(`${prop}: ${value}`);
      }
      lines.push('');
    }
    
    lines.push('## Context');
    lines.push(`Page URL: ${data.context.url}`);
    lines.push(`Page Title: ${data.context.title}`);
    lines.push(`Children: ${data.context.childCount}`);
    lines.push(`Siblings: ${data.context.siblingCount}`);
    lines.push('');
    
    lines.push('## HTML');
    lines.push('```html');
    lines.push(data.outerHTML.substring(0, 3000));
    lines.push('```');
    
    return lines.join('\n');
  }, []);

  const handleElementSelected = useCallback(async (data: ElementData) => {
    setIsSelectMode(false);
    
    const elementInfo = formatElementInfo(data);
    const blob = new Blob([elementInfo], { type: 'text/markdown' });
    const fileName = `element-${data.tagName}${data.attributes.id ? `-${data.attributes.id}` : ''}-${Date.now()}.md`;
    const file = new File([blob], fileName, { type: 'text/markdown' });
    
    try {
      await addAttachedFile(file);
      toast.success('Element attached to chat', {
        description: `<${data.tagName}>${data.attributes.id ? ` #${data.attributes.id}` : ''} selected`,
      });
    } catch (error) {
      toast.error('Failed to attach element');
      console.error('Failed to attach element:', error);
    }
  }, [addAttachedFile, formatElementInfo]);

  const handleLegacyElementSelected = useCallback(async (selection: LegacyElementSelection) => {
    setIsSelectMode(false);
    
    const elementInfo = `Selected Element:
Selector: ${selection.selector}
Tag: ${selection.tagName}${selection.id ? ` #${selection.id}` : ''}${selection.className ? ` .${selection.className.split(' ').join('.')}` : ''}

Text Content:
${selection.textContent}

HTML:
${selection.html}
`;
    
    const blob = new Blob([elementInfo], { type: 'text/plain' });
    const file = new File([blob], `element-${selection.tagName}-${Date.now()}.txt`, { type: 'text/plain' });
    
    try {
      await addAttachedFile(file);
      toast.success('Element attached to chat', {
        description: `${selection.tagName}${selection.id ? `#${selection.id}` : ''} selected`,
      });
    } catch (error) {
      toast.error('Failed to attach element');
      console.error('Failed to attach element:', error);
    }
  }, [addAttachedFile]);

  const addConsoleEntry = useCallback((level: ConsoleEntry['level'], message: string) => {
    const entry: ConsoleEntry = {
      id: consoleIdCounter.current++,
      level,
      message,
      timestamp: Date.now(),
    };
    setConsoleEntries(prev => [...prev.slice(-499), entry]);
  }, []);

  const navigateTo = useCallback((newUrl: string) => {
    let normalizedUrl = newUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }
    
    if (historyIndex.current < historyStack.current.length - 1) {
      historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
    }
    historyStack.current.push(normalizedUrl);
    historyIndex.current = historyStack.current.length - 1;
    
    setUrl(normalizedUrl);
    setInputUrl(normalizedUrl);
    setIsLoading(true);
    setIsScriptReady(false);
    forceUpdate({});
    persistState({ url: normalizedUrl });
  }, [persistState]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, data, selection } = event.data || {};
      
      switch (type) {
        case 'OPENCHAMBER_ELEMENT_SELECTED':
          if (data && typeof data === 'object' && 'xpath' in data) {
            handleElementSelected(data as ElementData);
          } else if (selection) {
            handleLegacyElementSelected(selection as LegacyElementSelection);
          }
          break;
          
        case 'OPENCHAMBER_SCRIPT_READY':
          setIsScriptReady(true);
          if (data?.originalUrl) {
            setInputUrl(data.originalUrl);
          } else if (data?.url) {
            setInputUrl(data.url);
          }
          break;
          
        case 'OPENCHAMBER_URL_CHANGED':
          if (data?.originalUrl) {
            setInputUrl(data.originalUrl);
            if (data.originalUrl !== url) {
              if (historyIndex.current < historyStack.current.length - 1) {
                historyStack.current = historyStack.current.slice(0, historyIndex.current + 1);
              }
              historyStack.current.push(data.originalUrl);
              historyIndex.current = historyStack.current.length - 1;
              setUrl(data.originalUrl);
              forceUpdate({});
              persistState({ url: data.originalUrl });
            }
          } else if (data?.url) {
            setInputUrl(data.url);
            setUrl(data.url);
          }
          break;
          
        case 'OPENCHAMBER_PICKER_CANCELLED':
          setIsSelectMode(false);
          break;
          
        case 'OPENCHAMBER_CONSOLE':
          if (data?.level && data?.message) {
            addConsoleEntry(data.level as ConsoleEntry['level'], data.message);
          }
          break;
          
        case 'OPENCHAMBER_NAVIGATE':
          if (data?.url) {
            navigateTo(data.url);
          }
          break;
          
        case 'OPENCHAMBER_DEVTOOLS_READY':
          setIsDevToolsReady(true);
          break;
          
        case 'OPENCHAMBER_DEVTOOLS_ERROR':
          console.error('[Preview] DevTools error:', data);
          toast.error('DevTools failed to load');
          break;
          
        case 'OPENCHAMBER_REACT_DETECTED':
          if (data?.detected) {
            addConsoleEntry('info', `React detected (${data.method})`);
          }
          break;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleElementSelected, handleLegacyElementSelected, addConsoleEntry, url, persistState, navigateTo]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    navigateTo(inputUrl);
  }, [inputUrl, navigateTo]);

  const goBack = useCallback(() => {
    if (historyIndex.current > 0) {
      historyIndex.current--;
      const prevUrl = historyStack.current[historyIndex.current];
      setUrl(prevUrl);
      setInputUrl(prevUrl);
      setIsLoading(true);
      setIsScriptReady(false);
      forceUpdate({});
      persistState({ url: prevUrl });
    }
  }, [persistState]);

  const goForward = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current++;
      const nextUrl = historyStack.current[historyIndex.current];
      setUrl(nextUrl);
      setInputUrl(nextUrl);
      setIsLoading(true);
      setIsScriptReady(false);
      forceUpdate({});
      persistState({ url: nextUrl });
    }
  }, [persistState]);

  const refresh = useCallback(() => {
    if (iframeRef.current) {
      setIsLoading(true);
      setIsScriptReady(false);
      iframeRef.current.src = iframeSrc;
    }
  }, [iframeSrc]);

  const enablePicker = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'OPENCHAMBER_PICKER_ENABLE' }, '*');
    }
  }, []);

  const disablePicker = useCallback(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'OPENCHAMBER_PICKER_DISABLE' }, '*');
    }
  }, []);

  const toggleSelectMode = useCallback(() => {
    // Element selection is desktop-only
    if (!isDesktop) return;

    if (isSelectMode) {
      setIsSelectMode(false);
      disablePicker();
    } else {
      if (useProxy && isScriptReady) {
        setIsSelectMode(true);
        enablePicker();
      } else if (!useProxy) {
        toast.error('Element selection requires proxy mode', {
          description: 'Enable proxy mode to select elements on cross-origin pages.',
        });
      } else {
        toast.error('Page not ready', {
          description: 'Wait for the page to finish loading.',
        });
      }
    }
  }, [isSelectMode, useProxy, isScriptReady, enablePicker, disablePicker, isDesktop]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const openExternal = useCallback(() => {
    window.open(url, '_blank');
  }, [url]);

  const toggleProxy = useCallback(() => {
    const newUseProxy = !useProxy;
    setUseProxy(newUseProxy);
    setIsScriptReady(false);
    setIsSelectMode(false);
    persistState({ useProxy: newUseProxy });
  }, [useProxy, persistState]);

  const toggleConsole = useCallback(() => {
    const newShowConsole = !showConsole;
    setShowConsole(newShowConsole);
    persistState({ showConsole: newShowConsole });
  }, [showConsole, persistState]);

  const toggleDevTools = useCallback(() => {
    if (!useProxy || !isDevToolsReady) {
      toast.error('DevTools requires proxy mode and page to be loaded');
      return;
    }
    
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'OPENCHAMBER_DEVTOOLS_TOGGLE' }, '*');
      setShowDevTools(prev => !prev);
      persistState({ showDevTools: !showDevTools });
    }
  }, [useProxy, isDevToolsReady, showDevTools, persistState]);

  const cycleDevToolsMode = useCallback(() => {
    const newMode: DevToolsMode = devToolsMode === 'basic' ? 'advanced' : 'basic';
    setDevToolsMode(newMode);
    setIsScriptReady(false);
    setIsDevToolsReady(false);
    persistState({ devToolsMode: newMode });
    
    if (iframeRef.current) {
      setIsLoading(true);
      iframeRef.current.src = hasValidUrl && useProxy ? buildProxyUrl(url, newMode) : url;
    }
    
    toast.success(`DevTools mode: ${newMode}`, {
      description: newMode === 'basic' ? 'Using Eruda (mobile-friendly)' : 'Using Chobitsu (Chrome DevTools Protocol)',
    });
  }, [devToolsMode, hasValidUrl, useProxy, url, persistState]);

  const clearConsole = useCallback(() => {
    setConsoleEntries([]);
  }, []);

  const handleConsoleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingConsole.current = true;
    setGlobalResizing(true);
    const startY = e.clientY;
    const startHeight = consoleHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingConsole.current) return;
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(100, Math.min(500, startHeight + delta));
      setConsoleHeight(newHeight);
    };

    const handleMouseUp = () => {
      isResizingConsole.current = false;
      setGlobalResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [consoleHeight, setGlobalResizing]);

  useEffect(() => {
    if (showConsole && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleEntries, showConsole]);

  const buttonClass = cn(
    'h-8 w-8 flex items-center justify-center rounded-sm',
    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
    'disabled:opacity-40 disabled:pointer-events-none',
    'transition-colors'
  );

  const getConsoleEntryColor = (level: ConsoleEntry['level']) => {
    switch (level) {
      case 'error': return 'text-red-500';
      case 'warn': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-foreground';
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div 
        className="flex items-center gap-1 px-2 py-2 border-b"
        style={{ borderColor: 'var(--interactive-border)' }}
      >
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={buttonClass}
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Go back"
            >
              <RiArrowLeftLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Go back</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={buttonClass}
              onClick={goForward}
              disabled={!canGoForward}
              aria-label="Go forward"
            >
              <RiArrowRightLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Go forward</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={buttonClass}
              onClick={refresh}
              aria-label="Refresh"
            >
              <RiRefreshLine className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>

        <form onSubmit={handleSubmit} className="flex-1 mx-2">
          <div className="relative">
            <RiWindow2Line className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter URL..."
              className={cn(
                'w-full h-8 pl-8 pr-3 rounded-md text-sm',
                'bg-muted/50 text-foreground placeholder:text-muted-foreground/50',
                'border border-transparent focus:border-primary/50',
                'focus:outline-none focus:ring-1 focus:ring-primary/30',
                'transition-colors'
              )}
            />
          </div>
        </form>

        {/* Desktop-only: Proxy toggle - enables cross-origin features */}
        {isDesktop && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonClass,
                  useProxy && 'bg-green-500/20 text-green-500'
                )}
                onClick={toggleProxy}
                aria-label={useProxy ? 'Proxy enabled' : 'Proxy disabled'}
              >
                <RiShieldLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {useProxy ? 'Proxy enabled (element selection works)' : 'Proxy disabled (direct load)'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Desktop-only: Element selection */}
        {isDesktop && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonClass,
                  isSelectMode && 'bg-primary/20 text-primary'
                )}
                onClick={toggleSelectMode}
                disabled={!useProxy || !isScriptReady}
                aria-label={isSelectMode ? 'Cancel selection' : 'Select element'}
              >
                {isSelectMode ? (
                  <RiCloseLine className="h-4 w-4" />
                ) : (
                  <RiCursorLine className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isSelectMode
                ? 'Cancel selection'
                : useProxy && isScriptReady
                  ? 'Select element to attach'
                  : 'Enable proxy and wait for page to load'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Desktop-only: Console panel toggle */}
        {isDesktop && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonClass,
                  showConsole && 'bg-primary/20 text-primary'
                )}
                onClick={toggleConsole}
                aria-label={showConsole ? 'Hide console' : 'Show console'}
              >
                <RiTerminalBoxLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {showConsole ? 'Hide console' : 'Show console'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Desktop-only: DevTools toggle */}
        {isDesktop && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonClass,
                  showDevTools && 'bg-primary/20 text-primary'
                )}
                onClick={toggleDevTools}
                disabled={!useProxy || !isDevToolsReady}
                aria-label={showDevTools ? 'Hide DevTools' : 'Show DevTools'}
              >
                <RiCodeBoxLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {showDevTools
                ? 'Hide DevTools'
                : useProxy && isDevToolsReady
                  ? 'Show DevTools (Eruda)'
                  : 'Enable proxy and wait for page to load'}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Desktop-only: DevTools mode toggle */}
        {isDesktop && (
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  buttonClass,
                  devToolsMode === 'advanced' && 'bg-orange-500/20 text-orange-500'
                )}
                onClick={cycleDevToolsMode}
                disabled={!useProxy}
                aria-label={`DevTools mode: ${devToolsMode}`}
              >
                <RiToolsLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {devToolsMode === 'basic'
                ? 'Basic mode (Eruda) - Click for Advanced'
                : 'Advanced mode (Chobitsu) - Click for Basic'}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={buttonClass}
              onClick={openExternal}
              aria-label="Open in browser"
            >
              <RiExternalLinkLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Open in browser</TooltipContent>
        </Tooltip>
      </div>

      {/* Desktop-only: Element selection mode banner */}
      {isDesktop && isSelectMode && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm border-b border-primary/20">
          <RiCursorLine className="h-4 w-4" />
          <span>Click on any element to attach it to your chat</span>
          <button
            type="button"
            onClick={() => {
              setIsSelectMode(false);
              disablePicker();
            }}
            className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative flex flex-col">
        <div className={cn('flex-1 overflow-hidden relative', isDesktop && showConsole && 'min-h-0')}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            className={cn('w-full h-full border-0', isGlobalResizing && 'pointer-events-none')}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            title="Preview"
            onLoad={handleIframeLoad}
          />
          
          {isLoading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
              <div className="flex items-center gap-2 text-muted-foreground">
                <RiRefreshLine className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            </div>
          )}
          
          {isSelectMode && (
            <div 
              className="absolute inset-0 cursor-crosshair"
              style={{ pointerEvents: 'none' }}
            />
          )}
          
          {/* Desktop: Show proxy mode features empty state */}
          {isDesktop && useProxy && !hasValidUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <RiShieldLine className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">
                    Proxy Mode Enabled
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Enter a URL above to preview with cross-origin support and DevTools.
                    DevTools mode: <span className="font-medium">{devToolsMode === 'basic' ? 'Eruda' : 'Chobitsu'}</span>
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground/70">
                  <span className="px-2 py-1 bg-muted/30 rounded">Console</span>
                  <span className="px-2 py-1 bg-muted/30 rounded">Elements</span>
                  <span className="px-2 py-1 bg-muted/30 rounded">Network</span>
                  <span className="px-2 py-1 bg-muted/30 rounded">Sources</span>
                </div>
              </div>
            </div>
          )}

          {/* Web: Show simple empty state */}
          {!isDesktop && !hasValidUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center space-y-4 max-w-md px-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <RiWindow2Line className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium text-foreground">
                    Preview Panel
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Enter a URL above to preview your site. Works best with same-origin URLs (e.g., localhost).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop-only: Console panel */}
        {isDesktop && showConsole && (
          <div
            className="border-t flex flex-col"
            style={{
              borderColor: 'var(--interactive-border)',
              height: consoleHeight,
              minHeight: 100,
              maxHeight: 500,
            }}
          >
            <div
              className="h-1 cursor-ns-resize hover:bg-primary/20 transition-colors"
              onMouseDown={handleConsoleResizeStart}
            />
            <div
              className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30"
              style={{ borderColor: 'var(--interactive-border)' }}
            >
              <div className="flex items-center gap-2">
                <RiTerminalBoxLine className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Console</span>
                {consoleEntries.length > 0 && (
                  <span className="text-xs text-muted-foreground/70">
                    ({consoleEntries.length})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={clearConsole}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      aria-label="Clear console"
                    >
                      <RiDeleteBinLine className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Clear console</TooltipContent>
                </Tooltip>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleConsole}
                      className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      aria-label="Collapse console"
                    >
                      <RiArrowDownSLine className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Collapse console</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
              {consoleEntries.length === 0 ? (
                <div className="text-muted-foreground/50 text-center py-4">
                  Console output will appear here
                </div>
              ) : (
                consoleEntries.map(entry => (
                  <div
                    key={entry.id}
                    className={cn('py-0.5 px-1 rounded hover:bg-muted/30', getConsoleEntryColor(entry.level))}
                  >
                    <span className="text-muted-foreground/50 mr-2">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="opacity-50 mr-1">[{entry.level}]</span>
                    {entry.message}
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
