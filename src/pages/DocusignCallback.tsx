import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

/**
 * DocuSign OAuth (Authorization Code) redirect target.
 * DocuSign redirects here with ?code=...; we forward the code to the backend, which
 * exchanges it for tokens using the client secret (never exposed in the browser).
 */
export default function DocusignCallback() {
  const navigate = useNavigate();
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [message, setMessage] = useState('Connecting your DocuSign account…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const oauthState = params.get('state');
    const err = params.get('error') || params.get('error_description');
    if (err) {
      setState('error');
      setMessage(`DocuSign returned an error: ${err}`);
      return;
    }
    if (!code) {
      setState('error');
      setMessage('No authorization code was provided by DocuSign.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/docusign/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state: oauthState }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setState('ok');
          setMessage('DocuSign connected successfully. Agreements will now be sent for signature through DocuSign.');
          setTimeout(() => navigate('/esign'), 2500);
        } else {
          setState('error');
          setMessage(data.error || 'Failed to connect DocuSign.');
        }
      } catch (e) {
        setState('error');
        setMessage(e instanceof Error ? e.message : 'Failed to connect DocuSign.');
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {state === 'working' && <Loader2 className="mx-auto h-10 w-10 animate-spin text-indigo-600" />}
        {state === 'ok' && <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />}
        {state === 'error' && <XCircle className="mx-auto h-10 w-10 text-red-600" />}
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          {state === 'ok' ? 'DocuSign connected' : state === 'error' ? 'Connection failed' : 'Connecting DocuSign'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        {state === 'error' && (
          <button
            type="button"
            onClick={() => navigate('/esign')}
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Back to e-sign
          </button>
        )}
      </div>
    </div>
  );
}
