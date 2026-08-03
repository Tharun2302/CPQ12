import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface Connection {
  connected: boolean;
  configured: boolean;
  provider_active: boolean;
  account_id?: string | null;
  connected_at?: string | null;
}

/**
 * Admin banner for the e-sign area: shows whether DocuSign is connected and offers a
 * one-time "Connect DocuSign" action (Authorization Code consent). Hidden entirely when
 * DocuSign is not the active provider.
 */
export default function DocusignConnectionBanner() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/docusign/connection`);
      const data = await res.json();
      if (data.success) setConn(data);
    } catch {
      /* leave conn null */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/docusign/consent-url`);
      const data = await res.json();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Could not start DocuSign connection.');
        setConnecting(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start DocuSign connection.');
      setConnecting(false);
    }
  };

  if (loading) return null;
  // Only relevant when DocuSign is the active provider.
  if (!conn || !conn.provider_active) return null;

  if (conn.connected) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>DocuSign is connected. Agreements are sent for signature through DocuSign.</span>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          {conn.configured
            ? 'DocuSign is configured but not connected. Connect it once to enable sending agreements for signature.'
            : 'DocuSign is not configured. Set DOCUSIGN_CLIENT_ID / SECRET / ACCOUNT_ID in the server environment.'}
          {error ? <span className="block text-red-700">{error}</span> : null}
        </span>
      </div>
      {conn.configured && (
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Connect DocuSign
        </button>
      )}
    </div>
  );
}
