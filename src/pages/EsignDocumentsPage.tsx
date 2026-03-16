import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Loader2, PenLine, Download, Trash2, ExternalLink, ListChecks, Check, Clock, XCircle, Eye, MoreVertical } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface EsignDocument {
  id: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
  status: 'draft' | 'sent' | 'signed' | 'completed' | 'voided';
}

interface StatusModalRecipient {
  id: string;
  name: string;
  email: string;
  role?: string;
  status: string;
  order?: number;
  comment?: string | null;
}

interface StatusModalDoc {
  id: string;
  file_name: string;
  status: string;
}

const EsignDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<EsignDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<StatusModalRecipient[]>([]);
  const [statusModalLoading, setStatusModalLoading] = useState(false);
  const [statusModalDownloading, setStatusModalDownloading] = useState(false);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents`);
      const data = await res.json();
      if (data.success && data.documents) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setUploadError('Please select a PDF file');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploaded_by', uploadedBy || 'anonymous');
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await loadDocuments();
        navigate(`/esign/${data.document.id}/place-fields`);
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleVoid = async (docId: string) => {
    if (!window.confirm('Void this document? Signing links will stop working. The document will stay in the list as voided.')) return;
    setVoidingId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await loadDocuments();
        if (statusModalId === docId) closeStatusModal();
      } else {
        alert(data.error || `Void failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Void failed. Check the console or try again.');
    } finally {
      setVoidingId(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}`, { method: 'DELETE' });
      let data: { success?: boolean; error?: string } = {};
      const contentType = res.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          data = { success: false, error: 'Invalid response' };
        }
      }
      if (res.ok && data.success) {
        await loadDocuments();
      } else if (res.status === 404) {
        // Document already deleted (e.g. elsewhere or previous request) — refresh list so it disappears
        await loadDocuments();
      } else {
        alert(data.error || `Delete failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch (err) {
      alert('Delete failed. Check the console or try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const openStatusModal = useCallback(async (docId: string) => {
    setStatusModalId(docId);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalLoading(true);
    try {
      const [docRes, recRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/documents/${docId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${docId}/recipients`),
      ]);
      const docData = await docRes.json();
      const recData = await recRes.json();
      if (docData.success && docData.document) {
        setStatusModalDoc({
          id: docData.document.id || docId,
          file_name: docData.document.file_name,
          status: docData.document.status,
        });
      }
      if (recData.success && Array.isArray(recData.recipients)) {
        const sorted = [...recData.recipients].sort(
          (a: StatusModalRecipient, b: StatusModalRecipient) => ((a.order ?? 999) - (b.order ?? 999))
        );
        setStatusModalRecipients(sorted);
      }
    } catch {
      setStatusModalDoc(null);
      setStatusModalRecipients([]);
    } finally {
      setStatusModalLoading(false);
    }
  }, []);

  const closeStatusModal = useCallback(() => {
    setStatusModalId(null);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
  }, []);

  const handleStatusModalDownload = async () => {
    if (!statusModalId || !statusModalDoc) return;
    setStatusModalDownloading(true);
    try {
      const url = `${BACKEND_URL}/api/esign/documents/${statusModalId}/file?attachment=1`;
      const link = document.createElement('a');
      link.href = url;
      link.download = statusModalDoc.file_name || 'document.pdf';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setStatusModalDownloading(false);
    }
  };

  const handleStatusModalPreview = () => {
    if (!statusModalId) return;
    window.open(`${BACKEND_URL}/api/esign/documents/${statusModalId}/file?inline=1`, '_blank', 'noopener,noreferrer');
  };

  const statusBadgeClass: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-800',
    sent: 'bg-blue-100 text-blue-800',
    signed: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-violet-100 text-violet-800',
    voided: 'bg-slate-200 text-slate-700',
  };

  return (
    <div className="min-h-screen bg-slate-50/80 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link to="/deal" className="text-sm text-slate-500 hover:text-slate-800 mb-2 inline-block">
            ← Back to Deal
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">e sign</h1>
          <p className="text-slate-500 mt-1 text-sm">Upload agreements and send them for signature</p>
        </div>

        {/* Upload Document card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Document</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-lg font-medium cursor-pointer hover:bg-violet-700 disabled:opacity-50 shadow-sm">
              <Upload className="h-5 w-5 shrink-0" />
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Uploading…
                </>
              ) : (
                'Choose PDF'
              )}
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
          {uploadError && (
            <p className="mt-2 text-sm text-red-600">{uploadError}</p>
          )}
        </div>

        {/* Your Documents card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="text-lg font-semibold text-slate-900 px-6 pt-5 pb-4 border-b border-slate-200">Your Documents</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>No documents yet. Upload a PDF to get started.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50/50"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg bg-violet-50 text-violet-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{doc.file_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${statusBadgeClass[doc.status] ?? 'bg-slate-100 text-slate-700'}`}
                    >
                      {doc.status}
                    </span>
                    {doc.status === 'draft' && (
                      <button
                        onClick={() => navigate(`/esign/${doc.id}/place-fields`)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 hover:underline"
                      >
                        <PenLine className="h-4 w-4" />
                        Place Fields
                      </button>
                    )}
                    {(doc.status === 'sent' || doc.status === 'completed' || doc.status === 'voided') && (
                      <button
                        type="button"
                        onClick={() => openStatusModal(doc.id)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-violet-600 hover:underline"
                      >
                        <ListChecks className="h-4 w-4" />
                        View status
                      </button>
                    )}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((id) => (id === doc.id ? null : doc.id))}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400"
                        title="Actions"
                        aria-expanded={openActionsId === doc.id}
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {openActionsId === doc.id && (
                        <>
                          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpenActionsId(null)} />
                          <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                            {doc.status === 'sent' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { handleVoid(doc.id); setOpenActionsId(null); }}
                                  disabled={voidingId === doc.id}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  {voidingId === doc.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                                  Void
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { navigate(`/esign/${doc.id}/send`); setOpenActionsId(null); }}
                                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  <ExternalLink className="h-4 w-4 shrink-0" />
                                  View Link
                                </button>
                              </>
                            )}
                            {(doc.status === 'signed' || doc.status === 'completed') && (
                              <a
                                href={`${BACKEND_URL}/api/esign/documents/${doc.id}/file?attachment=1`}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                onClick={() => setOpenActionsId(null)}
                                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                              >
                                <Download className="h-4 w-4 shrink-0" />
                                Download
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => { handleDelete(doc.id); setOpenActionsId(null); }}
                              disabled={deletingId === doc.id}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === doc.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Trash2 className="h-4 w-4 shrink-0" />}
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* View status modal */}
      {statusModalId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeStatusModal}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Agreement Status</h2>
              <button type="button" onClick={closeStatusModal} className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10" aria-label="Close">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {statusModalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                </div>
              ) : statusModalDoc ? (
                <>
                  <p className="text-slate-700 font-medium truncate">{statusModalDoc.file_name}</p>
                  {statusModalDoc.status === 'denied' ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/90 text-white">Denied</span>
                  ) : statusModalDoc.status === 'voided' ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-200 text-slate-700">Voided</span>
                  ) : (statusModalDoc.status === 'sent' || statusModalDoc.status === 'completed') ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800">Sent for signature</span>
                  ) : null}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Recipients</h3>
                    <ul className="space-y-2">
                      {statusModalRecipients.map((rec) => {
                        const statusLabel = rec.status === 'signed' ? 'Signed' : rec.status === 'reviewed' ? 'Reviewed' : rec.status === 'denied' ? 'Denied' : 'Pending';
                        const statusClass = rec.status === 'signed' ? 'text-emerald-600 font-medium' : rec.status === 'reviewed' ? 'text-amber-600 font-medium' : rec.status === 'denied' ? 'text-red-600 font-medium' : 'text-slate-500';
                        return (
                          <li key={rec.id} className="py-2 border-b border-slate-100 last:border-0">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-800">
                                {rec.name || rec.email || 'Signer'}{' '}
                                <span className="text-slate-400">({(rec.role || 'signer').toLowerCase()})</span>
                                {' — '}
                                <span className={statusClass}>{statusLabel}</span>
                              </span>
                              {rec.status === 'signed' ? <Check className="h-5 w-5 text-emerald-600 shrink-0" /> : rec.status === 'denied' ? <XCircle className="h-5 w-5 text-red-500 shrink-0" /> : rec.status === 'reviewed' ? <Check className="h-5 w-5 text-amber-600 shrink-0" /> : <Clock className="h-5 w-5 text-amber-500 shrink-0" />}
                            </div>
                            {rec.comment && (
                              <div className="mt-1.5 text-sm text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                                <span className="font-medium text-slate-500">Comment: </span>
                                {rec.comment}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {statusModalDoc.status === 'denied' && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mt-4">
                      <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                      <span className="font-medium text-red-800">This document was denied by a recipient.</span>
                    </div>
                  )}
                  {statusModalDoc.status === 'voided' && (
                    <div className="flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 mt-4">
                      <span className="font-medium text-slate-700">This document was voided. Signing links no longer work.</span>
                    </div>
                  )}
                  {statusModalDoc.status === 'completed' && (
                    <>
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mt-4">
                        <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span className="font-medium text-emerald-800">Done — All recipients have signed</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-4">
                        <button
                          type="button"
                          onClick={handleStatusModalDownload}
                          disabled={statusModalDownloading}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {statusModalDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                          Download signed PDF
                        </button>
                        <button type="button" onClick={handleStatusModalPreview} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                          <Eye className="h-5 w-5" />
                          Preview
                        </button>
                      </div>
                    </>
                  )}
                  {statusModalDoc.status === 'sent' && statusModalRecipients.length > 0 && (
                    <p className="text-sm text-slate-500 mt-4">Waiting for all recipients to sign.</p>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Could not load status.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EsignDocumentsPage;
