/**
 * Получение публичного адреса сайта для копирования и шеринга.
 * На бою автоматически берет origin текущей вкладки.
 * В локальной разработке берет VITE_SITE_URL из .env.local (если задан) или текущий хост.
 */
export function getPublicSiteUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }
  return (import.meta.env.VITE_SITE_URL as string) || (typeof window !== 'undefined' ? window.location.origin : '');
}
