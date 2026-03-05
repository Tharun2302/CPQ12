import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Rnd } from 'react-rnd';
import { PenLine, Loader2, ArrowRight, Type, Briefcase, Calendar, UserPlus, Trash2 } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import EsignPdfPageView, { FieldCoords } from '../components/EsignPdfPageView';

const PDF_SCALE = 1.5;
/** Minimum field size in pixels (used by Rnd and for persistence) */
const MIN_FIELD_WIDTH_PX = 120;
const MIN_FIELD_HEIGHT_PX = 40;

export type FieldType = 'signature' | 'name' | 'title' | 'date';

export interface EsignRecipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
}

interface PlacedField {
  id: string;
  type: FieldType;
  page: number;
  recipient_id?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
}

const FIELD_DEFS: { type: FieldType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'signature', label: 'Signature', Icon: PenLine },
  { type: 'name', label: 'Name', Icon: Type },
  { type: 'title', label: 'Title', Icon: Briefcase },
  { type: 'date', label: 'Date', Icon: Calendar },
];

/** Per-recipient colors for field overlays and recipient list. Use full class names so Tailwind includes them. */
const RECIPIENT_COLORS = [
  { box: 'bg-sky-100 border-2 border-sky-500 text-sky-800 hover:bg-sky-200', dot: 'bg-sky-500' },
  { box: 'bg-emerald-100 border-2 border-emerald-500 text-emerald-800 hover:bg-emerald-200', dot: 'bg-emerald-500' },
  { box: 'bg-amber-100 border-2 border-amber-500 text-amber-800 hover:bg-amber-200', dot: 'bg-amber-500' },
  { box: 'bg-violet-100 border-2 border-violet-500 text-violet-800 hover:bg-violet-200', dot: 'bg-violet-500' },
  { box: 'bg-rose-100 border-2 border-rose-500 text-rose-800 hover:bg-rose-200', dot: 'bg-rose-500' },
  { box: 'bg-cyan-100 border-2 border-cyan-500 text-cyan-800 hover:bg-cyan-200', dot: 'bg-cyan-500' },
];
const UNASSIGNED_COLOR = { box: 'bg-slate-100 border-2 border-slate-400 text-slate-700 hover:bg-slate-200', dot: 'bg-slate-400' };

function getRecipientColor(
  recipientId: string | null | undefined,
  recipients: EsignRecipient[]
): { box: string; dot: string } {
  if (!recipientId || !recipients.length) return UNASSIGNED_COLOR;
  const idx = recipients.findIndex((r) => r.id === recipientId);
  if (idx < 0) return UNASSIGNED_COLOR;
  return RECIPIENT_COLORS[idx % RECIPIENT_COLORS.length] ?? UNASSIGNED_COLOR;
}

const EsignPlaceFieldsPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<{ file_name: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signatureFields, setSignatureFields] = useState<PlacedField[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [dragSource, setDragSource] = useState<FieldType | null>(null);
  const [recipients, setRecipients] = useState<EsignRecipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState({ name: '', email: '' });
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [addingRecipient, setAddingRecipient] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fileUrl = doc ? `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1` : '';

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}`);
        const data = await res.json();
        if (data.success) {
          setDoc(data.document);
        } else {
          navigate('/esign');
        }
      } catch {
        navigate('/esign');
      } finally {
        setLoading(false);
      }
    })();
  }, [documentId, navigate]);

  useEffect(() => {
    if (!documentId) return;
    (async () => {
      const [fieldsRes, recipientsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/signature-fields/${documentId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`),
      ]);
      const fieldsData = await fieldsRes.json();
      const recipientsData = await recipientsRes.json();
      if (recipientsData.success && recipientsData.recipients?.length) {
        setRecipients(recipientsData.recipients);
        setSelectedRecipientId(recipientsData.recipients[0]?.id || null);
      }
      if (fieldsData.success && fieldsData.fields?.length) {
        setSignatureFields(
          fieldsData.fields.map((f: any) => {
            const page = f.page || 1;
            const id = f._id?.toString() || crypto.randomUUID();
            const recipient_id = f.recipient_id?.toString() || null;
            if (f.x != null && f.y != null) {
              return {
                id,
                type: (f.type || 'signature') as FieldType,
                page,
                recipient_id,
                x: Number(f.x),
                y: Number(f.y),
                width: Number(f.width) || 120,
                height: Number(f.height) || 40,
              };
            }
            return {
              id,
              type: (f.type || 'signature') as FieldType,
              page,
              recipient_id,
              xPct: f.xPct ?? 10,
              yPct: f.yPct ?? 80,
              widthPct: f.widthPct ?? 20,
              heightPct: f.heightPct ?? 4,
            };
          })
        );
      }
    })();
  }, [documentId]);

  const saveRecipientsAndSet = useCallback(async (list: EsignRecipient[], selectLast?: boolean) => {
    if (!documentId) return { success: false };
    setRecipientError(null);
    let data: { success?: boolean; recipients?: EsignRecipient[]; error?: string } = { success: false };
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: list.map((r) => ({ name: r.name, email: r.email, role: r.role || 'signer' })) }),
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        const msg = res.ok ? 'Server returned invalid JSON' : `Request failed (${res.status}). Check that the backend is running at ${BACKEND_URL}.`;
        setRecipientError(msg);
        return { success: false };
      }
      if (!res.ok) {
        setRecipientError(data.error || `Request failed (${res.status})`);
        return { success: false };
      }
      if (data.success && Array.isArray(data.recipients)) {
        setRecipients(data.recipients);
        if (data.recipients.length > 0) {
          if (selectLast) setSelectedRecipientId(data.recipients[data.recipients.length - 1]?.id || null);
          else setSelectedRecipientId((prev) => (data.recipients!.some((r: EsignRecipient) => r.id === prev) ? prev : data.recipients![0]?.id || null));
        }
        return { success: true };
      }
      setRecipientError(data.error || 'Failed to save recipients');
      return { success: false };
    } catch (err: any) {
      const msg = err?.message?.includes('fetch') || err?.message?.includes('Network')
        ? `Cannot reach server. Is it running at ${BACKEND_URL}?`
        : (err?.message || 'Failed to save recipients');
      setRecipientError(msg);
      return { success: false };
    }
  }, [documentId]);

  const addRecipient = async () => {
    const name = newRecipient.name.trim();
    const email = newRecipient.email.trim();
    if (!email) {
      setRecipientError('Email is required');
      return;
    }
    setRecipientError(null);
    setAddingRecipient(true);
    const optimistic: EsignRecipient = {
      id: `temp-${Date.now()}`,
      name: name || email,
      email,
      role: 'signer',
    };
    setRecipients((prev) => [...prev, optimistic]);
    setSelectedRecipientId(optimistic.id);
    setNewRecipient({ name: '', email: '' });
    const listToSave = [...recipients, { id: '', name: name || email, email, role: 'signer' as const }];
    const result = await saveRecipientsAndSet(listToSave, true);
    setAddingRecipient(false);
    if (!result.success) {
      setRecipients((prev) => prev.filter((r) => r.id !== optimistic.id));
      setSelectedRecipientId(recipients[0]?.id || null);
      setNewRecipient({ name: name || '', email });
    }
  };

  const removeRecipient = async (id: string) => {
    const newList = recipients.filter((r) => r.id !== id);
    setSignatureFields((prev) => prev.map((f) => (f.recipient_id === id ? { ...f, recipient_id: null } : f)));
    if (newList.length) await saveRecipientsAndSet(newList);
    else if (documentId) {
      await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/recipients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: [] }),
      });
      setRecipients([]);
      setSelectedRecipientId(null);
    }
  };

  const handleFieldDrop = useCallback(
    (coords: FieldCoords & { fieldType: string }) => {
      setDragSource(null);
      setSignatureFields((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: coords.fieldType as FieldType,
          page: coords.page,
          recipient_id: selectedRecipientId || undefined,
          x: coords.x,
          y: coords.y,
          width: coords.width,
          height: coords.height,
        },
      ]);
    },
    [selectedRecipientId]
  );

  const removeField = (id: string) => {
    setSignatureFields((prev) => prev.filter((f) => f.id !== id));
  };

  /** Persist fields to backend (pass updated list after drag/resize so size and position are saved). */
  const saveFieldsToBackend = useCallback(async (fieldsToSave: PlacedField[]) => {
    if (!documentId || !fieldsToSave.length) return;
    const payload = fieldsToSave.map((f) => {
      const base = { page: f.page, type: f.type, recipient_id: f.recipient_id || null };
      if (f.x != null && f.y != null) {
        return { ...base, x: f.x, y: f.y, width: Math.max(MIN_FIELD_WIDTH_PX / PDF_SCALE, f.width ?? 120), height: Math.max(MIN_FIELD_HEIGHT_PX / PDF_SCALE, f.height ?? 40) };
      }
      return { ...base, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
    });
    try {
      await fetch(`${BACKEND_URL}/api/esign/signature-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, fields: payload }),
      });
    } catch (err) {
      console.warn('Failed to auto-save field positions:', err);
    }
  }, [documentId]);

  const handleSaveFields = async () => {
    if (!documentId) return;
    setSaving(true);
    try {
      const fields = signatureFields.map((f) => {
        const base = { page: f.page, type: f.type, recipient_id: f.recipient_id || null };
        if (f.x != null && f.y != null) {
          return { ...base, x: f.x, y: f.y, width: f.width ?? 120, height: f.height ?? 40 };
        }
        return { ...base, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
      });
      const res = await fetch(`${BACKEND_URL}/api/esign/signature-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, fields }),
      });
      const data = await res.json();
      if (data.success) {
        navigate(`/esign/${documentId}/send`);
      }
    } finally {
      setSaving(false);
    }
  };

  const getFieldLabel = (type: FieldType) => FIELD_DEFS.find((d) => d.type === type)?.label ?? type;

  if (loading || !doc) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Place Fields</h1>
            <p className="text-slate-600 mt-1">Drag signature, name, title, and date fields onto the document</p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="text-slate-600 hover:text-slate-900 font-medium"
          >
            ← Back
          </button>
        </div>

        <div className="flex gap-6">
          <div className="w-64 shrink-0 bg-slate-200/60 rounded-xl border border-slate-200 p-4 space-y-5">
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-0.5">Recipients ({recipients.length})</p>
              <p className="text-xs text-slate-500 mb-2">Add signers and assign fields to them</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {recipients.map((r) => {
                  const isSelected = selectedRecipientId === r.id;
                  const recipientColor = getRecipientColor(r.id, recipients);
                  return (
                    <div
                      key={r.id}
                      className={`rounded-lg overflow-hidden border-2 ${isSelected ? `${recipientColor.box} ring-1 ring-offset-1` : 'border-slate-300 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-1 p-2.5">
                        <div className="min-w-0 flex-1 flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${recipientColor.dot}`} title="Field color for this signer" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 text-sm truncate">{r.name || r.email}</p>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{r.email || ''}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeRecipient(r.id)} className="p-0.5 text-slate-400 hover:text-red-600 shrink-0" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200">
                <input type="text" value={newRecipient.name} onChange={(e) => { setNewRecipient((p) => ({ ...p, name: e.target.value })); setRecipientError(null); }} placeholder="Name" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs mb-1.5" />
                <input type="email" value={newRecipient.email} onChange={(e) => { setNewRecipient((p) => ({ ...p, email: e.target.value })); setRecipientError(null); }} placeholder="Email" className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs" />
                {recipientError && <p className="text-xs text-red-600 mt-1">{recipientError}</p>}
                <button type="button" onClick={addRecipient} disabled={addingRecipient || !newRecipient.email.trim()} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  {addingRecipient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add recipient
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-3">Place fields for:</p>
              <select value={selectedRecipientId || ''} onChange={(e) => setSelectedRecipientId(e.target.value || null)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <option value="">— None —</option>
                {recipients.map((r) => (<option key={r.id} value={r.id}>{r.name || r.email}</option>))}
              </select>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">Drag onto the document to place</p>
              <div className="space-y-2">
                {FIELD_DEFS.map(({ type, label, Icon }) => (
                  <div
                    key={type}
                    draggable
                    onDragStart={(e) => {
                      setDragSource(type);
                      e.dataTransfer.setData('text/plain', type);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onDragEnd={() => setDragSource(null)}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-grab active:cursor-grabbing transition-colors ${
                      dragSource === type
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 text-indigo-600 shrink-0" />
                    <span className="font-medium text-slate-800 text-sm">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Scroll to the page you want, then drag fields onto the document
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div
              ref={scrollContainerRef}
              className="rounded-xl border-2 border-dashed border-slate-200 overflow-y-auto overflow-x-hidden bg-slate-100 min-h-[500px] max-h-[75vh]"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  data-page={pageNum}
                  className="flex flex-col items-center py-4 first:pt-4 last:pb-4"
                >
                  <span className="text-xs font-medium text-slate-500 mb-2">Page {pageNum} of {totalPages}</span>
                  <div
                    className={`rounded-lg overflow-hidden shadow-sm ${dragSource ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                  >
                    <EsignPdfPageView
                      pdfUrl={fileUrl}
                      pageNumber={pageNum}
                      scale={PDF_SCALE}
                      onPdfInfo={pageNum === 1 ? (info) => setTotalPages(info.numPages) : undefined}
                      onDrop={handleFieldDrop}
                      className=""
                    >
                      {signatureFields
                        .filter((f) => (f.page || 1) === pageNum)
                        .map((f) => {
                          const isPointBased = f.x != null && f.y != null;
                          const widthPt = f.width ?? 120;
                          const heightPt = f.height ?? 40;
                          const color = getRecipientColor(f.recipient_id, recipients);
                          const minWidthPt = MIN_FIELD_WIDTH_PX / PDF_SCALE;
                          const minHeightPt = MIN_FIELD_HEIGHT_PX / PDF_SCALE;

                          if (isPointBased) {
                            return (
                              <Rnd
                                key={f.id}
                                position={{ x: f.x * PDF_SCALE, y: f.y * PDF_SCALE }}
                                size={{ width: Math.max(MIN_FIELD_WIDTH_PX, widthPt * PDF_SCALE), height: Math.max(MIN_FIELD_HEIGHT_PX, heightPt * PDF_SCALE) }}
                                minWidth={MIN_FIELD_WIDTH_PX}
                                minHeight={MIN_FIELD_HEIGHT_PX}
                                onDragStop={(_e, d) => {
                                  const xPt = d.x / PDF_SCALE;
                                  const yPt = d.y / PDF_SCALE;
                                  const next = signatureFields.map((field) =>
                                    field.id === f.id ? { ...field, x: xPt, y: yPt, width: field.width ?? 120, height: field.height ?? 40 } : field
                                  );
                                  setSignatureFields(next);
                                  saveFieldsToBackend(next);
                                }}
                                onResizeStop={(_e, _dir, ref, _delta, position) => {
                                  const xPt = position.x / PDF_SCALE;
                                  const yPt = position.y / PDF_SCALE;
                                  const wPt = Math.max(minWidthPt, ref.offsetWidth / PDF_SCALE);
                                  const hPt = Math.max(minHeightPt, ref.offsetHeight / PDF_SCALE);
                                  const next = signatureFields.map((field) =>
                                    field.id === f.id ? { ...field, x: xPt, y: yPt, width: wPt, height: hPt } : field
                                  );
                                  setSignatureFields(next);
                                  saveFieldsToBackend(next);
                                }}
                                enableResizing={{ bottom: true, right: true, bottomRight: true }}
                                dragGrid={[1, 1]}
                                resizeGrid={[1, 1]}
                                className={`flex items-center justify-center rounded font-medium text-sm cursor-move group ${color.box}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.detail === 2) removeField(f.id);
                                }}
                                title={`${getFieldLabel(f.type)}${f.recipient_id ? ` • ${recipients.find((r) => r.id === f.recipient_id)?.name || ''}` : ''} (double-click to remove)`}
                              >
                                {getFieldLabel(f.type)}
                                <span
                                  className="ml-1 text-xs opacity-0 group-hover:opacity-100"
                                  onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                                >
                                  ×
                                </span>
                              </Rnd>
                            );
                          }

                          return (
                            <div
                              key={f.id}
                              className={`absolute flex items-center justify-center rounded font-medium text-sm cursor-pointer group ${color.box}`}
                              style={{
                                left: `${f.xPct ?? 10}%`,
                                top: `${f.yPct ?? 80}%`,
                                width: `${f.widthPct ?? 20}%`,
                                height: `${f.heightPct ?? 4}%`,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (e.detail === 2) removeField(f.id);
                              }}
                              title={`${getFieldLabel(f.type)}${f.recipient_id ? ` • ${recipients.find((r) => r.id === f.recipient_id)?.name || ''}` : ''} (double-click to remove)`}
                            >
                              {getFieldLabel(f.type)}
                              <span
                                className="ml-1 text-xs opacity-0 group-hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                              >
                                ×
                              </span>
                            </div>
                          );
                        })}
                    </EsignPdfPageView>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Go to page</span>
                <input
                  id="goto-page"
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={1}
                  className="w-12 rounded border border-slate-300 px-2 py-1.5 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const n = Math.max(1, Math.min(totalPages, parseInt((e.target as HTMLInputElement).value, 10) || 1));
                      scrollContainerRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('goto-page') as HTMLInputElement;
                    const n = input ? Math.max(1, Math.min(totalPages, parseInt(input.value, 10) || 1)) : 1;
                    scrollContainerRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Go
                </button>
                <span className="text-sm text-slate-500">1–{totalPages}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">{signatureFields.length} field(s)</span>
                <button
                  onClick={handleSaveFields}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignPlaceFieldsPage;
