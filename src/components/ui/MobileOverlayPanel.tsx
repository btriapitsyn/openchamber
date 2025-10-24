import React from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface MobileOverlayPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const OVERLAY_ROOT_ID = 'mobile-overlay-root';

const ensureOverlayRoot = () => {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
};

export const MobileOverlayPanel: React.FC<MobileOverlayPanelProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
}) => {
  const overlayRootRef = React.useRef<HTMLElement | null>(null);

  if (typeof document !== 'undefined' && !overlayRootRef.current) {
    overlayRootRef.current = ensureOverlayRoot();
  }

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !overlayRootRef.current) {
    return null;
  }

  const content = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn(
          'mt-auto w-full rounded-t-xl border border-border/50 bg-background shadow-2xl pwa-overlay-panel',
          'mx-auto max-w-lg',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <h2 className="typography-ui-label font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4"  weight="bold" />
          </button>
        </div>
        <div className="max-h-[min(70vh,520px)] overflow-y-auto px-2 py-2 pwa-overlay-scroll">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-border/40 px-3 py-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, overlayRootRef.current);
};

export default MobileOverlayPanel;
