import React from 'react';
import { IconContext } from '@phosphor-icons/react';

/**
 * PhosphorIconContext provides global configuration for all Phosphor icons
 * Sets duotone as the default weight for a sophisticated look
 * Individual icons can override with their own weight prop
 */
export const PhosphorIconProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <IconContext.Provider
      value={{
        weight: 'duotone',
        mirrored: false,
      }}
    >
      {children}
    </IconContext.Provider>
  );
};
