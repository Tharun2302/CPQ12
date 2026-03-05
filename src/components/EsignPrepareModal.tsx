import React, { useState, useRef, useCallback } from 'react';
import {
  PenLine,
  X,
  Plus,
  Loader2,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';

export interface SignatureField {
  id: string;
  type: 'signature';
  block: 'cloudfuze' | 'client';
  page: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface EsignRecipient {
  id: string;
  email: string;
  name: string;
  block: 'cloudfuze' | 'client';
}

interface EsignPrepareModalProps {
  workflow: any;
  documentPreviewUrl: string | null;
  isPreviewLoading: boolean;
  previewError: string | null;
  onClose: () => void;
  onSend: (recipients: EsignRecipient[], signatureFields: SignatureField[]) => Promise<void>;
  creatorEmail: string;
  isSending: boolean;
  sendError: string | null;
  sendSuccess: boolean;
}

const FIELD_WIDTH_PCT = 20;
const FIELD_HEIGHT_PCT = 4;

const EsignPrepareModal: React.FC<EsignPrepareModalProps> = ({
  workflow,
  documentPreviewUrl,
  isPreviewLoading,
  previewError,
  onClose,
  onSend,
  creatorEmail,
  isSending,
  sendError,
  sendSuccess,
}) => {
  const [step, setStep] = useState<'prepare' | 'send'>('prepare');
  const [recipients, setRecipients] = useState<EsignRecipient[]>(() => [
    { id: crypto.randomUUID(), email: '', name: '', block: 'cloudfuze' as const },
    { id: crypto.randomUUID(), email: '', name: workflow?.clientName || '', block: 'client' as const },
  ]);
  const [signatureFields, setSignatureFields] = useState<SignatureField[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<'toolbox' | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const documentRef = useRef<HTMLDivElement>(null);

  const addRecipient = () => {
    setRecipients(prev => [...prev, { id: crypto.randomUUID(), email: '', name: '', block: 'client' as const }]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter(r => r.id !== id));
    if (selectedRecipientId === id) setSelectedRecipientId(null);
    setSignatureFields(prev => prev.filter(f => {
      const r = recipients.find(x => x.id === id);
      return !r || f.block !== r.block;
    }));
  };

  const updateRecipient = (id: string, updates: Partial<EsignRecipient>) => {
    setRecipients(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
  };

  const handleDocumentDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragSource(null);
    if (!selectedRecipientId) return;
    const r = recipients.find(x => x.id === selectedRecipientId);
    if (!r) return;

    const rect = documentRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xPct = (x / rect.width) * 100;
    const yPct = (y / rect.height) * 100;

    setSignatureFields(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'signature',
      block: r.block,
      page: currentPage,
      xPct: Math.max(0, Math.min(100 - FIELD_WIDTH_PCT, xPct - FIELD_WIDTH_PCT / 2)),
      yPct: Math.max(0, Math.min(100 - FIELD_HEIGHT_PCT, yPct - FIELD_HEIGHT_PCT / 2)),
      widthPct: FIELD_WIDTH_PCT,
      heightPct: FIELD_HEIGHT_PCT,
    }]);
  }, [selectedRecipientId, recipients, currentPage]);

  const handleDocumentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const removeField = (id: string) => {
    setSignatureFields(prev => prev.filter(f => f.id !== id));
  };

  const handleContinue = () => {
    setStep('send');
  };

  const handleBack = () => {
    setStep('prepare');
  };

  const handleSendClick = async () => {
    await onSend(recipients, signatureFields);
  };

  const blockLabel = (b: string) => b === 'cloudfuze' ? 'CloudFuze block' : 'Client block';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-indigo-50 shrink-0">
          <div className="flex items-center gap-4">
            <PenLine className="h-6 w-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">
                {step === 'prepare' ? 'Prepare' : 'Set Up and Send'}
              </h2>
              <p className="text-xs text-gray-600 mt-0.5">
                {workflow?.documentId} • {workflow?.clientName || 'Client'}
              </p>
            </div>
            {/* Step indicator */}
            <div className="flex items-center gap-2 ml-4">
              <span className={`px-2 py-1 rounded text-xs font-medium ${step === 'prepare' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                1. Prepare
              </span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <span className={`px-2 py-1 rounded text-xs font-medium ${step === 'send' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                2. Send
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-indigo-100 text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {step === 'prepare' ? (
            <>
              {/* Left Panel - Recipients + Fields */}
              <div className="w-64 border-r border-gray-200 flex flex-col bg-gray-50 shrink-0">
                <div className="p-4 border-b border-gray-200">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recipients</p>
                  <p className="text-xs text-gray-600 mb-3">
                    Select a recipient, then drag Signature onto the document to place their field.
                  </p>
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <Plus className="h-4 w-4" />
                    Add recipient
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {recipients.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRecipientId(selectedRecipientId === r.id ? null : r.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedRecipientId === r.id
                          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-700 truncate">{r.name || 'Unnamed'}</p>
                      <p className="text-xs text-gray-500 truncate">{r.email || 'No email'}</p>
                      <p className="text-xs text-indigo-600 mt-1">{blockLabel(r.block)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {signatureFields.filter(f => f.block === r.block).length} field(s)
                      </p>
                    </div>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Fields</p>
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragSource('toolbox');
                      e.dataTransfer.setData('text/plain', 'signature');
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => setDragSource(null)}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 border-dashed cursor-grab active:cursor-grabbing ${
                      dragSource === 'toolbox' ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <PenLine className="h-5 w-5 text-indigo-600" />
                    <span className="font-medium text-gray-800">Signature</span>
                  </div>
                    <p className="text-xs text-gray-500 mt-2">
                    Drag onto document to place
                  </p>
                    <p className="text-xs text-amber-600 mt-2 font-medium">
                    Tip: Use the page arrows below to go to the signature page, then drag fields onto the document.
                  </p>
                </div>
              </div>

              {/* Center - Document */}
              <div className="flex-1 flex flex-col min-w-0 p-4">
                <div
                  ref={documentRef}
                  onDrop={handleDocumentDrop}
                  onDragOver={handleDocumentDragOver}
                  className="flex-1 relative rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-100 min-h-[400px]"
                >
                  {isPreviewLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                    </div>
                  )}
                  {previewError && (
                    <div className="absolute inset-0 flex items-center justify-center text-amber-700 bg-amber-50 p-4">
                      {previewError}
                    </div>
                  )}
                  {!isPreviewLoading && !previewError && (documentPreviewUrl || workflow?.documentId) && (
                    <>
                      <iframe
                        src={
                          workflow?.documentId
                            ? `${BACKEND_URL}/api/documents/${workflow.documentId}/file?inline=1#page=${currentPage}`
                            : (documentPreviewUrl || '')
                        }
                        title="Document"
                        className="w-full h-full border-0 min-h-[600px]"
                      />
                      {/* Drop overlay - captures drop when dragging; invisible otherwise so PDF can scroll */}
                      <div
                        className={`absolute inset-0 z-10 ${dragSource === 'toolbox' ? 'pointer-events-auto' : 'pointer-events-none'}`}
                        onDrop={handleDocumentDrop}
                        onDragOver={handleDocumentDragOver}
                        style={dragSource === 'toolbox' ? { background: 'rgba(99, 102, 241, 0.05)' } : undefined}
                        aria-hidden
                      />
                      {/* Placed fields overlay - only show fields for current page */}
                      {signatureFields
                        .filter((f) => (f.page || 1) === currentPage)
                        .map((f) => (
                          <div
                            key={f.id}
                            className="absolute z-20 flex items-center justify-center bg-sky-100 border-2 border-sky-500 rounded text-sky-800 font-medium text-sm cursor-pointer hover:bg-sky-200 group"
                            style={{
                              left: `${f.xPct}%`,
                              top: `${f.yPct}%`,
                              width: `${f.widthPct}%`,
                              height: `${f.heightPct}%`,
                              minWidth: 80,
                              minHeight: 28,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.detail === 2) removeField(f.id);
                            }}
                            title="Double-click to remove"
                          >
                            <PenLine className="h-4 w-4 mr-1" />
                            Signature
                            <span className="ml-1 text-xs opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); removeField(f.id); }}>×</span>
                          </div>
                        ))}
                    </>
                  )}
                  {!selectedRecipientId && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-amber-100 text-amber-800 text-sm rounded-lg">
                      Select a recipient first, then drag Signature onto the document
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-gray-700">Placing fields on page:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                        title="Previous page"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <span className="px-3 py-1.5 min-w-[3rem] text-center font-semibold text-gray-900 bg-gray-100 rounded-lg">
                        {currentPage}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(99, p + 1))}
                        className="p-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                        title="Next page"
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={currentPage}
                      onChange={(e) => setCurrentPage(Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 1)))}
                      className="w-14 rounded border border-gray-300 px-2 py-1 text-sm"
                      title="Jump to page"
                    />
                    <p className="text-xs text-amber-600 font-medium">Navigate to signature page, then place fields</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-600">
                      {signatureFields.length} signature field(s) placed
                    </p>
                    <button
                    type="button"
                    onClick={handleContinue}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Send step */
            <div className="flex-1 overflow-y-auto p-6">
              {sendSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-sm font-medium">
                  eSignature requests sent successfully. Recipients will receive an email with a link to sign.
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Review recipients and send. Each will receive an email with a link. When they open it, they&apos;ll see the document with the signature fields you placed.
                  </p>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium text-gray-700">Recipients</label>
                      <button type="button" onClick={() => setStep('prepare')} className="text-xs text-indigo-600 hover:underline">
                        Edit recipients
                      </button>
                    </div>
                    {recipients.some((r) => signatureFields.filter((f) => f.block === r.block).length === 0) && (
                      <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                        <strong>Note:</strong> Some recipients have no signature fields on the document. They will still be able to sign using the form below the document. To add clickable fields on the document, go back and place a Signature for each recipient.
                      </div>
                    )}
                    <div className="space-y-3">
                      {recipients.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                          <input
                            type="email"
                            value={r.email}
                            onChange={(e) => updateRecipient(r.id, { email: e.target.value })}
                            placeholder="Email"
                            className="flex-1 min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                          <input
                            type="text"
                            value={r.name}
                            onChange={(e) => updateRecipient(r.id, { name: e.target.value })}
                            placeholder="Name"
                            className="flex-1 min-w-[120px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                          />
                          <span className="text-xs text-gray-500 px-2">{blockLabel(r.block)}</span>
                          <span className={`text-xs ${signatureFields.filter(f => f.block === r.block).length === 0 ? 'text-amber-600 font-medium' : 'text-indigo-600'}`}>
                            {signatureFields.filter(f => f.block === r.block).length} field(s)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {sendError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">{sendError}</div>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-medium"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleSendClick}
                      disabled={isSending}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#10B981] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        <>
                          <PenLine className="h-4 w-4" />
                          Send for eSignature
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EsignPrepareModal;
