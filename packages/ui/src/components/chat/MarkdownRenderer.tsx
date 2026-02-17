import React from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import 'streamdown/styles.css';
import { FadeInOnReveal } from './message/FadeInOnReveal';
import type { Part } from '@opencode-ai/sdk/v2';
import { cn } from '@/lib/utils';
import { RiFileCopyLine, RiCheckLine, RiDownloadLine } from '@remixicon/react';
import { toast } from '@/components/ui';

import { isVSCodeRuntime } from '@/lib/desktop';
import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { getStreamdownThemePair } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';

const withStableStringId = <T extends object>(value: T, id: string): T => {
  const existingPrimitive = (value as Record<symbol, unknown>)[Symbol.toPrimitive];
  if (typeof existingPrimitive === 'function') {
    try {
      if ((existingPrimitive as () => unknown)() === id) {
        return value;
      }
    } catch {
      // Ignore and attempt to define below.
    }
  }

  try {
    Object.defineProperty(value, 'toString', {
      value: () => id,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Ignore if non-configurable or frozen.
  }

  try {
    Object.defineProperty(value, Symbol.toPrimitive, {
      value: () => id,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Ignore if non-configurable or frozen.
  }

  return value;
};

const useMarkdownShikiThemes = (): readonly [string | object, string | object] => {
  const themeSystem = useOptionalThemeSystem();

  const isVSCode = isVSCodeRuntime() && typeof window !== 'undefined';

  const fallbackLight = getDefaultTheme(false);
  const fallbackDark = getDefaultTheme(true);

  const lightThemeId = themeSystem?.lightThemeId ?? fallbackLight.metadata.id;
  const darkThemeId = themeSystem?.darkThemeId ?? fallbackDark.metadata.id;

  const lightTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === lightThemeId) ??
    fallbackLight;
  const darkTheme =
    themeSystem?.availableThemes.find((theme) => theme.metadata.id === darkThemeId) ??
    fallbackDark;

  const fallbackThemes = React.useMemo(
    () => getStreamdownThemePair(lightTheme, darkTheme),
    [darkTheme, lightTheme],
  );

  const getThemes = React.useCallback((): readonly [string | object, string | object] => {
    if (!isVSCode) {
      return fallbackThemes;
    }

    const provided = window.__OPENCHAMBER_VSCODE_SHIKI_THEMES__;
    if (provided?.light && provided?.dark) {
      const light = withStableStringId(
        { ...(provided.light as Record<string, unknown>) },
        `vscode-shiki-light:${String((provided.light as { name?: unknown })?.name ?? 'theme')}`,
      );
      const dark = withStableStringId(
        { ...(provided.dark as Record<string, unknown>) },
        `vscode-shiki-dark:${String((provided.dark as { name?: unknown })?.name ?? 'theme')}`,
      );
      return [light, dark] as const;
    }

    return fallbackThemes;
  }, [fallbackThemes, isVSCode]);

  const [themes, setThemes] = React.useState(getThemes);

  React.useEffect(() => {
    if (!isVSCode) {
      return;
    }

    setThemes(getThemes());
  }, [getThemes, isVSCode]);

  React.useEffect(() => {
    if (!isVSCode) return;

    const handler = (event: Event) => {
      // Rely on the canonical `window.__OPENCHAMBER_VSCODE_SHIKI_THEMES__` that the webview updates
      // before dispatching this event, so we always apply stable cache keys and avoid stale token reuse.
      void event;
      setThemes(getThemes());
    };

    window.addEventListener('openchamber:vscode-shiki-themes', handler as EventListener);
    return () => window.removeEventListener('openchamber:vscode-shiki-themes', handler as EventListener);
  }, [getThemes, isVSCode]);

  return isVSCode ? themes : fallbackThemes;
};

const useStreamdownMermaidOptions = () => {
  const themeSystem = useOptionalThemeSystem();
  const fallbackLight = getDefaultTheme(false);
  const fallbackDark = getDefaultTheme(true);

  const currentTheme = themeSystem?.currentTheme
    ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? fallbackDark
      : fallbackLight);

  const mermaidRenderKey = `${currentTheme.metadata.id}:${currentTheme.metadata.variant}:${themeSystem?.themeMode ?? 'fallback'}`;

  const options = React.useMemo(() => {
    const isDark = currentTheme.metadata.variant === 'dark';
    return {
      config: {
        theme: isDark ? 'dark' : 'base',
        themeVariables: {
          primaryColor: currentTheme.colors.surface.elevated,
          primaryTextColor: currentTheme.colors.surface.foreground,
          primaryBorderColor: currentTheme.colors.interactive.border,
          lineColor: currentTheme.colors.interactive.border,
          secondaryColor: currentTheme.colors.surface.muted,
          tertiaryColor: currentTheme.colors.surface.subtle,
          background: currentTheme.colors.surface.background,
          mainBkg: currentTheme.colors.surface.elevated,
          nodeTextColor: currentTheme.colors.surface.foreground,
          edgeLabelBackground: currentTheme.colors.surface.background,
        },
      },
    };
  }, [currentTheme]);

  return React.useMemo(
    () => ({ options, mermaidRenderKey }),
    [mermaidRenderKey, options],
  );
};

// Table utility functions
const extractTableData = (tableEl: HTMLTableElement): { headers: string[]; rows: string[][] } => {
  const headers: string[] = [];
  const rows: string[][] = [];
  
  const thead = tableEl.querySelector('thead');
  if (thead) {
    const headerCells = thead.querySelectorAll('th');
    headerCells.forEach(cell => headers.push(cell.innerText.trim()));
  }
  
  const tbody = tableEl.querySelector('tbody');
  if (tbody) {
    const rowEls = tbody.querySelectorAll('tr');
    rowEls.forEach(row => {
      const cells = row.querySelectorAll('td');
      const rowData: string[] = [];
      cells.forEach(cell => rowData.push(cell.innerText.trim()));
      rows.push(rowData);
    });
  }
  
  return { headers, rows };
};

const tableToCSV = ({ headers, rows }: { headers: string[]; rows: string[][] }): string => {
  const escapeCell = (cell: string): string => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  
  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(headers.map(escapeCell).join(','));
  }
  rows.forEach(row => lines.push(row.map(escapeCell).join(',')));
  return lines.join('\n');
};

const tableToTSV = ({ headers, rows }: { headers: string[]; rows: string[][] }): string => {
  const escapeCell = (cell: string): string => {
    return cell.replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  };
  
  const lines: string[] = [];
  if (headers.length > 0) {
    lines.push(headers.map(escapeCell).join('\t'));
  }
  rows.forEach(row => lines.push(row.map(escapeCell).join('\t')));
  return lines.join('\n');
};

const tableToMarkdown = ({ headers, rows }: { headers: string[]; rows: string[][] }): string => {
  if (headers.length === 0) return '';
  
  const escapeCell = (cell: string): string => {
    return cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  };
  
  const lines: string[] = [];
  lines.push(`| ${headers.map(escapeCell).join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  rows.forEach(row => {
    const paddedRow = headers.map((_, i) => escapeCell(row[i] || ''));
    lines.push(`| ${paddedRow.join(' | ')} |`);
  });
  return lines.join('\n');
};

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Table copy button with dropdown
const TableCopyButton: React.FC<{ tableRef: React.RefObject<HTMLDivElement | null> }> = ({ tableRef }) => {
  const [copied, setCopied] = React.useState(false);
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopy = async (format: 'csv' | 'tsv') => {
    const tableEl = tableRef.current?.querySelector('table');
    if (!tableEl) return;
    
    try {
      const data = extractTableData(tableEl);
      const content = format === 'csv' ? tableToCSV(data) : tableToTSV(data);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([content], { type: 'text/plain' }),
          'text/html': new Blob([tableEl.outerHTML], { type: 'text/html' }),
        }),
      ]);
      setCopied(true);
      setShowMenu(false);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy table:', err);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1 rounded hover:bg-interactive-hover/60 text-muted-foreground hover:text-foreground transition-colors"
        title="Copy table"
      >
        {copied ? <RiCheckLine className="size-3.5" /> : <RiFileCopyLine className="size-3.5" />}
      </button>
      {showMenu && (
        <div className="absolute top-full right-0 z-10 mt-1 min-w-[100px] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <button
            className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-interactive-hover/40"
            onClick={() => handleCopy('csv')}
          >
            CSV
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-interactive-hover/40"
            onClick={() => handleCopy('tsv')}
          >
            TSV
          </button>
        </div>
      )}
    </div>
  );
};

// Table download button with dropdown
const TableDownloadButton: React.FC<{ tableRef: React.RefObject<HTMLDivElement | null> }> = ({ tableRef }) => {
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

   const handleDownload = (format: 'csv' | 'markdown') => {
     const tableEl = tableRef.current?.querySelector('table');
     if (!tableEl) return;
     
     try {
       const data = extractTableData(tableEl);
       const content = format === 'csv' ? tableToCSV(data) : tableToMarkdown(data);
       const filename = format === 'csv' ? 'table.csv' : 'table.md';
       const mimeType = format === 'csv' ? 'text/csv' : 'text/markdown';
       downloadFile(filename, content, mimeType);
       setShowMenu(false);
       toast.success(`Table downloaded as ${format.toUpperCase()}`);
     } catch (err) {
       console.error('Failed to download table:', err);
     }
   };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-1 rounded hover:bg-interactive-hover/60 text-muted-foreground hover:text-foreground transition-colors"
        title="Download table"
      >
        <RiDownloadLine className="size-3.5" />
      </button>
      {showMenu && (
        <div className="absolute top-full right-0 z-10 mt-1 min-w-[100px] overflow-hidden rounded-md border border-border bg-background shadow-lg">
          <button
            className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-interactive-hover/40"
            onClick={() => handleDownload('csv')}
          >
            CSV
          </button>
          <button
            className="w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-interactive-hover/40"
            onClick={() => handleDownload('markdown')}
          >
            Markdown
          </button>
        </div>
      )}
    </div>
  );
};

// Table wrapper with custom controls
const TableWrapper: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => {
  const tableRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="group my-4 flex flex-col space-y-2" data-streamdown="table-wrapper" ref={tableRef}>
      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <TableCopyButton tableRef={tableRef} />
        <TableDownloadButton tableRef={tableRef} />
      </div>
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse border border-border', className)} data-streamdown="table">
          {children}
        </table>
      </div>
    </div>
  );
};

type CodeBlockWrapperProps = React.HTMLAttributes<HTMLPreElement> & {
  children?: React.ReactNode;
};

const getMermaidInfo = (children: React.ReactNode): { isMermaid: boolean; source: string } => {
  if (!React.isValidElement(children)) return { isMermaid: false, source: '' };
  const props = children.props as Record<string, unknown> | undefined;
  const className = typeof props?.className === 'string' ? props.className : '';
  if (!className.includes('language-mermaid')) return { isMermaid: false, source: '' };
  // Extract raw mermaid source from the code element's children
  const codeChildren = props?.children;
  let source = '';
  if (typeof codeChildren === 'string') {
    source = codeChildren;
  } else if (React.isValidElement(codeChildren)) {
    const innerProps = codeChildren.props as Record<string, unknown> | undefined;
    if (typeof innerProps?.children === 'string') source = innerProps.children;
  }
  return { isMermaid: true, source };
};

const CodeBlockWrapper: React.FC<CodeBlockWrapperProps> = ({ children, className, style, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const codeRef = React.useRef<HTMLDivElement>(null);
  const mermaidInfo = getMermaidInfo(children);
  const codeChild = React.useMemo(
    () => (
      React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { 'data-block': true })
        : children
    ),
    [children],
  );

  const normalizedStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!style) return style;

    const next: React.CSSProperties = { ...style };

    const normalizeDeclarationString = (
      raw: unknown
    ): { value?: string; vars: Record<string, string> } => {
      if (typeof raw !== 'string') return { value: undefined, vars: {} };

      const [valuePart, ...rest] = raw.split(';').map((p) => p.trim()).filter(Boolean);
      const vars: Record<string, string> = {};
      for (const decl of rest) {
        const idx = decl.indexOf(':');
        if (idx === -1) continue;
        const prop = decl.slice(0, idx).trim();
        const value = decl.slice(idx + 1).trim();
        if (!prop.startsWith('--') || value.length === 0) continue;
        vars[prop] = value;
      }
      return { value: valuePart, vars };
    };

    const bg = normalizeDeclarationString((style as React.CSSProperties).backgroundColor);
    if (bg.value) {
      next.backgroundColor = bg.value;
      (next as Record<string, string>)['--shiki-light-bg'] = bg.value;
    }
    for (const [k, v] of Object.entries(bg.vars)) {
      (next as Record<string, string>)[k] = v;
    }

    const fg = normalizeDeclarationString((style as React.CSSProperties).color);
    if (fg.value) {
      next.color = fg.value;
      (next as Record<string, string>)['--shiki-light'] = fg.value;
    }
    for (const [k, v] of Object.entries(fg.vars)) {
      (next as Record<string, string>)[k] = v;
    }

    return next;
  }, [style]);

  // Mermaid blocks get their own controls via MermaidWrapper — skip the code copy button.
  if (mermaidInfo.isMermaid) {
    return <MermaidWrapper source={mermaidInfo.source}>{codeChild}</MermaidWrapper>;
  }

  const getCodeContent = (): string => {
    if (!codeRef.current) return '';
    const codeEl = codeRef.current.querySelector('code');

    return codeEl?.innerText || '';
  };

  const handleCopy = async () => {
    const code = getCodeContent();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="group relative" ref={codeRef}>
      <pre
        {...props}
        className={cn(className)}
        style={normalizedStyle}
      >
        {codeChild}
      </pre>
      <div className="absolute top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-interactive-hover/60 text-muted-foreground hover:text-foreground transition-colors"
          title="Copy"
        >
          {copied ? <RiCheckLine className="size-3.5" /> : <RiFileCopyLine className="size-3.5" />}
        </button>
      </div>
    </div>
  );
};

const streamdownComponents = {
  pre: CodeBlockWrapper,
  table: TableWrapper,
};

const streamdownPlugins = {
  code,
  mermaid,
};

const streamdownControls = {
  code: false,
  table: false,
  mermaid: {
    download: false,
    copy: false,
    fullscreen: false,
    panZoom: false,
  },
};

// Mermaid copy button — copies raw mermaid source
const MermaidCopyButton: React.FC<{ source: string }> = ({ source }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy diagram:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-interactive-hover/60 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy diagram source"
    >
      {copied ? <RiCheckLine className="size-3.5" /> : <RiFileCopyLine className="size-3.5" />}
    </button>
  );
};

// Mermaid download button — downloads rendered SVG
const MermaidDownloadButton: React.FC<{ containerRef: React.RefObject<HTMLDivElement | null> }> = ({ containerRef }) => {
  const handleDownload = () => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!(svgEl instanceof SVGElement)) return;
    const serializer = new XMLSerializer();
    let markup = serializer.serializeToString(svgEl);
    if (!markup.includes('xmlns=')) {
      markup = markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    downloadFile('diagram.svg', markup, 'image/svg+xml');
    toast.success('Diagram downloaded');
  };

  return (
    <button
      onClick={handleDownload}
      className="p-1 rounded hover:bg-interactive-hover/60 text-muted-foreground hover:text-foreground transition-colors"
      title="Download diagram"
    >
      <RiDownloadLine className="size-3.5" />
    </button>
  );
};

// Mermaid wrapper with custom controls (same pattern as TableWrapper)
const MermaidWrapper: React.FC<{ children: React.ReactNode; source: string }> = ({ children, source }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="group relative" ref={containerRef}>
      {children}
      <div className="absolute top-1 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <MermaidDownloadButton containerRef={containerRef} />
        <MermaidCopyButton source={source} />
      </div>
    </div>
  );
};

export type MarkdownVariant = 'assistant' | 'tool';

interface MarkdownRendererProps {
  content: string;
  part?: Part;
  messageId: string;
  isAnimated?: boolean;
  className?: string;
  isStreaming?: boolean;
  variant?: MarkdownVariant;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  part,
  messageId,
  isAnimated = true,
  className,
  isStreaming = false,
  variant = 'assistant',
}) => {
  const shikiThemes = useMarkdownShikiThemes();
  const { options: mermaidOptions, mermaidRenderKey } = useStreamdownMermaidOptions();
  const componentKey = React.useMemo(() => {
    const signature = part?.id ? `part-${part.id}` : `message-${messageId}`;
    return `markdown-${signature}`;
  }, [messageId, part?.id]);

  const streamdownClassName = variant === 'tool'
    ? 'streamdown-content streamdown-tool'
    : 'streamdown-content';

  const markdownContent = (
    <div className={cn('break-words', className)}>
      <Streamdown
         key={`streamdown-${componentKey}-${mermaidRenderKey}`}
         mode={isStreaming ? 'streaming' : 'static'}
         shikiTheme={shikiThemes}
         className={streamdownClassName}
         controls={streamdownControls}
         plugins={streamdownPlugins}
         mermaid={mermaidOptions}
         components={streamdownComponents}
       >
        {content}
      </Streamdown>
    </div>
  );

  if (isAnimated) {
    return (
      <FadeInOnReveal key={componentKey}>
        {markdownContent}
      </FadeInOnReveal>
    );
  }

  return markdownContent;
};

export const SimpleMarkdownRenderer: React.FC<{
  content: string;
  className?: string;
  variant?: MarkdownVariant;
}> = ({ content, className, variant = 'assistant' }) => {
  const shikiThemes = useMarkdownShikiThemes();
  const { options: mermaidOptions, mermaidRenderKey } = useStreamdownMermaidOptions();

  const streamdownClassName = variant === 'tool'
    ? 'streamdown-content streamdown-tool'
    : 'streamdown-content';

  return (
    <div className={cn('break-words', className)}>
      <Streamdown
        key={`streamdown-simple-${mermaidRenderKey}`}
        mode="static"
        shikiTheme={shikiThemes}
        className={streamdownClassName}
        controls={streamdownControls}
        plugins={streamdownPlugins}
        mermaid={mermaidOptions}
        components={streamdownComponents}
      >
        {content}
      </Streamdown>
    </div>
  );
};
