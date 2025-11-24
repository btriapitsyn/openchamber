import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

export const ProvidersSidebar: React.FC = () => {
  return (
    <ScrollableOverlay outerClassName="h-full" className="px-3 py-2">
      <SectionPlaceholder sectionId="providers" variant="sidebar" />
    </ScrollableOverlay>
  );
};
