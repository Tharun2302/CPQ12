import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Check, Clock, Download, Eye, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';

interface EsignDocument {
  id: string;
  file_name: string;
  status: string;
  signed_file_path?: string;
  uploaded_by?: string;
  creator_name?: string | null;
  creator_email?: string | null;
  sent_at?: string | null;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role?: string;
  status: 'pending' | 'signed' | 'reviewed' | 'denied';
  order?: number;
  comment?: string | null;
  token_expires_at?: string | null;
  forwarded_to_name?: string | null;
  forwarded_to_email?: string | null;
  forwarded_at?: string | null;
  forward_count?: number;
}

const POLL_INTERVAL_MS = 12000;

function normalizeEmail(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase();
}

function isEsignDocumentForCurrentUser(doc: EsignDocument, userEmail: string | undefined | null): boolean {
  const u = normalizeEmail(userEmail);
  if (!u) return false;
  const uploaded = String(doc.uploaded_by || '').trim();
  if (uploaded.includes('@') && normalizeEmail(uploaded) === u) return true;
  if (normalizeEmail(doc.creator_email) === u) return true;
  return false;
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

const EsignTrackingPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { user } = useAuth();
  const [doc, setDoc] = useState<EsignDocument | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [extendingExpiry, setExtendingExpiry] = useState(false);
  const [extendResult, setExtendResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!documentId) return;
    try {
      const [docRes, recRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`),
      ]);
      const docData = await docRes.json();
      const recData = await recRes.json();
      if (docData.success && docData.document) {
        setDoc(docData.document);
        setError(null);
      } else {
        setDoc(null);
        setError('Document not found');
      }
      if (recData.success && Array.isArray(recData.recipients)) {
        const sorted = [...recData.recipients].sort((a: Recipient, b: Recipient) => {
          const orderA = a.order ?? 999;
          const orderB = b.order ?? 999;
          return orderA - orderB;
        });
        setRecipients(sorted);
      } else {
        setRecipients([]);
      }
    } catch (err) {
      setError('Failed to load data');
      setDoc(null);
      setRecipients([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!documentId || !doc || doc.status !== 'sent') return;
    const interval = setInterval(loadData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [documentId, doc?.status, loadData]);

  const handleDownload = async () => {
    if (!documentId || !doc) return;
    setDownloading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/file?attachment=1`, { credentials: 'include' });
      if (!res.ok) {
        setError('Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = () => {
    if (!documentId) return;
    window.open(`${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1`, '_blank', 'noopener,noreferrer');
  };

  const handleExtendExpiry = async () => {
    if (!documentId || !doc) return;
    if (!window.confirm('Extend expiry for pending recipients? This will issue fresh secure links and email only the recipients who are still pending.')) return;
    setExtendingExpiry(true);
    setExtendResult(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/extend-expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setExtendResult(data.error || 'Failed to extend expiry.');
        return;
      }
      const expiresAtLabel = formatDateTime(data.expires_at);
      setExtendResult(
        expiresAtLabel
          ? `Expiry extended for ${data.emails_sent || 0} pending recipient(s). New expiry: ${expiresAtLabel}.`
          : `Expiry extended for ${data.emails_sent || 0} pending recipient(s).`
      );
      await loadData();
    } catch {
      setExtendResult('Failed to extend expiry.');
    } finally {
      setExtendingExpiry(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error && !doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link to="/esign" className="text-indigo-600 hover:underline">Back to e sign</Link>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const isSentOrCompleted = doc.status === 'sent' || doc.status === 'completed';
  const allSigned = doc.status === 'completed';
  const isCreator = isEsignDocumentForCurrentUser(doc, user?.email);
  const pendingRecipients = recipients.filter((rec) => rec.status === 'pending');
  const pendingExpiryLabel = formatDateTime(
    pendingRecipients
      .map((rec) => rec.token_expires_at || '')
      .find((value) => Boolean(value)) || null
  );

  if (doc.status === 'draft') {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-xl mx-auto text-center">
          <p className="text-slate-600 mb-4">This document has not been sent for signature yet.</p>
          <Link to={`/esign/${documentId}/place-fields`} className="text-indigo-600 hover:underline">Place fields and send</Link>
          <span className="mx-2">or</span>
          <Link to="/esign" className="text-indigo-600 hover:underline">Back to list</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <Link to="/esign" className="text-sm text-slate-500 hover:text-slate-800 mb-2 inline-block">← Back to e sign</Link>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white">e sign status</h1>
            <p className="text-indigo-100 text-sm mt-0.5 truncate">{doc.file_name}</p>
            {doc.status === 'denied' ? (
              <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/90 text-white">
                Denied
              </span>
            ) : isSentOrCompleted ? (
              <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-white/20 text-white">
                Sent for signature
              </span>
            ) : null}
          </div>

          <div className="p-6 space-y-6">
            {extendResult && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${extendResult.startsWith('Expiry extended') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {extendResult}
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Recipients</h2>
              <ul className="space-y-2">
                {recipients.map((rec, idx) => {
                  const isForwarded = !!rec.forwarded_to_email;
                  const forwardedTo = rec.forwarded_to_name || rec.forwarded_to_email;
                  const statusLabel = rec.status === 'signed' ? 'Signed' : rec.status === 'reviewed' ? 'Reviewed' : rec.status === 'denied' ? 'Denied' : 'Pending';
                  const statusClass = rec.status === 'signed' ? 'text-emerald-600 font-medium' : rec.status === 'reviewed' ? 'text-amber-600 font-medium' : rec.status === 'denied' ? 'text-red-600 font-medium' : 'text-slate-500';
                  return (
                    <li key={rec.id} className="py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-800">
                          Recipient {idx + 1}: {rec.name || rec.email || 'Signer'}{' '}
                          <span className="text-slate-400">({rec.role || 'signer'})</span>
                          {' — '}
                          {isForwarded ? (
                            <span className="text-purple-600 font-medium">Forwarded</span>
                          ) : (
                            <span className={statusClass}>{statusLabel}</span>
                          )}
                        </span>
                        {isForwarded ? (
                          <svg className="h-5 w-5 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : rec.status === 'signed' ? (
                          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : rec.status === 'denied' ? (
                          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        ) : rec.status === 'reviewed' ? (
                          <Check className="h-5 w-5 text-amber-600 shrink-0" />
                        ) : (
                          <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                        )}
                      </div>
                      {isForwarded && (
                        <div className="mt-1.5 text-xs text-slate-500 pl-0">
                          Forwarded to: <span className="font-medium text-purple-600">{forwardedTo}</span>
                        </div>
                      )}
                      {rec.comment && (
                        <div className="mt-1.5 pl-0 text-sm text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                          <span className="font-medium text-slate-500">Comment: </span>
                          {rec.comment}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {doc.status === 'denied' && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                <span className="font-medium text-red-800">This document was denied by a recipient. See comments above.</span>
              </div>
            )}

            {doc.status === 'sent' && pendingRecipients.length > 0 && pendingExpiryLabel && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Pending signing links expire on <strong>{pendingExpiryLabel}</strong>.
              </div>
            )}

            {['sent', 'signed', 'denied', 'voided'].includes(doc.status) && !allSigned && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
                  >
                    <Eye className="h-5 w-5" />
                    Preview document
                  </button>
                  {doc.status === 'sent' && isCreator && pendingRecipients.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExtendExpiry}
                      disabled={extendingExpiry}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {extendingExpiry ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
                      Extend expiry
                    </button>
                  )}
                </div>
                {(doc.status === 'sent' || doc.status === 'signed') && (
                  <p className="text-xs text-slate-500">
                    Shows the latest PDF on file, including any signatures applied so far.
                    {doc.status === 'sent' && isCreator ? ' Use Extend expiry to reissue fresh 15-day links for pending recipients only.' : ''}
                  </p>
                )}
              </div>
            )}

            {allSigned && (
              <>
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                  <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                  <span className="font-medium text-emerald-800">Done — All recipients have signed</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                    Download signed PDF
                  </button>
                  <button
                    type="button"
                    onClick={handlePreview}
                    className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
                  >
                    <Eye className="h-5 w-5" />
                    Preview
                  </button>
                </div>
              </>
            )}

            {doc.status === 'sent' && recipients.length > 0 && (
              <p className="text-sm text-slate-500">Waiting for all recipients to sign. This page updates automatically.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignTrackingPage;
