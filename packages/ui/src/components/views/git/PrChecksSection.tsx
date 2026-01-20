import React from 'react';
import { RiCheckLine, RiCloseLine, RiLoader4Line, RiExternalLinkLine } from '@remixicon/react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import type { PrStatusCheck } from '@/lib/api/types';

interface PrChecksSectionProps {
  checks: PrStatusCheck[];
}

const getCheckStatus = (check: PrStatusCheck): 'success' | 'failure' | 'pending' => {
  if (check.conclusion === 'SUCCESS' || check.state === 'SUCCESS') return 'success';
  if (check.conclusion === 'FAILURE' || check.conclusion === 'TIMED_OUT' || 
      check.conclusion === 'CANCELLED' || check.conclusion === 'STARTUP_FAILURE' ||
      check.state === 'FAILURE' || check.state === 'ERROR') return 'failure';
  return 'pending';
};

const CheckIcon: React.FC<{ status: 'success' | 'failure' | 'pending' }> = ({ status }) => {
  switch (status) {
    case 'success':
      return <RiCheckLine className="w-4 h-4 text-green-500" />;
    case 'failure':
      return <RiCloseLine className="w-4 h-4 text-red-500" />;
    case 'pending':
      return <RiLoader4Line className="w-4 h-4 text-yellow-500 animate-spin" />;
  }
};

export const PrChecksSection: React.FC<PrChecksSectionProps> = ({ checks }) => {
  const successCount = checks.filter(c => getCheckStatus(c) === 'success').length;
  const failureCount = checks.filter(c => getCheckStatus(c) === 'failure').length;
  const pendingCount = checks.filter(c => getCheckStatus(c) === 'pending').length;

  if (checks.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col rounded-xl border border-border/60 bg-background/70">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40">
        <h3 className="typography-ui-header font-semibold text-foreground">Status Checks</h3>
        <div className="flex items-center gap-3 typography-meta text-muted-foreground">
          {successCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <RiCheckLine className="w-3.5 h-3.5" />
              {successCount}
            </span>
          )}
          {failureCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <RiCloseLine className="w-3.5 h-3.5" />
              {failureCount}
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-500">
              <RiLoader4Line className="w-3.5 h-3.5" />
              {pendingCount}
            </span>
          )}
        </div>
      </header>
      <ScrollableOverlay outerClassName="flex-1 min-h-0 max-h-[25vh]" className="w-full">
        <ul className="divide-y divide-border/60">
          {checks.map((check, idx) => {
            const status = getCheckStatus(check);
            const name = check.name || check.context || 'Unknown check';
            const url = check.detailsUrl || check.targetUrl;
            
            return (
              <li key={check.context || idx} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                <CheckIcon status={status} />
                <span className="flex-1 typography-small text-foreground truncate">{name}</span>
                {check.description && (
                  <span className="typography-meta text-muted-foreground truncate max-w-[200px]">
                    {check.description}
                  </span>
                )}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RiExternalLinkLine className="w-4 h-4" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollableOverlay>
    </section>
  );
};
