import { useThemeSystem } from '@/contexts/ThemeSystemContext';

export function ThemeDemo() {
  const { currentTheme } = useThemeSystem();
  
  return (
    <div className="p-4 space-y-4">
      <h2 className="typography-markdown font-bold">Current Theme: {currentTheme.metadata.name}</h2>
      
      <div className="space-y-2">
        <h3 className="typography-ui-label font-semibold">Color Samples:</h3>
        
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <div className="h-8 rounded" style={{ backgroundColor: 'var(--primary-base)' }} />
            <span className="typography-meta">Primary</span>
          </div>
          
          <div className="space-y-1">
            <div className="h-8 rounded" style={{ backgroundColor: 'var(--surface-background)' }} />
            <span className="typography-meta">Background</span>
          </div>
          
          <div className="space-y-1">
            <div className="h-8 rounded" style={{ backgroundColor: 'var(--surface-foreground)' }} />
            <span className="typography-meta">Foreground</span>
          </div>
          
          <div className="space-y-1">
            <div className="h-8 rounded" style={{ backgroundColor: 'var(--status-success)' }} />
            <span className="typography-meta">Success</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="typography-ui-label font-semibold">Markdown Styles:</h3>
        <h1 style={{ color: 'var(--markdown-heading1)' }}>Heading 1</h1>
        <h2 style={{ color: 'var(--markdown-heading2)' }}>Heading 2</h2>
        <h3 style={{ color: 'var(--markdown-heading3)' }}>Heading 3</h3>
        <a href="#" style={{ color: 'var(--markdown-link)' }}>Link Example</a>
        <code style={{ 
          color: 'var(--markdown-inline-code)', 
          backgroundColor: 'var(--markdown-inline-code-bg)',
          padding: '2px 4px',
          borderRadius: '3px'
        }}>inline code</code>
      </div>
      
      <div className="space-y-2">
        <h3 className="typography-ui-label font-semibold">Syntax Highlighting:</h3>
        <div className="bg-black/5 dark:bg-white/5 p-2 rounded space-y-1 font-mono typography-meta">
          <div style={{ color: 'var(--syntax-keyword)' }}>const keyword</div>
          <div style={{ color: 'var(--syntax-string)' }}>"string value"</div>
          <div style={{ color: 'var(--syntax-number)' }}>42</div>
          <div style={{ color: 'var(--syntax-function)' }}>functionName()</div>
          <div style={{ color: 'var(--syntax-comment)' }}>// comment</div>
        </div>
      </div>
    </div>
  );
}