import { AlertTriangle, Trash2 } from 'lucide-react';
import type { DocumentLinks, SavedDocument } from '../services/documentServiceMongoDB';
import { SUPPRESS_PII } from '../analytics/privacy';

export type DocumentLinksState = 'loading' | 'error' | DocumentLinks;

interface DeleteDocumentDialogProps {
  doc: SavedDocument;
  links: DocumentLinksState;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function LinksNotice({ links }: { links: DocumentLinksState }) {
  if (links === 'loading') {
    return <p className="text-sm text-gray-500">Checking for linked approvals and e-sign agreements…</p>;
  }
  if (links === 'error') {
    return (
      <p className="text-sm text-amber-700" role="alert">
        Couldn't check whether this document is linked to an approval or e-sign agreement.
      </p>
    );
  }
  if (links.approvals === 0 && links.esign === 0) return null;
  const parts = [
    links.approvals > 0 ? plural(links.approvals, 'approval workflow') : '',
    links.esign > 0 ? plural(links.esign, 'e-sign agreement') : '',
  ].filter(Boolean);
  return (
    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800" role="alert">
      <AlertTriangle className="w-5 h-5 flex-shrink-0" />
      <span>
        This document is linked to {parts.join(' and ')}. After deleting, those will no longer be able to open it.
      </span>
    </div>
  );
}

function DeleteDocumentDialog({ doc, links, deleting, error, onCancel, onConfirm }: DeleteDocumentDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-document-title" className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <Trash2 className="w-8 h-8 text-red-600" />
          </div>
          <h2 id="delete-document-title" className="text-2xl font-bold text-gray-800">Delete Document</h2>
          <p className="text-gray-600">
            Delete the agreement for <span {...SUPPRESS_PII} className="font-semibold">{doc.company || doc.fileName}</span>? This cannot be undone.
          </p>
          <LinksNotice links={links} />
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting || links === 'loading'}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DeleteDocumentDialog;
