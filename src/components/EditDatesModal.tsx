import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, Loader2, AlertTriangle, History, X, Check } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { authAwareError, getAuthHeaders, hasUsableAuthToken } from '../utils/authUtils';
import { SUPPRESS_PII } from '../analytics/privacy';
import { applyDatesToTemplateData, changedDatesNotInFile, printedTemplateValues, type ContractDates } from '../utils/contractDateValues';
import { planTextReplacements, replaceTextInDocx, swapText, type TextReplacement } from '../utils/docxTextSwap';

interface DateHistoryEntry {
  changedAt: string;
  changedBy: string;
  oldDates: ContractDates | null;
  newDates: ContractDates;
  reason: string | null;
  reRendered: boolean;
  templateDataUpdated?: boolean;
}

interface EditContext {
  id: string;
  file_name: string;
  status: string;
  source_document_id: string | null;
  upload_source?: string | null;       // 'manual' | 'approval' | null
  dates: ContractDates | null;
  templateData: Record<string, string> | null;
  templateId: string | null;
  // The `documents` row holding the saved Word file; null when there is none
  docxDocumentId?: string | null;
  customLineItems: Array<{ name: string; description: string; price: number }>;
  dateHistory: DateHistoryEntry[];
  clientInfo: { clientName: string | null; clientEmail: string | null; company: string | null } | null;
  canRerender: boolean;
}

interface EditDatesModalProps {
  documentId: string;
  actorEmail: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Which collection the documentId belongs to. 'esign' (default) targets
   *  esign_documents by Mongo _id; 'document' targets the `documents` collection by
   *  its custom id field (used from the Approval Workflow dashboard). */
  source?: 'esign' | 'document';
  /** When false, modal opens in read-only mode: inputs disabled, Save hidden, banner
   *  explains why. Caller decides (creator OR approval admin → true, else false).
   *  The backend enforces the same rule, so this is just UX clarity. Default: true. */
  canEdit?: boolean;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Convert a Blob to a base64-encoded string (no data: prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadSavedDocx(documentId: string): Promise<Uint8Array> {
  const res = await fetch(`${BACKEND_URL}/api/documents/${encodeURIComponent(documentId)}`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(authAwareError(res.status, data.error, `Could not load the saved agreement (${res.status}). Dates not updated.`));
  }
  const base64 = data.document?.docxFileData;
  if (!base64) throw new Error('This agreement has no saved Word file, so the dates inside it cannot be changed. Dates not updated.');
  return base64ToBytes(base64);
}

function metadataOnlyMessage(context: EditContext): string {
  if (context.upload_source === 'manual') {
    return 'This document was uploaded manually rather than generated from a template, so the dates inside the PDF cannot be updated automatically. Your changes will be saved to the audit log and shown in the change history below — the file itself will keep its original content.';
  }
  return 'This document has no saved Word file with its date details (it was uploaded or generated before date-editing was enabled), so the dates inside the file cannot be changed. Your changes will be saved to the audit log and shown in the change history below — the file itself will keep its original content.';
}

// Only text really swapped in the file is stored, so the next edit searches for what is printed
function printedAfterSwap(current: Record<string, string>, applied: TextReplacement[]): Record<string, string> {
  return Object.fromEntries(Object.entries(current).map(([key, value]) => [key, swapText(String(value ?? ''), applied)]));
}

function confirmDatesNotInFile(labels: string[]): boolean {
  if (!labels.length) return true;
  return window.confirm(
    `The agreement file does not show this date, or showed it as blank or "N/A": ${labels.join(', ')}. ` +
    'The file will not change for it, but the new date will still be saved to the change history. Continue?'
  );
}

// Swaps dates inside the saved agreement instead of rebuilding from the template, which drops exhibits and redlines
async function swapDatesInSavedFile(
  context: EditContext,
  newDates: ContractDates,
  setProgress: (text: string) => void
): Promise<Record<string, unknown> | null> {
  setProgress('Loading saved agreement…');
  const savedDocx = await loadSavedDocx(context.docxDocumentId as string);
  const current = printedTemplateValues(context.templateData as Record<string, string>, context.dateHistory);
  const plan = planTextReplacements(current, applyDatesToTemplateData(current, newDates, context.dates));
  if (!plan.ok) {
    throw new Error(`The text "${plan.sharedText}" is used for more than one date in this agreement, so it cannot be changed safely. Dates not updated.`);
  }

  setProgress('Changing dates in the agreement…');
  const { docx, counts } = replaceTextInDocx(savedDocx, plan.replacements);
  const applied = plan.replacements.filter((r) => counts[r.from]);
  const swappedTexts = new Set(applied.map((r) => r.from));
  if (!confirmDatesNotInFile(changedDatesNotInFile(current, swappedTexts, context.dates, newDates))) return null;
  const templateData = printedAfterSwap(current, applied);
  if (applied.length === 0) return { templateData };

  setProgress('Converting to PDF…');
  const docxBlob = new Blob([docx as BlobPart], { type: DOCX_MIME });
  const { templateService } = await import('../utils/templateService');
  const pdfBlob = await templateService.convertDocxToPdf(docxBlob);
  return {
    templateData,
    docxFileData: await blobToBase64(docxBlob),
    docxFileName: (context.file_name || 'agreement').replace(/\.pdf$/i, '') + '.docx',
    pdfFileData: await blobToBase64(pdfBlob),
    pdfFileName: context.file_name || 'agreement.pdf',
  };
}

async function saveDates(endpointBase: string, body: Record<string, unknown>): Promise<string | undefined> {
  const res = await fetch(`${endpointBase}/dates`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(authAwareError(res.status, data.error, `Save failed (${res.status})`));
  }
  return data.message;
}

// Without a toast the modal just closes, and users can't tell the save landed
function showSavedToast(message: string) {
  try {
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 z-[60] bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  } catch { /* non-fatal */ }
}

const EditDatesModal: React.FC<EditDatesModalProps> =({ documentId, onClose, onSaved, source = 'esign', canEdit = true }) => {
  // Endpoint base depends on which collection holds the document. Both endpoints
  // expose the same shape; only the lookup key differs (Mongo _id vs custom id).
  const endpointBase = source === 'document'
    ? `${BACKEND_URL}/api/documents/${documentId}`
    : `${BACKEND_URL}/api/esign/documents/${documentId}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<EditContext | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  // History is auto-expanded for read-only viewers (it's the main thing they came for);
  // collapsed by default for editors so the date inputs stay visually prominent.
  const [showHistory, setShowHistory] = useState(!canEdit);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const fetchContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${endpointBase}/edit-context`, { headers: getAuthHeaders() });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Server returned HTML (Express default 404) instead of JSON — the
        // /edit-context route is missing on the running backend.
        throw new Error(
          res.status === 404
            ? 'Edit Dates endpoint not found on the backend. Please restart the backend server (node server.cjs) so the new route is loaded.'
            : `Unexpected response from server (status ${res.status}). Please restart the backend server and try again.`
        );
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(authAwareError(res.status, data.error, `Failed to load (${res.status})`));
      }
      const ctx: EditContext = data.context;
      setContext(ctx);
      setStartDate(ctx.dates?.projectStartDate || '');
      setEffectiveDate(ctx.dates?.effectiveDate || '');
      setExpiryDate(ctx.dates?.quoteExpiryDate || '');
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Failed to load edit context');
    } finally {
      setLoading(false);
    }
  }, [endpointBase]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const isSigned = context && ['signed', 'completed'].includes((context.status || '').toLowerCase());
  const canRerender = !!context?.canRerender;

  const handleSave = async () => {
    if (!context) return;
    if (!startDate && !effectiveDate && !expiryDate) {
      alert('Please set at least one date before saving.');
      return;
    }
    // Checked before the slow re-render so an expired login doesn't waste it
    if (!hasUsableAuthToken()) {
      setError(authAwareError(401, undefined, ''));
      return;
    }
    if (isSigned) {
      const ok = window.confirm(
        'This document has already been signed. Updating dates will overwrite the stored file but will NOT reset existing signatures. Continue?'
      );
      if (!ok) return;
    }

    setSaving(true);
    setError(null);
    try {
      const newDates: ContractDates = {
        projectStartDate: startDate || null,
        effectiveDate: effectiveDate || null,
        quoteExpiryDate: expiryDate || null,
      };
      const patchBody: Record<string, unknown> = { dates: newDates, reason: reason.trim() || null };

      if (canRerender && context.templateData && context.docxDocumentId) {
        const fileFields = await swapDatesInSavedFile(context, newDates, setProgress);
        if (!fileFields) return;
        Object.assign(patchBody, fileFields);
      } else if (!window.confirm(`${metadataOnlyMessage(context)}\n\nContinue?`)) {
        return;
      }

      setProgress('Saving…');
      const message = await saveDates(endpointBase, patchBody);
      setProgress('Done');
      showSavedToast(message || 'Dates saved.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Failed to save');
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <Calendar className="h-5 w-5" />
            <h2 className="text-xl font-bold">{canEdit ? 'Edit Document Dates' : 'Document Dates'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            </div>
          ) : error && !context ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>
          ) : context ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 truncate" title={context.file_name}>
                <span {...SUPPRESS_PII} className="font-medium text-slate-800">{context.file_name}</span>
                <span className="ml-2 inline-block px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                  {context.status}
                </span>
              </p>

              {!canEdit && (
                <div className="flex gap-2 items-start text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-slate-500" />
                  <div>
                    <span className="font-medium">Read only.</span> You can view the dates and the log of past
                    changes, but you cannot modify anything. Only the document creator or an approval admin
                    can edit dates.
                  </div>
                </div>
              )}

              {canEdit && isSigned && (
                <div className="flex gap-2 items-start text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    This document has already been signed. Existing signatures will be preserved,
                    but the file content (dates) will be updated.
                  </div>
                </div>
              )}

              {canEdit && !canRerender && (
                <div className="flex gap-2 items-start text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>{metadataOnlyMessage(context)}</div>
                </div>
              )}

              <div className="space-y-3">
                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">Project Start Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">Effective Date</span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </label>

                <label className="block">
                  <span className="block text-sm font-medium text-slate-700 mb-1">Quote Expiry Date</span>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  />
                </label>

                {canEdit && (
                  <label className="block">
                    <span className="block text-sm font-medium text-slate-700 mb-1">
                      Reason for change <span className="font-normal text-slate-500">(optional)</span>
                    </span>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Approval took longer than expected"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                )}
              </div>

              <div className="border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  <History className="h-4 w-4" />
                  {showHistory ? 'Hide' : 'View'} change history ({context.dateHistory?.length || 0})
                </button>
                {showHistory && (
                  context.dateHistory && context.dateHistory.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-xs">
                      {/* Show newest first so the most recent change is at the top. */}
                      {[...context.dateHistory].reverse().map((h, idx) => (
                        <li key={idx} className="border border-slate-200 rounded-md p-3 bg-slate-50">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="text-slate-700">
                              <span className="font-semibold text-slate-900">{h.changedBy}</span>
                              <span className="text-slate-500"> · {new Date(h.changedAt).toLocaleString()}</span>
                            </div>
                            {h.reRendered ? (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                file re-rendered
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                metadata only
                              </span>
                            )}
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
                            <div className="text-slate-500 font-medium">Field</div>
                            <div className="text-slate-500 font-medium">Was</div>
                            <div className="text-slate-500 font-medium">Now</div>

                            <div>Start</div>
                            <div className="text-slate-600">{h.oldDates?.projectStartDate || '—'}</div>
                            <div className={h.oldDates?.projectStartDate !== h.newDates?.projectStartDate ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                              {h.newDates?.projectStartDate || '—'}
                            </div>

                            <div>Effective</div>
                            <div className="text-slate-600">{h.oldDates?.effectiveDate || '—'}</div>
                            <div className={h.oldDates?.effectiveDate !== h.newDates?.effectiveDate ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                              {h.newDates?.effectiveDate || '—'}
                            </div>

                            <div>Expiry</div>
                            <div className="text-slate-600">{h.oldDates?.quoteExpiryDate || '—'}</div>
                            <div className={h.oldDates?.quoteExpiryDate !== h.newDates?.quoteExpiryDate ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                              {h.newDates?.quoteExpiryDate || '—'}
                            </div>
                          </div>
                          {h.reason && (
                            <div className="mt-2 text-slate-600 italic">"{h.reason}"</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500 italic">No date changes recorded yet.</p>
                  )
                )}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                  {error}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-6 py-3 flex items-center justify-end gap-2 bg-slate-50">
          {saving && progress && (
            <span className="mr-auto text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-50"
          >
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !context}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save{canRerender ? ' & Update File' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditDatesModal;
