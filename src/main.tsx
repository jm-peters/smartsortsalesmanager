import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AdminApp } from './admin/AdminApp.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for 100% offline functionality in production
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        console.log('SmartSort update available');
      },
      onOfflineReady() {
        console.log('SmartSort is ready to work completely offline');
      },
    });
  } catch (e) {
    console.warn('PWA service worker registration skipped in dev:', e);
  }
}

// Safely catch unhandled promise rejections to prevent crashing
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection captured safely:', event.reason);
    event.preventDefault();
  });
}

// Determine if we should mount the standalone Super-Admin Portal:
// 1. Check if env VITE_APP_MODE is 'admin'
// 2. Check if current hostname is 'admin.roastme.site'
const isAdminMode =
  (import.meta.env.VITE_APP_MODE === 'admin') ||
  (typeof window !== 'undefined' && window.location.hostname === 'admin.roastme.site');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isAdminMode ? <AdminApp /> : <App />}
    </ErrorBoundary>
  </StrictMode>
);
