import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Loader2, FileCheck } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

const EsignSignedPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const [doc, setDoc] = useState<{ file_name: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`);
        const data = await res.json();
        if (data.success) setDoc(data.document);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Document not found</p>
      </div>
    );
  }

  const downloadUrl = `${BACKEND_URL}/api/esign/documents/${documentId}/file`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
          <FileCheck className="h-8 w-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Signed Document Ready</h2>
        <p className="text-slate-600 mb-6">{doc.file_name}</p>
        <a
          href={downloadUrl}
          download={doc.file_name}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
        >
          <Download className="h-5 w-5" />
          Download Signed PDF
        </a>
      </div>
    </div>
  );
};

export default EsignSignedPage;
