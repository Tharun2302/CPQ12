import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Loader2, PenLine, Download, Trash2, ExternalLink, ListChecks } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface EsignDocument {
  id: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
  status: 'draft' | 'sent' | 'signed' | 'completed';
}

const EsignDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<EsignDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const statusBadgeClass: Record<string, string> = {
    draft: 'bg-amber-100 text-amber-800',
    sent: 'bg-blue-100 text-blue-800',
    signed: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-violet-100 text-violet-800',
  };

  return (
    <div className="min-h-screen bg-slate-50/80 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link to="/deal" className="text-sm text-slate-500 hover:text-slate-800 mb-2 inline-block">
            ← Back to Deal
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">E-Signature Documents</h1>
          <p className="text-slate-500 mt-1 text-sm">Upload agreements and send them for signature</p>
        </div>

        {/* Upload Document card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload Document</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">Your email (for audit)</label>
              <input
                type="email"
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
              />
            </div>
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
                      <p className="text-sm text-slate-500 mt-0.5">
                        {doc.uploaded_by || 'anonymous'} • {new Date(doc.created_at).toLocaleDateString()}
                      </p>
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
                    {(doc.status === 'sent' || doc.status === 'completed') && (
                      <button
                        onClick={() => navigate(`/esign/${doc.id}/status`)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-violet-600 hover:underline"
                      >
                        <ListChecks className="h-4 w-4" />
                        View status
                      </button>
                    )}
                    {doc.status === 'sent' && (
                      <button
                        onClick={() => navigate(`/esign/${doc.id}/send`)}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-violet-600 hover:underline"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Link
                      </button>
                    )}
                    {(doc.status === 'signed' || doc.status === 'completed') && (
                      <a
                        href={`${BACKEND_URL}/api/esign/documents/${doc.id}/file?attachment=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-violet-600 hover:underline"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
                      title="Delete document"
                    >
                      {deletingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default EsignDocumentsPage;
