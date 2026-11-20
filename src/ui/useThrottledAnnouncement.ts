import { useEffect, useRef, useState } from 'react';
import { AnnouncementThrottle } from '../domain/announcements';

/**
 * Текст для aria-live-области не чаще раза в minIntervalMs (#11): показания
 * меняются на каждом кадре, а скринридер должен успевать договорить.
 * Промежуточные значения пропускаются — звучит последнее.
 */
export function useThrottledAnnouncement(text: string, minIntervalMs: number): string {
  const [announced, setAnnounced] = useState('');
  const throttleRef = useRef<AnnouncementThrottle | null>(null);

  useEffect(() => {
    throttleRef.current ??= new AnnouncementThrottle(minIntervalMs);
    const throttle = throttleRef.current;
    const delay = throttle.delayFor(text, performance.now());
    if (delay === null) return;
    const id = window.setTimeout(() => {
      throttle.commit(text, performance.now());
      setAnnounced(text);
    }, delay);
    return () => window.clearTimeout(id);
  }, [text, minIntervalMs]);

  return announced;
}
