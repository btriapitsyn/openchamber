import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiRefreshLine,
  RiCursorLine,
  RiCloseLine,
  RiWindow2Line,
  RiExternalLinkLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useFileStore } from '@/stores/fileStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface ElementSelection {
  html: string;
  selector: string;
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  boundingRect: DOMRect;
}

const ELEMENT_SELECTOR_SCRIPT = `
(function() {
  if (window.__openchamberSelector) {
    window.__openchamberSelector.cleanup();
  }
  
  let currentHighlight = null;
  let isActive = true;
  
  const highlightStyle = 'outline: 2px solid #3b82f6 !important; outline-offset: 2px !important; background-color: rgba(59, 130, 246, 0.1) !important;';
  
  function getSelector(el) {
    if (el.id) return '#' + el.id;
    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector = '#' + el.id;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(' > ');
  }
  
  function handleMouseOver(e) {
    if (!isActive) return;
    e.stopPropagation();
    if (currentHighlight && currentHighlight !== e.target) {
      currentHighlight.style.cssText = currentHighlight.style.cssText.replace(highlightStyle, '');
    }
    currentHighlight = e.target;
    e.target.style.cssText += highlightStyle;
  }
  
  function handleMouseOut(e) {
    if (!isActive) return;
    e.stopPropagation();
    if (currentHighlight === e.target) {
      e.target.style.cssText = e.target.style.cssText.replace(highlightStyle, '');
    }
  }
  
  function handleClick(e) {
    if (!isActive) return;
    e.preventDefault();
    e.stopPropagation();
    
    const el = e.target;
    const rect = el.getBoundingClientRect();
    
    const selection = {
      html: el.outerHTML.substring(0, 2000),
      selector: getSelector(el),
      tagName: el.tagName.toLowerCase(),
      className: el.className,
      id: el.id,
      textContent: (el.textContent || '').substring(0, 500),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
        x: rect.x,
        y: rect.y,
      }
    };
    
    window.parent.postMessage({ type: 'OPENCHAMBER_ELEMENT_SELECTED', selection }, '*');
    
    cleanup();
  }
  
  function cleanup() {
    isActive = false;
    if (currentHighlight) {
      currentHighlight.style.cssText = currentHighlight.style.cssText.replace(highlightStyle, '');
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    window.__openchamberSelector = null;
  }
  
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
  
  window.__openchamberSelector = { cleanup };
})();
`;

export const PreviewView: React.FC = () => {
  const [url, setUrl] = useState('http://localhost:3000');
  const [inputUrl, setInputUrl] = useState('http://localhost:3000');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const historyStack = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  
  const addAttachedFile = useFileStore((s) => s.addAttachedFile);

  const handleElementSelected = useCallback(async (selection: ElementSelection) => {
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

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPENCHAMBER_ELEMENT_SELECTED') {
        const selection = event.data.selection as ElementSelection;
        handleElementSelected(selection);
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleElementSelected]);

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
    setCanGoBack(historyIndex.current > 0);
    setCanGoForward(false);
    setIsLoading(true);
  }, []);

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
      setCanGoBack(historyIndex.current > 0);
      setCanGoForward(true);
      setIsLoading(true);
    }
  }, []);

  const goForward = useCallback(() => {
    if (historyIndex.current < historyStack.current.length - 1) {
      historyIndex.current++;
      const nextUrl = historyStack.current[historyIndex.current];
      setUrl(nextUrl);
      setInputUrl(nextUrl);
      setCanGoBack(true);
      setCanGoForward(historyIndex.current < historyStack.current.length - 1);
      setIsLoading(true);
    }
  }, []);

  const refresh = useCallback(() => {
    if (iframeRef.current) {
      setIsLoading(true);
      iframeRef.current.src = url;
    }
  }, [url]);

  const injectSelectorScript = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        const script = iframe.contentDocument?.createElement('script');
        if (script) {
          script.textContent = ELEMENT_SELECTOR_SCRIPT;
          iframe.contentDocument?.body.appendChild(script);
        }
      }
    } catch {
      return false;
    }
    return true;
  }, []);

  const toggleSelectMode = useCallback(() => {
    if (isSelectMode) {
      setIsSelectMode(false);
      try {
        const iframe = iframeRef.current;
        if (iframe?.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'OPENCHAMBER_CANCEL_SELECT' }, '*');
        }
      } catch { /* cross-origin */ }
    } else {
      setIsSelectMode(true);
      if (!injectSelectorScript()) {
        toast.error('Cannot select elements on this page', {
          description: 'The page is from a different origin and blocks element selection.',
        });
        setIsSelectMode(false);
      }
    }
  }, [isSelectMode, injectSelectorScript]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
    if (isSelectMode) {
      injectSelectorScript();
    }
  }, [isSelectMode, injectSelectorScript]);

  const openExternal = useCallback(() => {
    window.open(url, '_blank');
  }, [url]);

  const buttonClass = cn(
    'h-8 w-8 flex items-center justify-center rounded-sm',
    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
    'disabled:opacity-40 disabled:pointer-events-none',
    'transition-colors'
  );

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

        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                buttonClass,
                isSelectMode && 'bg-primary/20 text-primary'
              )}
              onClick={toggleSelectMode}
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
            {isSelectMode ? 'Cancel selection' : 'Select element to attach'}
          </TooltipContent>
        </Tooltip>

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

      {isSelectMode && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-sm border-b border-primary/20">
          <RiCursorLine className="h-4 w-4" />
          <span>Click on any element to attach it to your chat</span>
          <button
            type="button"
            onClick={() => setIsSelectMode(false)}
            className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/20 hover:bg-primary/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        <iframe
          ref={iframeRef}
          src={url}
          className="w-full h-full border-0"
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
      </div>
    </div>
  );
};
