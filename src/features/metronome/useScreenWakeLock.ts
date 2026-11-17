import { useEffect } from 'react';

/**
 * Держит экран включённым, пока `active`. Метроном включают и кладут телефон
 * рядом: погасший экран на мобильных усыпляет страницу, и ритм обрывается.
 *
 * Блокировку браузер снимает сам, когда вкладка уходит в фон, — поэтому при
 * возвращении на вкладку она запрашивается заново. Отказ (нет API, запрет
 * политикой, экономия батареи) не ошибка: метроном просто играет без неё.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const api = typeof navigator === 'undefined' ? undefined : navigator.wakeLock;
    if (!api || typeof api.request !== 'function') return;

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let disposed = false;

    const request = () => {
      if (disposed || pending || sentinel || document.visibilityState !== 'visible') return;
      pending = true;
      api.request('screen').then(
        (lock) => {
          pending = false;
          if (disposed) {
            lock.release().catch(() => {});
            return;
          }
          sentinel = lock;
          lock.addEventListener('release', () => {
            if (sentinel === lock) sentinel = null;
          });
        },
        () => {
          pending = false;
        }
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const lock = sentinel;
      sentinel = null;
      lock?.release().catch(() => {});
    };
  }, [active]);
}
