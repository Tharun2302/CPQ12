import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { PenLine, Loader2, Check, Type, ImagePlus } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import EsignPdfPageView from '../components/EsignPdfPageView';

const PDF_SCALE = 1.5;

type FieldType = 'signature' | 'name' | 'title' | 'date';

interface SignatureField {
  _id?: string;
  page: number;
  type: FieldType;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

const DEFAULT_FIELD = { page: 1, type: 'signature' as FieldType, xPct: 10, yPct: 80, widthPct: 20, heightPct: 4 };

const SIGNATURE_FONTS = [
  { id: 0, name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { id: 1, name: 'Great Vibes', family: "'Great Vibes', cursive" },
  { id: 2, name: 'Pacifico', family: "'Pacifico', cursive" },
  { id: 3, name: 'Allura', family: "'Allura', cursive" },
  { id: 4, name: 'Sacramento', family: "'Sacramento', cursive" },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isSigningToken(param: string): boolean {
  return param.length === 36 && UUID_REGEX.test(param);
}

const EsignSignPage: React.FC = () => {
  const { documentId: documentIdOrToken } = useParams<{ documentId: string }>();
  const sigCanvasRef = useRef<SignatureCanvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentId, setDocumentId] = useState<string | null>(() => (documentIdOrToken && !isSigningToken(documentIdOrToken) ? documentIdOrToken : null));
  const [signingToken, setSigningToken] = useState<string | null>(() => (documentIdOrToken && isSigningToken(documentIdOrToken) ? documentIdOrToken : null));
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ file_name: string } | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [signatureDrawnData, setSignatureDrawnData] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [typedSignatureFontIndex, setTypedSignatureFontIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSignatureFieldIndex, setSelectedSignatureFieldIndex] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!documentIdOrToken) return;
    (async () => {
      try {
        if (isSigningToken(documentIdOrToken)) {
          const res = await fetch(`${BACKEND_URL}/api/esign/sign-by-token/${documentIdOrToken}`);
          const data = await res.json();
          if (!data.success) {
            setError(data.error || 'Invalid or expired signing link');
            setLoading(false);
            return;
          }
          setDocumentId(data.document.id);
          setSigningToken(documentIdOrToken);
          setRecipientName(data.recipient?.name || null);
          setDoc(data.document);
          const raw = data.fields || [];
          const normalized = raw.map((f: any) => {
            const page = Number(f.page) || 1;
            const type = (f.type || 'signature') as FieldType;
            if (f.x != null && f.y != null) {
              return { ...f, page, type, x: Number(f.x), y: Number(f.y), width: Number(f.width) || 120, height: Number(f.height) || 40 };
            }
            return { ...f, page, type, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
          });
          setFields(normalized.length ? normalized : [DEFAULT_FIELD]);
        } else {
          setDocumentId(documentIdOrToken);
          const [docRes, fieldsRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/esign/documents/${documentIdOrToken}?audit=open`),
            fetch(`${BACKEND_URL}/api/esign/signature-fields/${documentIdOrToken}`),
          ]);
          const docData = await docRes.json();
          const fieldsData = await fieldsRes.json();
          if (docData.success) setDoc(docData.document);
          if (fieldsData.success && fieldsData.fields?.length) {
            const normalized = fieldsData.fields.map((f: any) => {
              const page = Number(f.page) || 1;
              const type = (f.type || 'signature') as FieldType;
              if (f.x != null && f.y != null) {
                return { ...f, page, type, x: Number(f.x), y: Number(f.y), width: Number(f.width) || 120, height: Number(f.height) || 40 };
              }
              return { ...f, page, type, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
            });
            setFields(normalized);
          } else {
            setFields([DEFAULT_FIELD]);
          }
        }
      } catch {
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    })();
  }, [documentIdOrToken]);

  /** Scroll to first page that has a field once we know total pages (runs only when we have doc + main content; ref checked inside) */
  useEffect(() => {
    if (loading || !doc || success || totalPages <= 1 || !fields.length) return;
    const el = scrollContainerRef.current?.querySelector(`[data-page="${Math.min(...fields.map((f) => f.page || 1))}"]`);
    el?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, [loading, doc, success, totalPages, fields.length]);

  const clearSignature = () => {
    sigCanvasRef.current?.clear();
    setSignatureImage(null);
    setSignatureDrawnData(null);
    setTypedSignature('');
    setTypedSignatureFontIndex(0);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setSignatureImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const typedSignatureToDataUrl = (): string | null => {
    const text = typedSignature.trim();
    if (!text) return null;
    const font = SIGNATURE_FONTS[typedSignatureFontIndex];
    if (!font) return null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const fontSize = 48;
    const padding = 16;
    ctx.font = `${fontSize}px ${font.family}`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.ceil(metrics.width) + padding * 2;
    canvas.height = fontSize + padding * 2;
    ctx.font = `${fontSize}px ${font.family}`;
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, padding, canvas.height / 2);
    return canvas.toDataURL('image/png');
  };

  const getSignatureData = (): string | null => {
    if (signatureImage) return signatureImage;
    if (signatureDrawnData) return signatureDrawnData;
    if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) return sigCanvasRef.current.toDataURL('image/png');
    if (typedSignature.trim()) {
      const dataUrl = typedSignatureToDataUrl();
      if (dataUrl) return dataUrl;
      return typedSignature;
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!documentId) return;

    const values: Record<string, string> = {};
    const sigFieldIndices = fields.map((f, i) => (f.type === 'signature' ? i : -1)).filter((i) => i >= 0);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.type === 'signature') {
        const v = fieldValues[i];
        if (v) values[String(i)] = v;
      } else {
        const v = fieldValues[i] ?? (f.type === 'date' ? new Date().toISOString().slice(0, 10) : '');
        if (v) values[String(i)] = v;
      }
    }

    const missingSig = sigFieldIndices.filter((i) => !fieldValues[i]);
    if (missingSig.length > 0) {
      setError('Please sign all signature fields (click each "Sign Here" box to add your signature).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/generate-signed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          field_values: values,
          signer_email: undefined,
          signing_token: signingToken || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to generate signed document');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign document');
    } finally {
      setSubmitting(false);
    }
  };

  const getFieldStyle = (f: SignatureField) => {
    if (f.x != null && f.y != null) {
      return {
        left: (f.x ?? 0) * PDF_SCALE,
        top: (f.y ?? 0) * PDF_SCALE,
        width: (f.width ?? 120) * PDF_SCALE,
        height: (f.height ?? 40) * PDF_SCALE,
      };
    }
    return {
      left: `${f.xPct ?? 10}%`,
      top: `${f.yPct ?? 80}%`,
      width: `${f.widthPct ?? 20}%`,
      height: `${f.heightPct ?? 4}%`,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 text-center">{error || 'Document not found'}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Document Signed Successfully</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <a
            href={`${BACKEND_URL}/api/esign/documents/${documentId}/file`}
            download={doc.file_name}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
          >
            Download Signed PDF
          </a>
        </div>
      </div>
    );
  }

  const fileUrl = `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1`;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white">Sign Document</h1>
            <p className="text-indigo-100 text-sm mt-0.5">{doc.file_name}</p>
          </div>

          <div className="p-6 space-y-6">
            {/* PDF with all pages in one scrollable view - same logic as Place Fields */}
            <div>
              <div
                ref={scrollContainerRef}
                className="rounded-xl border-2 border-slate-200 overflow-y-auto overflow-x-hidden bg-slate-100 min-h-[400px] max-h-[70vh]"
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    data-page={pageNum}
                    className="flex flex-col items-center py-4 first:pt-4 last:pb-4"
                  >
                    <span className="text-xs font-medium text-slate-500 mb-2">Page {pageNum} of {totalPages}</span>
                    <div className="rounded-lg overflow-hidden shadow-sm">
                      <EsignPdfPageView
                        pdfUrl={fileUrl}
                        pageNumber={pageNum}
                        scale={PDF_SCALE}
                        onPdfInfo={pageNum === 1 ? (info) => setTotalPages(info.numPages) : undefined}
                      >
                        {fields
                          .map((f, globalIdx) => ({ f, globalIdx }))
                          .filter(({ f }) => (f.page || 1) === pageNum)
                          .map(({ f, globalIdx }) => {
                            const isSignature = f.type === 'signature';
                            const fieldVal = fieldValues[globalIdx];
                            const hasValue = isSignature
                              ? !!fieldVal
                              : !!(fieldVal ?? (f.type === 'date' ? new Date().toISOString().slice(0, 10) : ''));
                            const isImageDataUrl = typeof fieldVal === 'string' && fieldVal.startsWith('data:image');
                            return (
                              <div
                                key={f._id?.toString() ?? `field-${globalIdx}`}
                                className="absolute flex items-center justify-center overflow-hidden"
                                style={{
                                  ...getFieldStyle(f),
                                  minWidth: 60,
                                  minHeight: 24,
                                  pointerEvents: 'auto',
                                }}
                              >
                                {isSignature ? (
                                  hasValue ? (
                                    <div className="w-full h-full flex items-center justify-center bg-white/90 border border-slate-300 rounded p-1">
                                      {isImageDataUrl ? (
                                        <img
                                          src={fieldVal}
                                          alt="Signature"
                                          className="max-w-full max-h-full object-contain"
                                        />
                                      ) : (
                                        <span
                                          className="text-slate-800 font-medium truncate text-xs"
                                          style={{ fontFamily: 'cursive, serif' }}
                                        >
                                          {fieldVal}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedSignatureFieldIndex(globalIdx);
                                        clearSignature();
                                      }}
                                      className="w-full h-full flex items-center justify-center border-2 border-dashed border-indigo-400 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded cursor-pointer transition-colors"
                                    >
                                      Sign Here
                                    </button>
                                  )
                                ) : (
                                  <input
                                    type={f.type === 'date' ? 'date' : 'text'}
                                    value={
                                      fieldValues[globalIdx] ??
                                      (f.type === 'date' ? new Date().toISOString().slice(0, 10) : '')
                                    }
                                    onChange={(e) =>
                                      setFieldValues((prev) => ({ ...prev, [globalIdx]: e.target.value }))
                                    }
                                    placeholder={`Enter ${f.type}`}
                                    className="w-full h-full text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95"
                                  />
                                )}
                              </div>
                            );
                          })}
                      </EsignPdfPageView>
                    </div>
                  </div>
                ))}
              </div>

              {/* Go to page - same as Place Fields */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2 mt-2">
                  <label htmlFor="sign-goto-page" className="text-sm text-slate-600">Go to page</label>
                  <input
                    id="sign-goto-page"
                    type="number"
                    min={1}
                    max={totalPages}
                    defaultValue={1}
                    className="w-14 rounded border border-slate-300 px-2 py-1 text-sm"
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
                      const input = document.getElementById('sign-goto-page') as HTMLInputElement;
                      const n = input ? Math.max(1, Math.min(totalPages, parseInt(input.value, 10) || 1)) : 1;
                      scrollContainerRef.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-50"
                  >
                    Go
                  </button>
                  <span className="text-sm text-slate-500">1–{totalPages}</span>
                </div>
              )}
            </div>

            {/* Signature modal - opens when user clicks a "Sign Here" field */}
            {selectedSignatureFieldIndex !== null && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setSelectedSignatureFieldIndex(null); clearSignature(); }}>
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Add your signature</h3>
                    <p className="text-sm text-slate-500 mt-0.5">Draw, type, or upload — then click Apply to place it in the field.</p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex gap-2">
                      {(['draw', 'type', 'upload'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => {
                            setActiveTab(tab);
                            if (tab === 'upload') fileInputRef.current?.click();
                            if (tab === 'type' && !typedSignature.trim() && recipientName?.trim()) setTypedSignature(recipientName.trim());
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                            activeTab === tab ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {tab === 'draw' && <PenLine className="h-4 w-4" />}
                          {tab === 'type' && <Type className="h-4 w-4" />}
                          {tab === 'upload' && <ImagePlus className="h-4 w-4" />}
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          handleImageUpload(e);
                          setActiveTab('upload');
                        }}
                        className="hidden"
                      />
                    </div>

                    {activeTab === 'draw' && (
                      <div className="space-y-2">
                        <div className="rounded-lg border-2 border-slate-200 overflow-hidden bg-white">
                          <SignatureCanvas
                            ref={sigCanvasRef}
                            onEnd={() => {
                              if (sigCanvasRef.current && !sigCanvasRef.current.isEmpty()) {
                                setSignatureDrawnData(sigCanvasRef.current.toDataURL('image/png'));
                              }
                            }}
                            canvasProps={{
                              className: 'w-full h-32 touch-none',
                              style: { touchAction: 'none' },
                            }}
                            backgroundColor="rgb(255, 255, 255)"
                            penColor="rgb(0, 0, 0)"
                            minWidth={1}
                            maxWidth={3}
                          />
                        </div>
                        <button onClick={clearSignature} className="text-sm text-slate-600 hover:text-slate-900 underline">
                          Clear
                        </button>
                      </div>
                    )}

                    {activeTab === 'type' && (
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          placeholder="Type your full name as signature"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
                          style={{ fontFamily: SIGNATURE_FONTS[typedSignatureFontIndex]?.family || 'cursive' }}
                        />
                        <div>
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Choose signature style</p>
                          <p className="text-xs text-slate-500 mb-2">
                            {typedSignature.trim() ? 'Preview of your signature in each style:' : 'Type your name above to see it in each style.'}
                          </p>
                          <div className="space-y-2">
                            {SIGNATURE_FONTS.map((font, idx) => (
                              <button
                                key={font.id}
                                type="button"
                                onClick={() => setTypedSignatureFontIndex(idx)}
                                className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-all ${
                                  typedSignatureFontIndex === idx
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <span
                                  className={`block text-lg truncate ${typedSignature.trim() ? 'text-slate-800' : 'text-slate-400 italic'}`}
                                  style={{ fontFamily: font.family }}
                                >
                                  {typedSignature.trim() || 'Your name'}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-0.5 block">{font.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'upload' && (
                      <div>
                        {signatureImage ? (
                          <div className="relative inline-block">
                            <img src={signatureImage} alt="Signature" className="max-h-24 border rounded-lg" />
                            <button
                              type="button"
                              onClick={clearSignature}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-sm"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 hover:border-indigo-400"
                          >
                            <ImagePlus className="h-5 w-5" />
                            Upload signature image
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedSignatureFieldIndex(null); clearSignature(); }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const data = getSignatureData();
                        if (data && selectedSignatureFieldIndex !== null) {
                          setFieldValues((prev) => ({ ...prev, [selectedSignatureFieldIndex]: data }));
                          setSelectedSignatureFieldIndex(null);
                          clearSignature();
                          setError(null);
                        }
                      }}
                      disabled={!getSignatureData()}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-3 font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing…
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Sign & Download
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignSignPage;
