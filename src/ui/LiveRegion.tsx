import React from 'react';

interface LiveRegionProps {
  text: string;
  testId?: string;
}

/**
 * Невидимая область, которую скринридер зачитывает при изменении (#11). Она
 * должна быть в DOM заранее: область, появившаяся вместе с текстом, не
 * озвучивается. Частоту объявлений ограничивает useThrottledAnnouncement.
 */
export const LiveRegion: React.FC<LiveRegionProps> = ({ text, testId }) => (
  <output className="sr-only" aria-live="polite" aria-atomic="true" data-testid={testId}>
    {text}
  </output>
);
