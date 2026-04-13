import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { PenLine, Loader2, Check, Type, ImagePlus, Pencil, Download, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import EsignPdfPageView from '../components/EsignPdfPageView';
import { cssStackForEsignTextFont, normalizeEsignTextColor } from '../utils/esignTextFieldStyle';

const PDF_SCALE = 1.5;

type FieldType = 'signature' | 'name' | 'title' | 'date' | 'text';

interface SignatureField {
  _id?: string;
  page: number;
  type: FieldType;
  /** Creator-entered text shown on the document; non-empty = read-only for the signer. */
  prefill?: string | null;
  text_color?: string | null;
  text_font?: string | null;
  xPct?: number;
  yPct?: number;
  widthPct?: number;
  heightPct?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  xNorm?: number;
  yNorm?: number;
  widthNorm?: number;
  heightNorm?: number;
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

function getInitialFieldValues(fieldList: SignatureField[]): Record<number, string> {
  const out: Record<number, string> = {};
  fieldList.forEach((f, i) => {
    if (f.type === 'signature') return;
    if (f.type === 'text') {
      out[i] = f.prefill != null ? String(f.prefill) : '';
    } else if (f.type === 'date') {
      out[i] =
        f.prefill != null && String(f.prefill).trim() !== ''
          ? String(f.prefill).slice(0, 10)
          : '';
    } else {
      out[i] = f.prefill != null ? String(f.prefill) : '';
    }
  });
  return out;
}

/** Creator typed text in Place Fields → show as static copy on the sign page (not an editable box). */
function isEsignTextPrefilled(f: SignatureField): boolean {
  const p = f.prefill;
  return typeof p === 'string' && p.trim().length > 0;
}

/** Name/title stay one line; box grows horizontally while typing (sign + review UIs). */
function isGrowNameTitleField(f: SignatureField): boolean {
  return f.type === 'name' || f.type === 'title';
}

function nameTitleInputSizeChars(value: string, fieldType: FieldType): number {
  const len = (value || '').length;
  const min = fieldType === 'title' ? 16 : 14;
  return Math.max(min, Math.min(96, len + 3));
}

/** Blocks submit/save/approve when any name, title, or date field is empty (creator-prefilled read-only fields are skipped). */
function validateNameTitleDateFieldsComplete(
  fieldList: SignatureField[],
  values: Record<number, string>
): string | null {
  const pretty: Record<string, string> = { name: 'Name', title: 'Title', date: 'Date' };
  for (let i = 0; i < fieldList.length; i++) {
    const f = fieldList[i];
    if (f.type !== 'name' && f.type !== 'title' && f.type !== 'date') continue;
    if (isEsignTextPrefilled(f)) continue;
    const v = String(values[i] ?? '').trim();
    if (!v) {
      return `Please fill in the ${pretty[f.type] ?? f.type} field before continuing.`;
    }
  }
  return null;
}

/** User-facing message when generate-signed fails; highlights bad signature image uploads. */
function friendlyGenerateSignedError(res: Response, apiError: string | undefined): string {
  const raw = (apiError || '').trim();
  const lower = raw.toLowerCase();
  const imageLikely =
    /signature image|image (encoding|data)|png or jpg|place the signature|invalid.*image|could not.*image|embed|webp/i.test(
      lower
    );
  if (imageLikely) {
    return 'That image format could not be used as your signature. Please upload a PNG or JPG, or use Draw or Type instead.';
  }
  if (raw) return raw;
  if (!res.ok) {
    return 'We could not finish signing. If you uploaded a signature image, try PNG or JPG—or use Draw or Type.';
  }
  return 'Failed to generate signed document';
}

const EsignSignPage: React.FC = () => {
  const { documentId: documentIdOrToken } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
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
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [reviewedSuccess, setReviewedSuccess] = useState(false);
  const [alreadyDenied, setAlreadyDenied] = useState(false);
  const [deniedSuccess, setDeniedSuccess] = useState(false);
  const [reviewComment, setReviewComment] = useState('');
  const [documentFullySigned, setDocumentFullySigned] = useState(false);
  const [recipientRole, setRecipientRole] = useState<'signer' | 'reviewer' | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [savingReviewerFields, setSavingReviewerFields] = useState(false);
  /** Reviewer must save field entries to DB before Approve (unless there are no fields). */
  const [reviewerEntriesSaved, setReviewerEntriesSaved] = useState(false);
  const [signerChoice, setSignerChoice] = useState<'approve' | 'deny' | null>(null);
  const [signerComment, setSignerComment] = useState('');
  const [signDeniedSuccess, setSignDeniedSuccess] = useState(false);
  const [denyingSign, setDenyingSign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [selectedSignatureFieldIndex, setSelectedSignatureFieldIndex] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const reviewerFieldValuesJsonRef = useRef<string | null>(null);

  useEffect(() => {
    if (recipientRole !== 'reviewer') return;
    const s = JSON.stringify(fieldValues);
    if (reviewerFieldValuesJsonRef.current === null) {
      reviewerFieldValuesJsonRef.current = s;
      return;
    }
    if (reviewerFieldValuesJsonRef.current !== s) {
      setReviewerEntriesSaved(false);
      reviewerFieldValuesJsonRef.current = s;
    }
  }, [fieldValues, recipientRole]);

  useEffect(() => {
    if (!documentIdOrToken) return;
    (async () => {
      try {
        if (isSigningToken(documentIdOrToken)) {
          const res = await fetch(`${BACKEND_URL}/api/esign/sign-by-token/${documentIdOrToken}`);
          const text = await res.text();
          let data: { success?: boolean; error?: string; document?: any; recipient?: any; fields?: any[] };
          try {
            data = text.startsWith('<') ? {} : JSON.parse(text);
          } catch {
            setError(res.ok ? 'Invalid response from server' : 'Unable to load document. Please check the link or try again later.');
            setLoading(false);
            return;
          }
          if (!data.success) {
            if ((res.status === 410 || (data as any).expired) && !data.error?.toLowerCase().includes('void')) {
              setIsExpired(true);
            } else {
              setError(data.error || 'Invalid or expired signing link');
            }
            setLoading(false);
            return;
          }
          setDocumentId(data.document.id);
          setSigningToken(documentIdOrToken);
          setRecipientName(data.recipient?.name || null);
          setDoc(data.document);
          const role = (data.recipient?.role || 'signer').toString();
          const action = data.recipient?.action;
          const isReviewer = action === 'reviewer' || (action !== 'signer' && (role.toLowerCase() === 'reviewer' || role === 'Technical Team' || role === 'Legal Team'));
          setRecipientRole(isReviewer ? 'reviewer' : 'signer');
          reviewerFieldValuesJsonRef.current = null;
          setShowDashboard(data.recipient?.show_dashboard !== false);
          if (data.recipient?.status === 'signed') {
            setAlreadySigned(true);
          }
          if (data.recipient?.status === 'reviewed') {
            setAlreadyReviewed(true);
          }
          if (data.recipient?.status === 'denied') {
            setAlreadyDenied(true);
          }
          const raw = data.fields || [];
          const normalized = raw.map((f: any) => {
            const page = Number(f.page) || 1;
            const type = (f.type || 'signature') as FieldType;
            const hasNorm =
              f.xNorm != null &&
              f.yNorm != null &&
              f.widthNorm != null &&
              f.heightNorm != null;
            if (hasNorm) {
              return {
                ...f,
                page,
                type,
                xNorm: Number(f.xNorm),
                yNorm: Number(f.yNorm),
                widthNorm: Number(f.widthNorm),
                heightNorm: Number(f.heightNorm),
                x: Number(f.x),
                y: Number(f.y),
                width: Number(f.width) || 120,
                height: Number(f.height) || 40,
              };
            }
            if (f.x != null && f.y != null) {
              return { ...f, page, type, x: Number(f.x), y: Number(f.y), width: Number(f.width) || 120, height: Number(f.height) || 40 };
            }
            return { ...f, page, type, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
          });
          if (normalized.length) {
            setFields(normalized);
            setFieldValues(getInitialFieldValues(normalized));
            if (isReviewer) {
              setReviewerEntriesSaved(!!data.recipient?.reviewer_fields_saved);
            }
          } else {
            setFields([]);
            if (isReviewer) {
              setReviewerEntriesSaved(true);
            }
            if (!isReviewer) {
              setError('No signature fields are assigned to you for this document. Ask the sender to assign fields to your name in Place Fields, then resend.');
            }
          }
        } else {
          setDocumentId(documentIdOrToken);
          const [docRes, fieldsRes] = await Promise.all([
            fetch(`${BACKEND_URL}/api/esign/documents/${documentIdOrToken}?audit=open`),
            fetch(`${BACKEND_URL}/api/esign/signature-fields/${documentIdOrToken}`),
          ]);
          const docData = await docRes.json();
          const fieldsData = await fieldsRes.json();
          if (!docRes.ok && docData?.error) {
            setError(docData.error);
          } else if (docData.success) {
            setDoc(docData.document);
            if (docData.document?.status === 'completed') {
              setDocumentFullySigned(true);
            }
          }
          if (fieldsData.success && fieldsData.fields?.length) {
            const normalized = fieldsData.fields.map((f: any) => {
              const page = Number(f.page) || 1;
              const type = (f.type || 'signature') as FieldType;
              const hasNorm =
                f.xNorm != null &&
                f.yNorm != null &&
                f.widthNorm != null &&
                f.heightNorm != null;
              if (hasNorm) {
                return {
                  ...f,
                  page,
                  type,
                  xNorm: Number(f.xNorm),
                  yNorm: Number(f.yNorm),
                  widthNorm: Number(f.widthNorm),
                  heightNorm: Number(f.heightNorm),
                  x: Number(f.x),
                  y: Number(f.y),
                  width: Number(f.width) || 120,
                  height: Number(f.height) || 40,
                };
              }
              if (f.x != null && f.y != null) {
                return { ...f, page, type, x: Number(f.x), y: Number(f.y), width: Number(f.width) || 120, height: Number(f.height) || 40 };
              }
              return { ...f, page, type, xPct: f.xPct ?? 10, yPct: f.yPct ?? 80, widthPct: f.widthPct ?? 20, heightPct: f.heightPct ?? 4 };
            });
            setFields(normalized);
            setFieldValues(getInitialFieldValues(normalized));
          } else {
            setFields([DEFAULT_FIELD]);
            setFieldValues(getInitialFieldValues([DEFAULT_FIELD as SignatureField]));
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

  /** Canonical PNG data URL for storage + preview (typed plain text becomes canvas image). */
  const normalizeSignatureImageDataUrl = (): string | null => {
    const d = getSignatureData();
    if (!d) return null;
    if (typeof d === 'string' && d.startsWith('data:image')) return d;
    const fromType = typedSignatureToDataUrl();
    return fromType;
  };

  const handleSubmit = async () => {
    if (!documentId) return;
    if (!fields.length) {
      setError('No signature fields are assigned to you. Contact the sender.');
      return;
    }

    const values: Record<string, string> = {};
    const sigFieldIndices = fields.map((f, i) => (f.type === 'signature' ? i : -1)).filter((i) => i >= 0);

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.type === 'signature') {
        const v = fieldValues[i];
        if (v) values[String(i)] = v;
      } else {
        const v = String(fieldValues[i] ?? '').trim();
        if (v) values[String(i)] = v;
      }
    }

    const missingSig = sigFieldIndices.filter((i) => !fieldValues[i]);
    if (missingSig.length > 0) {
      setError('Please sign all signature fields (click each "Sign Here" box to add your signature).');
      return;
    }

    const requiredFieldsErr = validateNameTitleDateFieldsComplete(fields, fieldValues);
    if (requiredFieldsErr) {
      setError(requiredFieldsErr);
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

      let data: { success?: boolean; error?: string } = {};
      try {
        const text = await res.text();
        if (text && !text.startsWith('<')) data = JSON.parse(text);
      } catch {
        data = {};
      }
      if (data.success) {
        setSuccess(true);
      } else {
        setError(friendlyGenerateSignedError(res, data.error));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sign document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (fileName?: string) => {
    if (!documentId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${documentId}/file?attachment=1`, { credentials: 'include' });
      if (!res.ok) {
        setError('Download failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName ?? doc?.file_name ?? 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const buildReviewerFieldPayload = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.type === 'signature') continue;
      out[String(i)] = String(fieldValues[i] ?? '');
    }
    return out;
  };

  const handleSaveReviewerFields = async () => {
    if (!signingToken) return;
    if (fields.length > 0) {
      const requiredFieldsErr = validateNameTitleDateFieldsComplete(fields, fieldValues);
      if (requiredFieldsErr) {
        setError(requiredFieldsErr);
        return;
      }
    }
    setSavingReviewerFields(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/reviewer-save-fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signing_token: signingToken,
          field_values: buildReviewerFieldPayload(),
        }),
      });
      const text = await res.text();
      let data: { success?: boolean; error?: string };
      try {
        data = text.startsWith('<') ? {} : JSON.parse(text);
      } catch {
        setError(res.ok ? 'Invalid response from server' : `Server error (${res.status}). Please try again.`);
        return;
      }
      if (data.success) {
        setReviewerEntriesSaved(true);
        reviewerFieldValuesJsonRef.current = JSON.stringify(fieldValues);
      } else {
        setError(data.error || 'Could not save field entries');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not save field entries');
    } finally {
      setSavingReviewerFields(false);
    }
  };

  const handleReviewAction = async (action: 'approve' | 'deny') => {
    if (!signingToken) return;
    if (action === 'deny' && !reviewComment.trim()) {
      setError('Comment is required when denying');
      return;
    }
    if (action === 'approve' && fields.length > 0 && !reviewerEntriesSaved) {
      setError('Save field entries first, then Approve.');
      return;
    }
    const reviewFieldPayload = action === 'approve' ? buildReviewerFieldPayload() : {};
    setMarkingReviewed(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/mark-reviewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signing_token: signingToken,
          action,
          comment: reviewComment.trim() || undefined,
          ...(action === 'approve' && fields.length > 0 ? { field_values: reviewFieldPayload } : {}),
        }),
      });
      const text = await res.text();
      let data: { success?: boolean; error?: string; action?: string };
      try {
        data = text.startsWith('<') ? {} : JSON.parse(text);
      } catch {
        setError(res.ok ? 'Invalid response from server' : `Server error (${res.status}). Please try again.`);
        return;
      }
      if (data.success) {
        if (data.action === 'deny') {
          setDeniedSuccess(true);
        } else {
          setReviewedSuccess(true);
        }
      } else {
        setError(data.error || 'Request failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setMarkingReviewed(false);
    }
  };

  const handleDenySigning = async () => {
    if (!signingToken) return;
    if (!signerComment.trim()) {
      setError('Comment is required when declining to sign');
      return;
    }
    setDenyingSign(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/deny-signing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signing_token: signingToken, comment: signerComment.trim() }),
      });
      const text = await res.text();
      let data: { success?: boolean; error?: string };
      try {
        data = text.startsWith('<') ? {} : JSON.parse(text);
      } catch {
        setError(res.ok ? 'Invalid response from server' : `Server error (${res.status}). Please try again.`);
        return;
      }
      if (data.success) {
        setSignDeniedSuccess(true);
      } else {
        setError(data.error || 'Request failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setDenyingSign(false);
    }
  };

  const getFieldStyle = (f: SignatureField) => {
    if (
      f.xNorm != null &&
      f.yNorm != null &&
      f.widthNorm != null &&
      f.heightNorm != null
    ) {
      return {
        left: `${Number(f.xNorm) * 100}%`,
        top: `${Number(f.yNorm) * 100}%`,
        width: `${Number(f.widthNorm) * 100}%`,
        height: `${Number(f.heightNorm) * 100}%`,
      };
    }
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

  if (isExpired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-50 border border-amber-200 mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Signing link expired</h2>
          <p className="text-slate-600 text-sm">
            This e-signature link has expired (links are valid for 15 days). Please contact the sender to request a new signing link.
          </p>
        </div>
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

  if (alreadySigned) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
            <Check className="h-8 w-8 text-slate-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You have already signed this document</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">This signing link is no longer active for new signatures. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (alreadyReviewed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Check className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You have already reviewed this document</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">This link is no longer active. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (alreadyDenied) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You have already denied this document</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">This link is no longer active. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (deniedSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You have denied the review</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">You have completed your decision. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (documentFullySigned) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Document fully signed</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">All signers have completed this document. No further signatures needed. You can download the signed document below.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download signed document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    if (signingToken && showDashboard) {
      navigate(`/esign-inbox?token=${encodeURIComponent(signingToken)}`, { replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Document Signed Successfully</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download Signed PDF
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (reviewedSuccess) {
    if (signingToken && showDashboard) {
      navigate(`/esign-inbox?token=${encodeURIComponent(signingToken)}`, { replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 mb-4">
            <Check className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Document marked as reviewed</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">You have completed your review. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (recipientRole === 'reviewer') {
    const fileUrl = `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1`;
    return (
      <div className="min-h-screen bg-slate-50 py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Review document</h1>
          <p className="text-slate-600 text-sm mb-4">{doc.file_name}</p>
          <p className="text-slate-600 text-sm mb-4">
            Signature fields are not shown here. Fill name, title, date, and text fields, then <strong>Save field entries</strong> — that updates the downloadable PDF (and database). Then click <strong>Approve</strong>. Use the Download button on this flow so the file comes from e-sign; other downloads (e.g. agreement from Quotes) are separate files.
          </p>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
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
                        .filter(({ f }) => f.type !== 'signature' && (f.page || 1) === pageNum)
                        .map(({ f, globalIdx }) => {
                          const growNt = isGrowNameTitleField(f);
                          const baseSt = getFieldStyle(f);
                          return (
                          <div
                            key={f._id?.toString() ?? `rev-field-${globalIdx}`}
                            className={`absolute flex items-center pointer-events-auto ${growNt ? 'justify-start overflow-visible z-[2]' : 'justify-center overflow-hidden'}`}
                            style={{
                              ...baseSt,
                              minHeight: 24,
                              ...(growNt
                                ? {
                                    width: 'max-content',
                                    minWidth: baseSt.width ?? 60,
                                    maxWidth: '95%',
                                  }
                                : { minWidth: 60 }),
                            }}
                          >
                            {f.type === 'text' ? (
                              isEsignTextPrefilled(f) ? (
                                <div
                                  className="w-full h-full min-h-0 flex items-start justify-start overflow-y-auto text-xs leading-snug whitespace-pre-wrap select-none"
                                  style={{
                                    color: normalizeEsignTextColor(f.text_color ?? undefined),
                                    fontFamily: cssStackForEsignTextFont(f.text_font ?? undefined),
                                  }}
                                >
                                  {fieldValues[globalIdx] ?? f.prefill ?? ''}
                                </div>
                              ) : (
                                <textarea
                                  value={fieldValues[globalIdx] ?? ''}
                                  onChange={(e) =>
                                    setFieldValues((prev) => ({
                                      ...prev,
                                      [globalIdx]: e.target.value.slice(0, 4000),
                                    }))
                                  }
                                  placeholder="Type notes or extra text for this document"
                                  rows={3}
                                  className="w-full min-h-[4.5rem] max-h-full text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95 resize-none overflow-y-auto leading-snug placeholder:opacity-45"
                                  style={{
                                    color: normalizeEsignTextColor(f.text_color ?? undefined),
                                    fontFamily: cssStackForEsignTextFont(f.text_font ?? undefined),
                                  }}
                                />
                              )
                            ) : (
                              <input
                                type={f.type === 'date' ? 'date' : 'text'}
                                value={fieldValues[globalIdx] ?? ''}
                                onChange={(e) =>
                                  setFieldValues((prev) => ({ ...prev, [globalIdx]: e.target.value }))
                                }
                                placeholder={`Enter ${f.type}`}
                                size={growNt ? nameTitleInputSizeChars(fieldValues[globalIdx] ?? '', f.type) : undefined}
                                className={
                                  growNt
                                    ? 'box-border whitespace-nowrap text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95 max-h-8'
                                    : 'w-full h-full text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95'
                                }
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
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-2 mb-6">
              <label htmlFor="review-goto-page" className="text-sm text-slate-600">Go to page</label>
              <input
                id="review-goto-page"
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
                  const input = document.getElementById('review-goto-page') as HTMLInputElement;
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
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <div className="flex flex-nowrap items-end gap-3 w-full min-w-0 overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 mb-4">
            <button
              type="button"
              onClick={() => handleSaveReviewerFields()}
              disabled={savingReviewerFields || markingReviewed || fields.length === 0}
              className="inline-flex flex-shrink-0 items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-indigo-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {savingReviewerFields ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Saving…
                </>
              ) : (
                <>Save field entries</>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleReviewAction('approve')}
              disabled={markingReviewed || savingReviewerFields || (fields.length > 0 && !reviewerEntriesSaved)}
              className="inline-flex flex-shrink-0 items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-emerald-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              title={fields.length > 0 && !reviewerEntriesSaved ? 'Save field entries first' : undefined}
            >
              {markingReviewed ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Submitting…
                </>
              ) : (
                <>
                  <Check className="h-5 w-5 shrink-0" />
                  Approve
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleReviewAction('deny')}
              disabled={markingReviewed}
              className="inline-flex flex-shrink-0 items-center justify-center gap-2 px-5 py-2.5 sm:px-6 sm:py-3 bg-red-600 text-white rounded-lg text-sm sm:text-base font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {markingReviewed ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  Submitting…
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 shrink-0" />
                  Deny
                </>
              )}
            </button>
            <div className="flex flex-col gap-1 w-64 min-w-[16rem] flex-shrink-0">
              <label htmlFor="review-comment" className="text-xs font-medium text-slate-600 leading-tight">
                Comment (optional for Approve; required for Deny)
              </label>
              <input
                id="review-comment"
                type="text"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add a comment…"
                className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const fileUrl = `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1`;

  if (signDeniedSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">You have declined to sign</h2>
          <p className="text-slate-600 mb-6">{doc.file_name}</p>
          <p className="text-slate-500 text-sm mb-6">You have completed your decision. You can download the document below if needed.</p>
          <button
            type="button"
            onClick={() => handleDownload(doc.file_name)}
            disabled={downloading}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-600 text-white rounded-lg font-semibold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Downloading…
              </>
            ) : (
              <>
                <Download className="h-5 w-5" />
                Download document
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (signerChoice === null && signingToken) {
    const signerPreviewFileUrl = `${BACKEND_URL}/api/esign/documents/${documentId}/file?inline=1`;
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 px-6 py-4">
              <h1 className="text-xl font-bold text-white">Sign Document</h1>
              <p className="text-indigo-100 text-sm mt-0.5">{doc.file_name}</p>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Review the document below, then choose to approve or decline to sign.</p>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <iframe
                    src={signerPreviewFileUrl}
                    title="Document preview"
                    className="w-full h-[60vh] border-0"
                  />
                </div>
              </div>
              <p className="text-slate-600">Do you approve this document and wish to sign, or decline to sign?</p>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div className="flex flex-nowrap items-end gap-3 w-full min-w-0 overflow-x-auto bg-slate-50 rounded-xl border border-slate-200 p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => setSignerChoice('approve')}
                  className="inline-flex flex-shrink-0 items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Check className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  Approve (proceed to sign)
                </button>
                <button
                  type="button"
                  onClick={handleDenySigning}
                  disabled={denyingSign}
                  className="inline-flex flex-shrink-0 items-center justify-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {denyingSign ? (
                    <>
                      <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                      Deny (decline to sign)
                    </>
                  )}
                </button>
                <div className="flex flex-col gap-1 w-64 min-w-[16rem] flex-shrink-0">
                  <label htmlFor="signer-comment" className="text-xs font-medium text-slate-600 leading-tight">
                    Comment (optional for Approve; required for Deny)
                  </label>
                  <input
                    id="signer-comment"
                    type="text"
                    value={signerComment}
                    onChange={(e) => setSignerComment(e.target.value)}
                    placeholder="Add a comment…"
                    className="w-full h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="bg-indigo-600 px-6 py-4">
            <h1 className="text-xl font-bold text-white">Sign Document</h1>
            <p className="text-indigo-100 text-sm mt-0.5">{doc.file_name}</p>
          </div>

          <div className="p-6 space-y-6">
            {fields.length === 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {error || 'No signature fields are assigned to you for this document. Ask the sender to assign fields to your recipient in Place Fields, then resend the link.'}
              </div>
            )}
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
                            const growNt = !isSignature && isGrowNameTitleField(f);
                            const baseSt = getFieldStyle(f);
                            const fieldVal = fieldValues[globalIdx];
                            const hasValue = isSignature
                              ? !!fieldVal
                              : String(fieldVal ?? '').trim().length > 0;
                            const isImageDataUrl = typeof fieldVal === 'string' && fieldVal.startsWith('data:image');
                            return (
                              <div
                                key={f._id?.toString() ?? `field-${globalIdx}`}
                                className={`absolute flex items-center pointer-events-auto ${growNt ? 'justify-start overflow-visible z-[2]' : 'justify-center overflow-hidden'}`}
                                style={{
                                  ...baseSt,
                                  minHeight: 24,
                                  ...(growNt
                                    ? {
                                        width: 'max-content',
                                        minWidth: baseSt.width ?? 60,
                                        maxWidth: '95%',
                                      }
                                    : { minWidth: 60 }),
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
                                ) : f.type === 'text' ? (
                                  isEsignTextPrefilled(f) ? (
                                    <div
                                      className="w-full h-full min-h-0 flex items-start justify-start overflow-y-auto text-xs leading-snug whitespace-pre-wrap select-none"
                                      style={{
                                        color: normalizeEsignTextColor(f.text_color ?? undefined),
                                        fontFamily: cssStackForEsignTextFont(f.text_font ?? undefined),
                                      }}
                                    >
                                      {fieldValues[globalIdx] ?? f.prefill ?? ''}
                                    </div>
                                  ) : (
                                    <textarea
                                      value={fieldValues[globalIdx] ?? ''}
                                      onChange={(e) =>
                                        setFieldValues((prev) => ({
                                          ...prev,
                                          [globalIdx]: e.target.value.slice(0, 4000),
                                        }))
                                      }
                                      placeholder="Type notes or extra text for this document"
                                      rows={3}
                                      className="w-full min-h-[4.5rem] max-h-full text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95 resize-none overflow-y-auto leading-snug placeholder:opacity-45"
                                      style={{
                                        color: normalizeEsignTextColor(f.text_color ?? undefined),
                                        fontFamily: cssStackForEsignTextFont(f.text_font ?? undefined),
                                      }}
                                    />
                                  )
                                ) : (
                                  <input
                                    type={f.type === 'date' ? 'date' : 'text'}
                                    value={fieldValues[globalIdx] ?? ''}
                                    onChange={(e) =>
                                      setFieldValues((prev) => ({ ...prev, [globalIdx]: e.target.value }))
                                    }
                                    placeholder={`Enter ${f.type}`}
                                    size={growNt ? nameTitleInputSizeChars(fieldValues[globalIdx] ?? '', f.type) : undefined}
                                    className={
                                      growNt
                                        ? 'box-border whitespace-nowrap text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95 max-h-8'
                                        : 'w-full h-full text-xs border border-slate-300 rounded px-1 py-0.5 bg-white/95'
                                    }
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
              <div
                className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4 sm:items-center bg-black/50"
                onClick={() => { setSelectedSignatureFieldIndex(null); clearSignature(); }}
              >
                <div
                  className="bg-white shadow-xl border border-slate-200 w-full max-w-full sm:max-w-[min(480px,calc(100vw-2rem))] flex flex-col max-h-[90vh] min-h-0 overflow-hidden rounded-t-2xl sm:rounded-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header - fixed */}
                  <div className="flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-200">
                    <h3 className="text-lg font-semibold text-slate-900">Add your signature</h3>
                    <p className="text-sm text-slate-500 mt-0.5">Draw, type, or upload — then click Apply to place it in the field.</p>
                  </div>

                  {/* Content - scrollable area only for signature styles list */}
                  <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 overflow-hidden">
                    <div className="flex-shrink-0 flex flex-wrap gap-2 mb-4">
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
                      <div className="flex-shrink-0 space-y-2">
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
                      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                        <input
                          type="text"
                          value={typedSignature}
                          onChange={(e) => setTypedSignature(e.target.value)}
                          placeholder="Type your full name as signature"
                          className="flex-shrink-0 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
                          style={{ fontFamily: SIGNATURE_FONTS[typedSignatureFontIndex]?.family || 'cursive' }}
                        />
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                          <p className="flex-shrink-0 text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Choose signature style</p>
                          <p className="flex-shrink-0 text-xs text-slate-500 mb-2">
                            {typedSignature.trim() ? 'Preview of your signature in each style:' : 'Type your name above to see it in each style.'}
                          </p>
                          <div
                            className="flex-1 min-h-0 max-h-[min(12rem,38svh)] sm:max-h-52 overflow-y-auto overflow-x-hidden rounded-lg pr-1 scroll-smooth [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:hover:bg-slate-400"
                          >
                            <div className="space-y-2 pb-1">
                              {SIGNATURE_FONTS.map((font, idx) => (
                                <button
                                  key={font.id}
                                  type="button"
                                  onClick={() => setTypedSignatureFontIndex(idx)}
                                  className={`w-full text-left rounded-lg border-2 px-3 py-2.5 transition-all duration-200 ${
                                    typedSignatureFontIndex === idx
                                      ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
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
                      </div>
                    )}

                    {activeTab === 'upload' && (
                      <div className="flex-shrink-0">
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

                  {/* Footer - sticky, always visible */}
                  <div className="flex-shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:py-4 border-t border-slate-200 bg-white flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setSelectedSignatureFieldIndex(null); clearSignature(); }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const dataUrl = normalizeSignatureImageDataUrl();
                        if (!dataUrl || selectedSignatureFieldIndex === null) return;
                        setFieldValues((prev) => ({ ...prev, [selectedSignatureFieldIndex]: dataUrl }));
                        setSelectedSignatureFieldIndex(null);
                        clearSignature();
                        setError(null);
                      }}
                      disabled={!normalizeSignatureImageDataUrl()}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  setFieldValues(getInitialFieldValues(fields));
                  clearSignature();
                  setSelectedSignatureFieldIndex(null);
                }}
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-300 text-slate-700 bg-white py-3 font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Pencil className="h-5 w-5" />
                Edit
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || fields.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white py-3 font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Submit
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(doc?.file_name)}
                disabled={downloading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-300 text-slate-700 bg-white py-3 font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" />
                    Download
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EsignSignPage;
