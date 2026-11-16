import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { migrateStorage } from './domain/storage';
import { ErrorBoundary } from './ui/ErrorBoundary';

// До первого рендера: экраны читают настройки уже по новым ключам.
migrateStorage();

// Регистрация Service Worker для PWA офлайн-режима с автообновлением
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => {});
    }).catch((err) => {
      console.log('SW registration failed:', err);
    });
  });
}

// Внешняя граница ловит то, что падает вне вкладок: инициализацию App, шапку,
// окно настроек. Ошибки внутри вкладки перехватывает граница в App.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
