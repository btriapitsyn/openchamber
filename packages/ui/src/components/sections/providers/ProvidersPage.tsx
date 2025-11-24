import React from 'react';
import { SectionPlaceholder } from '../SectionPlaceholder';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

export const ProvidersPage: React.FC = () => {
  return (
    <ScrollableOverlay outerClassName="h-full" className="mx-auto max-w-3xl space-y-6 p-6">
      <SectionPlaceholder sectionId="providers" variant="page" />
    </ScrollableOverlay>
  );
};
