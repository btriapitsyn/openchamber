import React from 'react';

interface VSCodeHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
}

export function VSCodeHeader({ title, showBack, onBack, actions }: VSCodeHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      {showBack && (
        <button
          onClick={onBack}
          className="p-1 -ml-1 rounded hover:bg-muted transition-colors"
          aria-label="Go back"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      <h1 className="flex-1 text-sm font-medium truncate">{title}</h1>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}
