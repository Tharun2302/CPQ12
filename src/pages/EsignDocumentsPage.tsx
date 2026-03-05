import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Loader2, PenLine, Download, Trash2 } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface EsignDocument {
  id: string;
  file_name: string;
  uploaded_by: string;
  created_at: string;
  status: 'draft' | 'sent' | 'signed';
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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/deal" className="text-sm text-slate-600 hover:text-slate-900 mb-2 inline-block">
              ← Back to Deal
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">E-Signature Documents</h1>
            <p className="text-slate-600 mt-1">Upload agreements and send them for signature</p>
          </div>
        </div>

        {/* Upload section */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Upload Document</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-1">Your email (for audit)</label>
              <input
                type="email"
                value={uploadedBy}
                onChange={(e) => setUploadedBy(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium cursor-pointer hover:bg-indigo-700 disabled:opacity-50">
              <Upload className="h-5 w-5" />
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
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

        {/* Document list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <h2 className="text-lg font-semibold text-slate-800 p-4 border-b border-slate-200">Your Documents</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
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
                  className="flex items-center justify-between p-4 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-10 w-10 text-indigo-600" />
                    <div>
                      <p className="font-medium text-slate-900">{doc.file_name}</p>
                      <p className="text-sm text-slate-500">
                        {doc.uploaded_by} • {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        doc.status === 'signed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : doc.status === 'sent'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {doc.status}
                    </span>
                    {doc.status === 'draft' && (
                      <button
                        onClick={() => navigate(`/esign/${doc.id}/place-fields`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      >
                        <PenLine className="h-4 w-4" />
                        Place Fields
                      </button>
                    )}
                    {doc.status === 'sent' && (
                      <button
                        onClick={() => navigate(`/esign/${doc.id}/send`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        View Link
                      </button>
                    )}
                    {doc.status === 'signed' && (
                      <a
                        href={`${BACKEND_URL}/api/esign/documents/${doc.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
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
