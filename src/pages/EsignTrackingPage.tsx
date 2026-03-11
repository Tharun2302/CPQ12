import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Check, Clock, Download, Eye, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface EsignDocument {
  id: string;
  file_name: string;
  status: string;
  signed_file_path?: string;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role?: string;
  status: 'pending' | 'signed' | 'reviewed' | 'denied';
  order?: number;
  comment?: string | null;
}

const POLL_INTERVAL_MS = 12000;

const EsignTrackingPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [doc, setDoc] = useState<EsignDocument | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
          <Link to="/esign" className="text-indigo-600 hover:underline">Back to E-Signature Documents</Link>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const isSentOrCompleted = doc.status === 'sent' || doc.status === 'completed';
  const allSigned = doc.status === 'completed';

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
        <Link to="/esign" className="text-sm text-slate-500 hover:text-slate-800 mb-2 inline-block">← Back to E-Signature Documents</Link>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white">E-Signature Status</h1>
            <p className="text-indigo-100 text-sm mt-0.5 truncate">{doc.file_name}</p>
            {doc.status === 'denied' ? (
              <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/90 text-white">
                Denied
              </span>
            ) : isSentOrCompleted ? (
              <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-white/20 text-white">
                Sent for e-signature
              </span>
            ) : null}
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Recipients</h2>
              <ul className="space-y-2">
                {recipients.map((rec, idx) => {
                  const statusLabel = rec.status === 'signed' ? 'Signed' : rec.status === 'reviewed' ? 'Reviewed' : rec.status === 'denied' ? 'Denied' : 'Pending';
                  const statusClass = rec.status === 'signed' ? 'text-emerald-600 font-medium' : rec.status === 'reviewed' ? 'text-amber-600 font-medium' : rec.status === 'denied' ? 'text-red-600 font-medium' : 'text-slate-500';
                  return (
                    <li key={rec.id} className="py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-800">
                          Recipient {idx + 1}: {rec.name || rec.email || 'Signer'}{' '}
                          <span className="text-slate-400">({rec.role || 'signer'})</span>
                          {' — '}
                          <span className={statusClass}>{statusLabel}</span>
                        </span>
                        {rec.status === 'signed' ? (
                          <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                        ) : rec.status === 'denied' ? (
                          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        ) : rec.status === 'reviewed' ? (
                          <Check className="h-5 w-5 text-amber-600 shrink-0" />
                        ) : (
                          <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                        )}
                      </div>
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
