import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, Loader2, AlertTriangle, History, X, Check } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface DateHistoryEntry {
  changedAt: string;
  changedBy: string;
  oldDates: ContractDates | null;
  newDates: ContractDates;
  reason: string | null;
  reRendered: boolean;
}

interface ContractDates {
  projectStartDate: string | null;
  effectiveDate: string | null;
  quoteExpiryDate: string | null;
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

/** Format an ISO date string (YYYY-MM-DD) as "27th of June, 2026" — mirrors
 *  formatDateLongOrdinal in QuoteGenerator. The two impls must stay in sync. */
function formatDateLongOrdinal(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = dateString.includes('-') ? new Date(dateString + 'T00:00:00') : new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const day = date.getDate();
    const suffix = day >= 11 && day <= 13 ? 'th' : day % 10 === 1 ? 'st' : day % 10 === 2 ? 'nd' : day % 10 === 3 ? 'rd' : 'th';
    const month = date.toLocaleString('en-US', { month: 'long' });
    return `${day}${suffix} of ${month}, ${date.getFullYear()}`;
  } catch {
    return '';
  }
}

/** Format an ISO date string (YYYY-MM-DD) as "MM/DD/YYYY" — matches
 *  DocxTemplateProcessor.formatDateMMDDYYYY which most start/end date tokens use. */
function formatDateMMDDYYYY(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = dateString.includes('-') ? new Date(dateString + 'T00:00:00') : new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${date.getFullYear()}`;
  } catch {
    return '';
  }
}

/** Apply new dates to a templateData snapshot by overwriting every known date token.
 *  Returns a new object; does not mutate the input. End date is shifted by the same
 *  delta the start date moved by, preserving the original service term length. */
function applyDatesToTemplateData(
  snapshot: Record<string, string>,
  newDates: ContractDates,
  oldDates: ContractDates | null
): Record<string, string> {
  const out: Record<string, string> = { ...snapshot };

  const newStart = newDates.projectStartDate || '';
  const newEffective = newDates.effectiveDate || '';
  const newExpiry = newDates.quoteExpiryDate || '';

  // Derive new service_end_date by shifting old end by (new start - old start) so
  // the contract term length stays the same. Falls back to snapshot value when
  // we can't compute the delta.
  let newServiceEnd = out['{{service_end_date}}'] || out['{{end_date}}'] || '';
  if (newStart && oldDates?.projectStartDate) {
    try {
      const oldStartDate = new Date(oldDates.projectStartDate + 'T00:00:00');
      const newStartDate = new Date(newStart + 'T00:00:00');
      // Find any existing end date to shift.
      const existingEnd = out['{{service_end_date}}'] || out['{{end_date}}'] || '';
      if (existingEnd && existingEnd !== 'N/A') {
        // existingEnd is in MM/DD/YYYY; parse it.
        const parts = existingEnd.split('/');
        if (parts.length === 3) {
          const existingEndDate = new Date(Number(parts[2]), Number(parts[0]) - 1, Number(parts[1]));
          if (!isNaN(existingEndDate.getTime()) && !isNaN(oldStartDate.getTime()) && !isNaN(newStartDate.getTime())) {
            const deltaMs = newStartDate.getTime() - oldStartDate.getTime();
            const newEndDate = new Date(existingEndDate.getTime() + deltaMs);
            const mm = String(newEndDate.getMonth() + 1).padStart(2, '0');
            const dd = String(newEndDate.getDate()).padStart(2, '0');
            newServiceEnd = `${mm}/${dd}/${newEndDate.getFullYear()}`;
          }
        }
      }
    } catch {
      /* leave newServiceEnd as-is */
    }
  }

  // Effective date variations
  if (newEffective) {
    const effectiveFmt = formatDateMMDDYYYY(newEffective);
    out['{{Effective Date}}'] = effectiveFmt;
    out['{{effective_date}}'] = effectiveFmt;
    out['{{effectiveDate}}'] = effectiveFmt;
    out['{{Date}}'] = effectiveFmt;
    out['{{date}}'] = effectiveFmt;
    out['{{current_date}}'] = effectiveFmt;
    out['{{today}}'] = effectiveFmt;
  }

  // Project start date variations
  if (newStart) {
    const startFmt = formatDateMMDDYYYY(newStart);
    out['{{Start_date}}'] = startFmt;
    out['{{start_date}}'] = startFmt;
    out['{{startdate}}'] = startFmt;
    out['{{project_start_date}}'] = startFmt;
    out['{{project_start}}'] = startFmt;
    out['{{service_start_date}}'] = startFmt;
  }

  // Service end date — derived from shift above (only if computed)
  if (newServiceEnd) {
    out['{{service_end_date}}'] = newServiceEnd;
    out['{{End_date}}'] = newServiceEnd;
    out['{{end_date}}'] = newServiceEnd;
    out['{{enddate}}'] = newServiceEnd;
    out['{{project_end_date}}'] = newServiceEnd;
    out['{{project_end}}'] = newServiceEnd;
    out['{{End date}}'] = newServiceEnd;
    out['{{end date}}'] = newServiceEnd;
  }

  // Quote expiry — long ordinal format
  if (newExpiry) {
    const expiryLong = formatDateLongOrdinal(newExpiry);
    out['{{quote_expiry_date_long}}'] = expiryLong;
    out['{{quoteExpiryDateLong}}'] = expiryLong;
    out['{{expiry_date_long}}'] = expiryLong;
    out['{{quote_validity_line}}'] = expiryLong ? `This quote is valid till ${expiryLong}` : '';
  }

  return out;
}

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

const EditDatesModal: React.FC<EditDatesModalProps> = ({ documentId, actorEmail, onClose, onSaved, source = 'esign', canEdit = true }) => {
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
      const res = await fetch(`${endpointBase}/edit-context`);
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
        throw new Error(data.error || `Failed to load (${res.status})`);
      }
      const ctx: EditContext = data.context;
      setContext(ctx);
      setStartDate(ctx.dates?.projectStartDate || '');
      setEffectiveDate(ctx.dates?.effectiveDate || '');
      setExpiryDate(ctx.dates?.quoteExpiryDate || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to load edit context');
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

      let pdfFileData: string | null = null;
      let pdfFileName: string | null = null;
      let docxFileData: string | null = null;
      let docxFileName: string | null = null;

      // If we have a templateData snapshot + templateId, re-render the document
      // client-side so the new dates appear inside the actual file.
      if (canRerender && context.templateData && context.templateId) {
        setProgress('Fetching template…');
        const tmplResp = await fetch(`${BACKEND_URL}/api/templates/${context.templateId}/file`);
        if (!tmplResp.ok) {
          throw new Error(`Could not fetch original template (${tmplResp.status}). Dates not updated.`);
        }
        const tmplBlob = await tmplResp.blob();
        const tmplFile = new File([tmplBlob], 'template.docx', {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        setProgress('Re-rendering document…');
        const updatedTemplateData = applyDatesToTemplateData(context.templateData, newDates, context.dates);
        const { DocxTemplateProcessor } = await import('../utils/docxTemplateProcessor');
        const result = await DocxTemplateProcessor.processDocxTemplate(
          tmplFile,
          updatedTemplateData,
          {
            customLineItems: (context.customLineItems || []).map((it) => ({
              name: it.name,
              description: it.description,
              price: `$${Number(it.price).toFixed(2)}`,
            })),
          }
        );
        if (!result.success || !result.processedDocx) {
          throw new Error(result.error || 'Failed to re-render document with new dates');
        }
        const newDocxBlob = result.processedDocx;
        docxFileData = await blobToBase64(newDocxBlob);
        docxFileName = (context.file_name || 'agreement').replace(/\.pdf$/i, '') + '.docx';

        setProgress('Converting to PDF…');
        const { templateService } = await import('../utils/templateService');
        const newPdfBlob = await templateService.convertDocxToPdf(newDocxBlob);
        pdfFileData = await blobToBase64(newPdfBlob);
        pdfFileName = context.file_name || 'agreement.pdf';
      } else {
        // No re-render snapshot available — manual upload, or doc generated before this
        // feature shipped. Update dates + audit log only; file content stays as-is.
        const isManual = context.upload_source === 'manual';
        const ok = window.confirm(
          (isManual
            ? 'This document was uploaded manually, so the dates inside the PDF cannot be updated automatically. '
            : 'This document was generated before date-editing was supported, so the dates inside the file cannot be updated automatically. ') +
            'Your changes will be saved to the audit log and shown in the change history. The PDF/DOCX itself will keep its original content. Continue?'
        );
        if (!ok) {
          setSaving(false);
          setProgress('');
          return;
        }
      }

      setProgress('Saving…');
      const patchBody: any = {
        dates: newDates,
        reason: reason.trim() || null,
        actorEmail,
      };
      if (pdfFileData) patchBody.pdfFileData = pdfFileData;
      if (pdfFileName) patchBody.pdfFileName = pdfFileName;
      if (docxFileData) patchBody.docxFileData = docxFileData;
      if (docxFileName) patchBody.docxFileName = docxFileName;

      const patchResp = await fetch(`${endpointBase}/dates`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      const patchData = await patchResp.json();
      if (!patchResp.ok || !patchData.success) {
        throw new Error(patchData.error || `Save failed (${patchResp.status})`);
      }

      setProgress('Done');

      // Visible success toast so users know the save landed — without this, the modal
      // just closes silently and they can't tell whether anything happened (especially
      // important for legacy docs where the file content itself doesn't change).
      try {
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 z-[60] bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm';
        toast.textContent = patchData.message || 'Dates saved.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      } catch { /* non-fatal */ }

      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
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
                <span className="font-medium text-slate-800">{context.file_name}</span>
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
                  <div>
                    {context.upload_source === 'manual'
                      ? 'This document was uploaded manually rather than generated from a template, so the dates inside the PDF cannot be updated automatically. Your changes will be saved to the audit log and shown in the change history below — the file itself will keep its original content.'
                      : 'This document was generated before date-editing was enabled, so the dates inside the file cannot be re-rendered. Your changes will be saved to the audit log and shown in the change history below — the file itself will keep its original content.'}
                  </div>
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
              Save{canRerender ? ' & Re-render' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditDatesModal;
