import React from 'react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  /** Section content */
  children: React.ReactNode;
  /** Optional section title */
  title?: string;
  /** Optional section description */
  description?: string;
  /** If true, adds a top border divider */
  divider?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Standard section wrapper for settings page content.
 * Provides consistent spacing and optional divider.
 *
 * @example
 * <SettingsSection title="Appearance" description="Customize the look and feel">
 *   <ThemeSelector />
 *   <FontSizeSelector />
 * </SettingsSection>
 *
 * <SettingsSection divider>
 *   <DangerZoneSettings />
 * </SettingsSection>
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  children,
  title,
  description,
  divider = false,
  className,
}) => {
  return (
    <div
      className={cn(
        divider && 'border-t border-border/40 pt-6',
        className
      )}
    >
      {(title || description) && (
        <div className="mb-4 space-y-1">
          {title && (
            <h3 className="typography-ui-header font-semibold text-foreground">
              {title}
            </h3>
          )}
          {description && (
            <p className="typography-meta text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
