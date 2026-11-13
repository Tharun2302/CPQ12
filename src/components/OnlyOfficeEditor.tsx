import { useEffect, useRef } from 'react';
import { reportUserActivity } from '../utils/sessionGuard';

interface OnlyOfficeEditorProps {
  editorUrl: string; // e.g. http://localhost:3003
  config: any; // OnlyOffice DocsAPI config object from the backend session response
  onReady?: () => void;
  onError?: (msg: string) => void;
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (containerId: string, config: any) => unknown };
  }
}

/**
 * Embeds OnlyOffice Document Server's editor in an iframe-equivalent container.
 *
 * Loads `${editorUrl}/web-apps/apps/api/documents/api.js` then instantiates a DocEditor
 * inside the host div. The editor calls back to our backend's callback URL when the user
 * clicks Save — we don't need to handle save events here.
 */
export default function OnlyOfficeEditor({ editorUrl, config, onReady, onError }: OnlyOfficeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<unknown>(null);
  const containerId = useRef(`onlyoffice-editor-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    const scriptId = 'onlyoffice-docsapi-script';

    const init = () => {
      if (cancelled) return;
      if (!window.DocsAPI || !containerRef.current) return;
      try {
        const fullConfig = {
          ...config,
          width: '100%',
          height: '100%',
          events: {
            onAppReady: () => onReady?.(),
            // Keystrokes in the iframe never reach this page; data is true only for the user's own edits, not saves
            onDocumentStateChange: (e: any) => {
              if (e?.data === true) reportUserActivity();
            },
            onError: (e: any) => {
              const msg = e?.data?.errorDescription || e?.data?.message || 'OnlyOffice error';
              console.error('❌ OnlyOffice editor error:', e);
              onError?.(msg);
            },
            onWarning: (e: any) => {
              console.warn('⚠️ OnlyOffice editor warning:', e);
            },
          },
        };
        editorRef.current = new window.DocsAPI!.DocEditor(containerId.current, fullConfig);
      } catch (err) {
        console.error('❌ Failed to construct OnlyOffice editor:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to initialize editor');
      }
    };

    if (window.DocsAPI) {
      init();
    } else {
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = `${editorUrl.replace(/\/$/, '')}/web-apps/apps/api/documents/api.js`;
        script.async = true;
        script.onload = init;
        script.onerror = () =>
          onError?.(
            `Could not load OnlyOffice from ${editorUrl}. Is the OnlyOffice container running? Run: docker compose --profile onlyoffice up -d`,
          );
        document.head.appendChild(script);
      } else if (window.DocsAPI) {
        init();
      } else {
        script.addEventListener('load', init);
      }
    }

    return () => {
      cancelled = true;
      try {
        const ed = editorRef.current as { destroyEditor?: () => void } | null;
        ed?.destroyEditor?.();
      } catch {}
      editorRef.current = null;
    };
  }, [editorUrl, config, onError, onReady]);

  // The editor iframe is cross-origin, so reading and scrolling inside it are invisible to this page.
  // What the page can see: focus moving into the editor (a click in it) and the mouse crossing its edge.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const editorHasFocus = () => {
      const active = document.activeElement;
      return !!active && active.tagName === 'IFRAME' && container.contains(active);
    };
    const onWindowBlur = (event: FocusEvent) => {
      // blur fires before activeElement settles on the iframe
      if (event.isTrusted) window.setTimeout(() => { if (editorHasFocus()) reportUserActivity(); }, 0);
    };
    const onEdgeCrossed = (event: MouseEvent) => {
      const crossedIframe = (event.target as Element | null)?.tagName === 'IFRAME'
        || (event.relatedTarget as Element | null)?.tagName === 'IFRAME';
      if (event.isTrusted && crossedIframe) reportUserActivity();
    };
    window.addEventListener('blur', onWindowBlur);
    container.addEventListener('mouseover', onEdgeCrossed);
    container.addEventListener('mouseout', onEdgeCrossed);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      container.removeEventListener('mouseover', onEdgeCrossed);
      container.removeEventListener('mouseout', onEdgeCrossed);
    };
  }, []);

  // DocsAPI replaces the inner placeholder with its iframe, so listeners live on the wrapper that stays
  return (
    <div ref={containerRef} className="w-full h-full">
      <div id={containerId.current} className="w-full h-full" />
    </div>
  );
}
