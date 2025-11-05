// Lightweight Microsoft Clarity integration for SPA
// Usage:
//   initClarity(import.meta.env.VITE_CLARITY_ID)
//   track('event_name', { prop: 'value' })

declare global {
  interface Window {
    clarity?: (...args: any[]) => void;
  }
}

export function initClarity(projectId?: string) {
  try {
    if (!projectId) return; // No project configured
    if (typeof window === 'undefined') return;
    if (window.clarity) return; // Already initialized

    // Only initialize in production builds by default, unless explicitly enabled for dev
    const mode = (import.meta as any)?.env?.MODE;
    const enableDev = (import.meta as any)?.env?.VITE_CLARITY_ENABLE_DEV === '1';
    if (mode && mode !== 'production' && !enableDev) return;

    (function (c, l, a, r, i, t, y) {
      (c as any)[a] = (c as any)[a] || function () {
        ((c as any)[a].q = (c as any)[a].q || []).push(arguments);
      };
      t = l.createElement(r) as HTMLScriptElement;
      t.async = 1 as any;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0] as any;
      y.parentNode?.insertBefore(t, y);
    })(window as any, document, 'clarity', 'script', projectId);
  } catch {
    // no-op
  }
}

export function track(name: string, props?: Record<string, any>) {
  try {
    window.clarity?.('event', name, props || {});
  } catch {
    // no-op
  }
}


