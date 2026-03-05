import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mail, Loader2, Copy, Check } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

const EsignSendPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<{ file_name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendForSignatureResult, setSendForSignatureResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sequential, setSequential] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const signingUrl = `${baseUrl}/sign/${documentId}`;

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`);
        const data = await res.json();
        if (data.success) setDoc(data.document);
        else navigate('/esign');
      } catch {
        navigate('/esign');
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId, navigate]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(signingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendForSignature = async () => {
    if (!documentId) return;
    setSending(true);
    setSendForSignatureResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/send-for-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequential }),
      });
      const data = await res.json();
      if (data.success) setSendForSignatureResult(data.message || 'Sent.');
      else setSendForSignatureResult(data.error || 'Failed.');
    } catch {
      setSendForSignatureResult('Failed to send.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white">Send to Signer</h1>
            <p className="text-indigo-100 text-sm mt-0.5">{doc.file_name}</p>
          </div>

          <div className="p-6 space-y-6">
            <p className="text-sm text-slate-600">
              Send the document to recipients by email (each gets a unique signing link), or copy the link to share manually.
            </p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sequential}
                onChange={(e) => setSequential(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-sm text-slate-700">Sequential: send only to first recipient; after they sign, the next receives the email (with signed document).</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Signing link (single link for all)</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={signingUrl}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 bg-slate-50 text-sm"
                />
                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {sendForSignatureResult && (
              <p className={`text-sm ${sendForSignatureResult.startsWith('Signing') || sendForSignatureResult.startsWith('Document') ? 'text-emerald-600' : 'text-amber-600'}`}>
                {sendForSignatureResult}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 font-medium"
              >
                Back
              </button>
              <button
                onClick={handleSendForSignature}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send for Signature
              </button>
              <a
                href={`/sign/${documentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
              >
                Open Signing Page →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignSendPage;
