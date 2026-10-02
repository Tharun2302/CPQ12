import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { authAwareError, getAuthHeaders } from '../utils/authUtils';
import OnlyOfficeEditor from './OnlyOfficeEditor';

const RESULT_TIMEOUT_MS = 30000;
const RESULT_POLL_MS = 1500;
// Well inside the server's 3-minute stale window, so other admins stay blocked while this is open
const HEARTBEAT_MS = 60000;

function sessionAction(sessionId: string, action: 'heartbeat' | 'release') {
  // keepalive lets the release finish even while the page is unloading
  return fetch(`${BACKEND_URL}/api/onlyoffice/exhibit-session/${encodeURIComponent(sessionId)}/${action}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    keepalive: true,
  }).catch(() => undefined);
}

export interface RedlineExhibit {
  _id?: string;
  id?: string;
  name: string;
}

interface ExhibitRedlineEditorProps {
  exhibit: RedlineExhibit;
  onClose: () => void;
  onSaved: (message: string) => void;
}

interface EditorSession {
  sessionId: string;
  editorUrl: string;
  config: unknown;
}

async function waitForEditedExhibit(sessionId: string): Promise<string | undefined> {
  const start = Date.now();
  let status: string | undefined;
  while (Date.now() - start < RESULT_TIMEOUT_MS) {
    const r = await fetch(`${BACKEND_URL}/api/onlyoffice/result/${sessionId}`);
    if (r.ok) {
      status = (await r.json())?.status;
      if (status === 'ready' || status === 'no-changes' || status === 'editor-error') return status;
    }
    await new Promise((res) => setTimeout(res, RESULT_POLL_MS));
  }
  return status;
}

// "Edit for RedLine" for an exhibit: opens its DOCX in OnlyOffice and, on Done, overwrites the stored exhibit.
function ExhibitRedlineEditor({ exhibit, onClose, onSaved }: ExhibitRedlineEditorProps) {
  const exhibitId = exhibit._id || exhibit.id || '';
  const [session, setSession] = useState<EditorSession | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(
          `${BACKEND_URL}/api/onlyoffice/start-session-from-exhibit/${encodeURIComponent(exhibitId)}`,
          { method: 'POST', headers: getAuthHeaders() },
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.success) throw new Error(authAwareError(resp.status, data?.error, 'Failed to open the editor'));
        // Unmounted before the session arrived: free the exhibit instead of leaving it locked
        if (cancelled) sessionAction(data.sessionId, 'release');
        else setSession({ sessionId: data.sessionId, editorUrl: data.editorUrl, config: data.config });
      } catch (e) {
        if (!cancelled) setOpenError(e instanceof Error ? e.message : 'Could not open the editor. Make sure OnlyOffice is running.');
      }
    })();
    return () => { cancelled = true; };
  }, [exhibitId]);

  const sessionId = session?.sessionId;
  useEffect(() => {
    if (!sessionId) return undefined;
    const timer = window.setInterval(() => sessionAction(sessionId, 'heartbeat'), HEARTBEAT_MS);
    const releaseOnUnload = () => { sessionAction(sessionId, 'release'); };
    window.addEventListener('pagehide', releaseOnUnload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', releaseOnUnload);
      sessionAction(sessionId, 'release');
    };
  }, [sessionId]);

  // Stable so OnlyOfficeEditor doesn't rebuild the editor on every render
  const handleEditorError = useCallback((msg: string) => alert('Editor error: ' + msg), []);

  const handleDone = async () => {
    if (!session || isSaving) return;
    setIsSaving(true);
    try {
      try {
        await fetch(`${BACKEND_URL}/api/onlyoffice/force-save/${session.sessionId}`, { method: 'POST' });
      } catch {
        // An auto-saved version may still arrive, so keep polling
      }

      const status = await waitForEditedExhibit(session.sessionId);
      if (status === 'no-changes') {
        onSaved('No changes to save');
        onClose();
        return;
      }
      if (status === 'editor-error') {
        alert('The editor could not save your changes. Nothing was saved. Close the editor and try again.');
        return;
      }
      if (status !== 'ready') {
        alert('Saving the edited exhibit timed out. Nothing was saved. Try Done again.');
        return;
      }

      const persist = await fetch(
        `${BACKEND_URL}/api/onlyoffice/persist-to-exhibit/${session.sessionId}`,
        { method: 'POST', headers: getAuthHeaders() },
      );
      const pdata = await persist.json().catch(() => ({}));
      if (!persist.ok || !pdata?.success) {
        throw new Error(authAwareError(persist.status, pdata?.error, 'Failed to save the edited exhibit'));
      }
      onSaved(pdata.folderUpdated === false
        ? 'Exhibit saved to the database, but the backend exhibits folder could not be updated'
        : 'Exhibit saved');
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save the edited exhibit.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex flex-col" role="dialog" aria-label="Edit for RedLine">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-semibold">✏️ Edit for RedLine — {exhibit.name}</span>
          <span className="text-xs text-blue-200">
            Make your edits, click <strong>File → Save</strong> in the editor, then click <strong>Done</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDone}
            disabled={!session || isSaving}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-60 text-white text-sm font-semibold rounded-md px-4 py-1.5 flex items-center gap-2"
            title="Save your edits over this exhibit"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {isSaving ? 'Saving…' : 'Done'}
          </button>
          <button
            type="button"
            onClick={() => { if (!isSaving) onClose(); }}
            disabled={isSaving}
            className="bg-white/15 hover:bg-white/25 disabled:opacity-60 text-white text-sm font-semibold rounded-md px-4 py-1.5 flex items-center gap-2"
            title="Close without saving"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
      <div className="flex-1 bg-white">
        {session && !openError ? (
          <OnlyOfficeEditor editorUrl={session.editorUrl} config={session.config} onError={handleEditorError} />
        ) : (
          <div className="h-full flex items-center justify-center">
            {openError
              ? <p className="text-red-600 text-sm px-4">{openError}</p>
              : <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-label="Opening editor" />}
          </div>
        )}
      </div>
    </div>
  );
}

export default ExhibitRedlineEditor;
