import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Loader2, PenLine, Download, Trash2, Check, Clock, XCircle, Eye, MoreVertical, BookOpen, Copy, Bell, X, Users } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { shouldAutoStartLandingTour, startEsignLandingTour } from '../utils/esignTour';

interface RecipientRow {
  id: string;
  name: string;
  email: string;
  role?: string;
  status: string;
  order?: number;
  comment?: string | null;
}

/** Same row shape as e sign status / agreement-status API. */
interface EsignDocument {
  id: string;
  file_name: string;
  uploaded_by?: string;
  upload_source?: string;
  requested_by?: string | null;
  creator_name?: string | null;
  creator_email?: string | null;
  created_at: string;
  sent_at?: string;
  signed_at?: string;
  voided_at?: string;
  status: string;
  recipients: RecipientRow[];
}

interface StatusModalRecipient {
  id: string;
  name: string;
  email: string;
  role?: string;
  action?: string | null;
  status: string;
  order?: number;
  comment?: string | null;
  signing_token?: string | null;
}

interface StatusModalDoc {
  id: string;
  file_name: string;
  status: string;
  created_at?: string | null;
  sent_at?: string | null;
  void_reason?: string | null;
  voided_by?: string | null;
  voided_at?: string | null;
}

const STATUS_MODAL_AVATAR_COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-indigo-500',
];

function statusModalAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % STATUS_MODAL_AVATAR_COLORS.length;
  return STATUS_MODAL_AVATAR_COLORS[idx];
}

function statusModalInitials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function isStatusModalReviewer(rec: StatusModalRecipient): boolean {
  const action = (rec.action || '').toLowerCase();
  if (action === 'reviewer') return true;
  if (action === 'signer') return false;
  const role = (rec.role || '').trim();
  return role === 'Technical Team' || role === 'Legal Team';
}

function normalizeEmail(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase();
}

/** True if this agreement row belongs to the signed-in user (matches "Created by" semantics from the API). */
function isEsignDocumentForCurrentUser(doc: EsignDocument, userEmail: string | undefined | null): boolean {
  const u = normalizeEmail(userEmail);
  if (!u) return false;
  const uploaded = String(doc.uploaded_by || '').trim();
  if (uploaded.includes('@') && normalizeEmail(uploaded) === u) return true;
  if (normalizeEmail(doc.creator_email) === u) return true;
  return false;
}

function formatEsignCreatedByLine(doc: EsignDocument): string {
  const parts = [doc.creator_name, doc.creator_email].filter((x) => x && String(x).trim());
  return parts.length ? `Created by ${parts.join(' · ')}` : 'Created by —';
}

function formatBytes(n: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatEsignDateTime(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function formatEsignCreatedAtLine(doc: EsignDocument): string | null {
  const when = formatEsignDateTime(doc.created_at);
  return when ? `Created ${when}` : null;
}

const EsignDocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

const [documents, setDocuments] = useState<EsignDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  const [copyingDocId, setCopyingDocId] = useState<string | null>(null);
  const [remindingDocId, setRemindingDocId] = useState<string | null>(null);
  const [remindedDocId, setRemindedDocId] = useState<string | null>(null);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedDocumentName, setUploadedDocumentName] = useState<string>('');
  const [uploadedFileSize, setUploadedFileSize] = useState<number>(0);
  const [removingUpload, setRemovingUpload] = useState(false);
  const [recipientInputs, setRecipientInputs] = useState<Array<{ name: string; email: string }>>([
    { name: '', email: '' },
  ]);
  const [signingOrderEnabled, setSigningOrderEnabled] = useState(false);
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [reminderToast, setReminderToast] = useState<{ recipients: string[] } | null>(null);
  const reminderToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<StatusModalRecipient[]>([]);
  const [statusModalTab, setStatusModalTab] = useState<'signers' | 'reviewers'>('signers');
  const [statusModalCopiedRecipientId, setStatusModalCopiedRecipientId] = useState<string | null>(null);
  const [statusModalCopyingRecipientId, setStatusModalCopyingRecipientId] = useState<string | null>(null);
  const [statusModalLoading, setStatusModalLoading] = useState(false);
  const [statusModalDownloading, setStatusModalDownloading] = useState(false);
  const landingTourAutoStartedRef = useRef(false);
  const landingTourTimeoutRef = useRef<number | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/agreement-status`);
      const data = await res.json();
      if (data.success && Array.isArray(data.agreements)) {
        const email = user?.email;
        // Manual e-sign page is the workspace for drafts only. Once a document is sent,
        // it moves to the e-sign status page for tracking, so exclude non-draft docs here.
        const mine = email
          ? (data.agreements as EsignDocument[]).filter(
              (d) => isEsignDocumentForCurrentUser(d, email) && (d.status || '').toLowerCase() === 'draft'
            )
          : [];
        setDocuments(mine);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void loadDocuments();
  }, [authLoading, loadDocuments]);

  useEffect(() => {
    if (loading || landingTourAutoStartedRef.current || !shouldAutoStartLandingTour()) return;
    landingTourAutoStartedRef.current = true;
    const hasDraft = documents.some((d) => d.status === 'draft');
    landingTourTimeoutRef.current = window.setTimeout(() => {
      landingTourTimeoutRef.current = null;
      startEsignLandingTour(hasDraft);
    }, 450);
    return () => {
      if (landingTourTimeoutRef.current) {
        window.clearTimeout(landingTourTimeoutRef.current);
        landingTourTimeoutRef.current = null;
      }
    };
  }, [loading, documents]);

  const closeActionsMenu = useCallback(() => {
    setOpenActionsId(null);
    setDropdownPosition(null);
  }, []);

  const uploadFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      setUploadError('Please select a PDF file');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploaded_by', user?.email || uploadedBy || 'anonymous');
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        await loadDocuments();
        setUploadedDocumentId(data.document.id);
        setUploadedDocumentName(data.document.file_name || file.name);
        setUploadedFileSize(file.size || 0);
        setRecipientInputs([{ name: '', email: '' }]);
        setSigningOrderEnabled(false);
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
    e.target.value = '';
  };

  const updateRecipientInput = (index: number, field: 'name' | 'email', value: string) => {
    setRecipientInputs((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addRecipientInput = () => {
    setRecipientInputs((prev) => [...prev, { name: '', email: '' }]);
  };

  const removeRecipientInput = (index: number) => {
    setRecipientInputs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleSaveRecipientsAndContinue = async () => {
    if (!uploadedDocumentId) return;
    const valid = recipientInputs.filter((r) => r.email.trim());
    if (valid.length > 0) {
      setSavingRecipients(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${uploadedDocumentId}/recipients`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: valid.map((r) => ({
              name: r.name.trim() || r.email.trim(),
              email: r.email.trim(),
              role: 'signer',
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          alert(data.error || 'Failed to save recipients');
          setSavingRecipients(false);
          return;
        }
      } catch (err: any) {
        alert(err?.message || 'Failed to save recipients');
        setSavingRecipients(false);
        return;
      }
      setSavingRecipients(false);
    }
    const docId = uploadedDocumentId;
    setUploadedDocumentId(null);
    setUploadedDocumentName('');
    setUploadedFileSize(0);
    setRecipientInputs([{ name: '', email: '' }]);
    navigate(`/esign/${docId}/place-fields`);
  };

  const handleRemoveUploadedFile = async () => {
    if (!uploadedDocumentId) return;
    if (!window.confirm(`Remove "${uploadedDocumentName || 'this document'}"? The uploaded file will be deleted.`)) return;
    setRemovingUpload(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${uploadedDocumentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '' }),
      });
      // Treat success and 404 (already gone) the same — clear the local state either way.
      if (!res.ok && res.status !== 404) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || `Remove failed (${res.status})`);
        return;
      }
      setUploadedDocumentId(null);
      setUploadedDocumentName('');
      setUploadedFileSize(0);
      setRecipientInputs([{ name: '', email: '' }]);
      setSigningOrderEnabled(false);
      await loadDocuments();
    } catch {
      alert('Could not remove the file. Please try again.');
    } finally {
      setRemovingUpload(false);
    }
  };

  const handleCancelAddRecipients = () => {
    setUploadedDocumentId(null);
    setUploadedDocumentName('');
    setUploadedFileSize(0);
    setRecipientInputs([{ name: '', email: '' }]);
    setSigningOrderEnabled(false);
  };

  const [dragActive, setDragActive] = useState(false);
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const handleVoid = async (docId: string) => {
    const reason = window.prompt(
      'Why are you voiding this document?\n\nThis comment is recorded for audit purposes. Signing links will stop working and the document will stay in the list as voided.',
      ''
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      alert('Please enter a reason for voiding.');
      return;
    }
    setVoidingId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '', void_reason: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await loadDocuments();
        if (statusModalId === docId) closeStatusModal();
      } else {
        alert(data.error || `Void failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Void failed. Check the console or try again.');
    } finally {
      setVoidingId(null);
    }
  };

  const handleSendReminder = async (docId: string) => {
    if (remindingDocId) return;
    setRemindingDocId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not send reminder.');
        return;
      }
      setRemindedDocId(docId);
      setTimeout(() => setRemindedDocId((c) => (c === docId ? null : c)), 2500);

      const doc = documents.find((d) => d.id === docId);
      const pendingRecipients = (doc?.recipients ?? [])
        .filter((r) => r.status !== 'signed' && r.status !== 'approved')
        .map((r) => r.name || r.email);
      if (reminderToastTimerRef.current) clearTimeout(reminderToastTimerRef.current);
      setReminderToast({ recipients: pendingRecipients.length ? pendingRecipients : ['recipients'] });
      reminderToastTimerRef.current = setTimeout(() => setReminderToast(null), 4000);
    } catch {
      alert('Could not send reminder.');
    } finally {
      setRemindingDocId(null);
    }
  };

  const handleCopySigningLink = async (docId: string) => {
    if (copyingDocId) return;
    setCopyingDocId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}/recipients`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not fetch signing link.');
        return;
      }
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];
      const target = recipients.find((r: { signing_token?: string | null; status?: string }) =>
        r.signing_token && (r.status === 'pending' || !r.status)
      ) || recipients.find((r: { signing_token?: string | null }) => r.signing_token);
      if (!target?.signing_token) {
        alert('No active signing link is available for this document.');
        return;
      }
      const signingUrl = `${window.location.origin}/sign/${target.signing_token}`;
      try {
        await navigator.clipboard.writeText(signingUrl);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = signingUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedDocId(docId);
      setTimeout(() => setCopiedDocId((current) => (current === docId ? null : current)), 2000);
    } catch {
      alert('Could not copy signing link.');
    } finally {
      setCopyingDocId(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!window.confirm('Delete this document? This cannot be undone.')) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '' }),
      });
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

  const openStatusModal = useCallback(async (docId: string) => {
    setStatusModalId(docId);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalLoading(true);
    try {
      const [docRes, recRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/documents/${docId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${docId}/recipients`),
      ]);
      const docData = await docRes.json();
      const recData = await recRes.json();
      if (docData.success && docData.document) {
        setStatusModalDoc({
          id: docData.document.id || docId,
          file_name: docData.document.file_name,
          status: docData.document.status,
          created_at: docData.document.created_at || null,
          sent_at: docData.document.sent_at || null,
          void_reason: docData.document.void_reason || null,
          voided_by: docData.document.voided_by || null,
          voided_at: docData.document.voided_at || null,
        });
      }
      if (recData.success && Array.isArray(recData.recipients)) {
        const sorted = [...recData.recipients].sort(
          (a: StatusModalRecipient, b: StatusModalRecipient) => ((a.order ?? 999) - (b.order ?? 999))
        );
        setStatusModalRecipients(sorted);
      }
    } catch {
      setStatusModalDoc(null);
      setStatusModalRecipients([]);
    } finally {
      setStatusModalLoading(false);
    }
  }, []);

  const closeStatusModal = useCallback(() => {
    setStatusModalId(null);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalTab('signers');
    setStatusModalCopiedRecipientId(null);
    setStatusModalCopyingRecipientId(null);
  }, []);

  const handleCopyRecipientLink = async (recipientId: string, signingToken: string | null | undefined) => {
    if (!signingToken || statusModalCopyingRecipientId) return;
    setStatusModalCopyingRecipientId(recipientId);
    try {
      const url = `${window.location.origin}/sign/${signingToken}`;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setStatusModalCopiedRecipientId(recipientId);
      setTimeout(
        () => setStatusModalCopiedRecipientId((c) => (c === recipientId ? null : c)),
        2000
      );
    } finally {
      setStatusModalCopyingRecipientId(null);
    }
  };

  const handleStatusModalDownload = async () => {
    if (!statusModalId || !statusModalDoc) return;
    setStatusModalDownloading(true);
    try {
      const url = `${BACKEND_URL}/api/esign/documents/${statusModalId}/file?attachment=1`;
      const link = document.createElement('a');
      link.href = url;
      link.download = statusModalDoc.file_name || 'document.pdf';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setStatusModalDownloading(false);
    }
  };

  const handleStatusModalPreview = () => {
    if (!statusModalId) return;
    window.open(`${BACKEND_URL}/api/esign/documents/${statusModalId}/file?inline=1`, '_blank', 'noopener,noreferrer');
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'sent':
        return 'Sent';
      case 'signed':
        return 'Signed';
      case 'denied':
        return 'Denied';
      case 'voided':
        return 'Voided';
      case 'draft':
        return 'Draft';
      default:
        return status || 'Draft';
    }
  };

  const stageBadgeClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'sent':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'signed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'voided':
        return 'bg-slate-200 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getSentStage = (recipients: RecipientRow[]): string => {
    const sorted = [...recipients].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const pendingIndex = sorted.findIndex((r) => r.status !== 'signed' && r.status !== 'reviewed' && r.status !== 'denied');
    if (pendingIndex < 0 || !recipients.length) return '';
    const pending = sorted[pendingIndex];
    const role = (pending.role || '').trim();
    if (role === 'Team Approval') return 'Team Lead';
    if (role === 'Technical Team') return 'Technical';
    if (role === 'Legal Team') return 'Legal';
    if (role === 'Deal Desk') return 'Deal Desk';
    const roleLower = role.toLowerCase();
    if (role && roleLower !== 'signer' && roleLower !== 'reviewer') return role;
    return (pending.name || '').trim() || (pending.email || '').trim() || 'Pending signer';
  };

  const firstDraftId = documents.find((d) => d.status === 'draft')?.id;


  return (
    <div className="min-h-screen bg-slate-50/80 py-5 sm:py-6 px-4 sm:px-6 lg:px-8 w-full">
      {reminderToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3.5 max-w-sm animate-in slide-in-from-bottom-2 duration-200">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Reminder sent</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              A reminder email with the signing link was sent to{' '}
              <span className="font-medium text-slate-700">
                {reminderToast.recipients.join(', ')}
              </span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReminderToast(null)}
            className="shrink-0 text-slate-400 hover:text-slate-600 mt-0.5"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="w-full">
        <div className="mb-4 sm:mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link to="/deal" className="text-sm text-slate-500 hover:text-slate-800 mb-1.5 inline-block">
              ← Back to Deal
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manual e-sign</h1>
            <p className="text-slate-500 mt-0.5 text-sm">Upload agreements and send them for signature</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (landingTourTimeoutRef.current) {
                window.clearTimeout(landingTourTimeoutRef.current);
                landingTourTimeoutRef.current = null;
              }
              landingTourAutoStartedRef.current = true;
              startEsignLandingTour(documents.some((d) => d.status === 'draft'));
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
            Guide
          </button>
        </div>

        {/* Add documents — DocuSign-style drag-and-drop area */}
        <div id="esign-tour-upload" className="bg-white rounded-xl border border-slate-200/90 shadow-sm mb-4 scroll-mt-24 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Add documents</h2>
          </div>
          <div className="p-5">
            {uploadedDocumentId ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center shrink-0" aria-hidden>
                  <FileText className="h-6 w-6 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate" title={uploadedDocumentName}>
                    {uploadedDocumentName || 'Uploaded document'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                      <Check className="h-3.5 w-3.5" /> Uploaded
                    </span>
                    {formatBytes(uploadedFileSize) && (
                      <>
                        <span>·</span>
                        <span>{formatBytes(uploadedFileSize)}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>PDF</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveUploadedFile}
                  disabled={removingUpload}
                  title="Remove this file"
                  aria-label="Remove uploaded file"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 bg-white text-slate-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50 shrink-0"
                >
                  {removingUpload ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-3 py-12 px-6 ${
                  dragActive
                    ? 'border-violet-500 bg-violet-50/60'
                    : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <div className="w-14 h-14 rounded-xl bg-slate-200/70 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-slate-500" />
                </div>
                <p className="text-sm text-slate-600">Drag a document here or</p>
                <label className="inline-flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold cursor-pointer hover:bg-violet-700 disabled:opacity-50 shadow-sm">
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      Uploading…
                    </>
                  ) : (
                    'Upload'
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
            )}
            {uploadError && (
              <p className="mt-3 text-sm text-red-600">{uploadError}</p>
            )}
          </div>
        </div>

        {uploadedDocumentId && (
          <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm mb-4 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900">Add a recipient</h2>
                {uploadedDocumentName && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">For {uploadedDocumentName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCancelAddRecipients}
                className="text-slate-400 hover:text-slate-600 p-1"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={signingOrderEnabled}
                  onChange={(e) => setSigningOrderEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm font-medium text-slate-700">Set signing order</span>
                <span className="text-xs text-slate-500">
                  {signingOrderEnabled ? '(Recipients sign sequentially)' : '(All recipients sign simultaneously)'}
                </span>
              </label>

              <div className="space-y-3">
                {recipientInputs.map((r, index) => {
                  const colors = [
                    'border-l-teal-400',
                    'border-l-sky-400',
                    'border-l-amber-400',
                    'border-l-rose-400',
                    'border-l-violet-400',
                  ];
                  const colorClass = colors[index % colors.length];
                  return (
                    <div
                      key={index}
                      className={`bg-slate-50/40 border border-slate-200 rounded-lg border-l-4 ${colorClass} p-4`}
                    >
                      <div className="flex items-start gap-3">
                        {signingOrderEnabled && (
                          <span className="mt-7 inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-bold shrink-0">
                            {index + 1}
                          </span>
                        )}
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Name <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                              <input
                                type="text"
                                value={r.name}
                                onChange={(e) => updateRecipientInput(index, 'name', e.target.value)}
                                placeholder="Name"
                                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Email <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="email"
                              value={r.email}
                              onChange={(e) => updateRecipientInput(index, 'email', e.target.value)}
                              placeholder="Email"
                              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none bg-white"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRecipientInput(index)}
                          disabled={recipientInputs.length <= 1}
                          className="mt-7 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={addRecipientInput}
                  className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Users className="h-4 w-4" />
                  Add Recipient
                </button>
                <button
                  type="button"
                  onClick={handleSaveRecipientsAndContinue}
                  disabled={savingRecipients}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 shadow-sm"
                >
                  {savingRecipients ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Next
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Draft documents — drafts only; sent/completed are tracked on the e-sign status page */}
        <div id="esign-tour-documents" className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden scroll-mt-24">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">Draft documents</h2>
            <Link to="/esign-tracking" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              View sent &amp; completed →
            </Link>
          </div>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              {!normalizeEmail(user?.email) ? (
                <>
                  <p>Sign in to see your documents.</p>
                  <p className="text-sm mt-1">Your e-sign agreements are shown for the account you&apos;re logged in with.</p>
                </>
              ) : (
                <>
                  <p>No drafts in progress.</p>
                  <p className="text-sm mt-1">Upload a PDF to start, or check <Link to="/esign-tracking" className="text-indigo-600 hover:text-indigo-700 font-medium">e-sign status</Link> for sent &amp; completed agreements.</p>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed min-w-[580px] divide-y divide-slate-200">
                <colgroup>
                  <col style={{ width: '55%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 sm:px-5 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Document</th>
                    <th scope="col" className="px-3 sm:px-4 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Stage</th>
                    <th scope="col" className="px-4 sm:px-5 py-2.5 text-right text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {documents.map((doc) => {
                    const createdAtLine = formatEsignCreatedAtLine(doc);
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/50">
                        <td className="px-4 sm:px-5 py-3 align-top min-w-0">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                              <FileText className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-900 text-sm truncate block" title={doc.file_name}>
                                {doc.file_name}
                              </span>
                              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                {formatEsignCreatedByLine(doc)}
                              </p>
                              {createdAtLine ? (
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{createdAtLine}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 align-top">
                          <div className="flex flex-col gap-0.5">
                            {doc.status === 'sent' && getSentStage(doc.recipients || []) ? (
                              <>
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${stageBadgeClass(doc.status)}`}
                                >
                                  {getSentStage(doc.recipients || [])}
                                </span>
                                <span className="text-xs text-slate-500">Sent</span>
                              </>
                            ) : (
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${stageBadgeClass(doc.status)}`}
                              >
                                {statusLabel(doc.status)}
                              </span>
                            )}
                            {(doc.status === 'denied' || doc.status === 'voided') &&
                              (() => {
                                const withComment = (doc.recipients || []).find((r) => r.comment);
                                return withComment ? (
                                  <p className="text-xs text-slate-600 mt-1.5 max-w-xs truncate" title={withComment.comment || undefined}>
                                    Comment: {withComment.comment}
                                  </p>
                                ) : null;
                              })()}
                          </div>
                        </td>
                        <td className="px-4 sm:px-5 py-3 align-top">
                          <div className="flex flex-nowrap items-center justify-end gap-2">
                            {doc.status === 'draft' && (
                              <Link
                                id={doc.id === firstDraftId ? 'esign-tour-place-fields' : undefined}
                                to={`/esign/${doc.id}/place-fields`}
                                className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                              >
                                <PenLine className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                Place fields
                              </Link>
                            )}
                            {(doc.status === 'sent' ||
                              doc.status === 'completed' ||
                              doc.status === 'voided' ||
                              doc.status === 'denied' ||
                              doc.status === 'signed') && (
                              <button
                                type="button"
                                onClick={() => openStatusModal(doc.id)}
                                className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                              >
                                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                                View status
                              </button>
                            )}
                            {doc.status === 'sent' && isEsignDocumentForCurrentUser(doc, user?.email) && (
                              <button
                                type="button"
                                onClick={() => handleSendReminder(doc.id)}
                                disabled={remindingDocId === doc.id}
                                title={remindedDocId === doc.id ? 'Reminder sent!' : 'Send reminder'}
                                aria-label={remindedDocId === doc.id ? 'Reminder sent' : 'Send reminder'}
                                className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border bg-white shrink-0 transition-colors ${
                                  remindedDocId === doc.id
                                    ? 'border-emerald-300 text-emerald-600'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {remindingDocId === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : remindedDocId === doc.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Bell className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {doc.status === 'sent' && (
                              <button
                                type="button"
                                onClick={() => handleCopySigningLink(doc.id)}
                                disabled={copyingDocId === doc.id}
                                title={copiedDocId === doc.id ? 'Link copied!' : 'Copy signing link'}
                                aria-label={copiedDocId === doc.id ? 'Link copied' : 'Copy signing link'}
                                className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border bg-white shrink-0 transition-colors ${
                                  copiedDocId === doc.id
                                    ? 'border-emerald-300 text-emerald-600'
                                    : 'border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {copyingDocId === doc.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : copiedDocId === doc.id ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (openActionsId === doc.id) {
                                    closeActionsMenu();
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setDropdownPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 180) });
                                    setOpenActionsId(doc.id);
                                  }
                                }}
                                className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 shrink-0"
                                title="Actions"
                                aria-expanded={openActionsId === doc.id}
                              >
                                <MoreVertical className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {openActionsId &&
        dropdownPosition &&
        (() => {
          const openDoc = documents.find((d) => d.id === openActionsId);
          if (!openDoc) return null;
          const isCreator = isEsignDocumentForCurrentUser(openDoc, user?.email);
          const st = (openDoc.status || '').toLowerCase();
          const showVoid = st === 'sent' && isCreator;
          const showDownload = st === 'signed' || st === 'completed';
          const showDelete = (st === 'voided' && isCreator) || (st === 'draft' && isCreator);
          return createPortal(
            <>
              <div className="fixed inset-0 z-40" aria-hidden onClick={closeActionsMenu} />
              <div
                className="fixed z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                onClick={(e) => e.stopPropagation()}
              >
                {showVoid && (
                  <button
                    type="button"
                    onClick={() => {
                      handleVoid(openDoc.id);
                      closeActionsMenu();
                    }}
                    disabled={voidingId === openDoc.id}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {voidingId === openDoc.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                    Void
                  </button>
                )}
                {showDownload && (
                  <a
                    href={`${BACKEND_URL}/api/esign/documents/${openDoc.id}/file?attachment=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    onClick={closeActionsMenu}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 shrink-0" />
                    Download
                  </a>
                )}
                {showDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(openDoc.id);
                      closeActionsMenu();
                    }}
                    disabled={deletingId === openDoc.id}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === openDoc.id ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 shrink-0" />
                    )}
                    Delete
                  </button>
                )}
              </div>
            </>,
            document.body
          );
        })()}

      {/* View status modal */}
      {statusModalId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeStatusModal}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {statusModalLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              </div>
            ) : statusModalDoc ? (
              (() => {
                const signers = statusModalRecipients.filter((r) => !isStatusModalReviewer(r));
                const reviewers = statusModalRecipients.filter((r) => isStatusModalReviewer(r));
                const signedCount = signers.filter((r) => (r.status || '').toLowerCase() === 'signed').length;
                const docStatus = (statusModalDoc.status || '').toLowerCase();
                const isCompleted = docStatus === 'completed' || (signers.length > 0 && signedCount === signers.length);
                const isVoided = docStatus === 'voided';
                const isDenied = docStatus === 'denied';
                const sentDate = statusModalDoc.sent_at || statusModalDoc.created_at;

                const statusBadge = isCompleted
                  ? { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700' }
                  : isDenied
                    ? { label: 'Denied', cls: 'bg-red-100 text-red-700' }
                    : isVoided
                      ? { label: 'Voided', cls: 'bg-slate-200 text-slate-600' }
                      : docStatus === 'sent'
                        ? { label: 'Sent', cls: 'bg-emerald-100 text-emerald-700' }
                        : { label: 'Pending', cls: 'bg-amber-100 text-amber-700' };

                const activeTab: 'signers' | 'reviewers' =
                  reviewers.length === 0 ? 'signers' : statusModalTab;

                const renderRow = (rec: StatusModalRecipient, index: number, kind: 'signer' | 'reviewer') => {
                  const recStatus = (rec.status || '').toLowerCase();
                  const isSigned = recStatus === 'signed';
                  const isViewed = recStatus === 'reviewed';
                  const isDeniedRow = recStatus === 'denied';
                  const initials = statusModalInitials(rec.name, rec.email);
                  const avatarCls = statusModalAvatarColor(rec.email || rec.name || rec.id);
                  const totalRecipients = (kind === 'signer' ? signers : reviewers).length;
                  const zebra = totalRecipients >= 3 && index % 2 === 1 ? 'bg-slate-50' : 'bg-white';
                  const isCopied = statusModalCopiedRecipientId === rec.id;
                  const isCopying = statusModalCopyingRecipientId === rec.id;
                  const showCopy = kind === 'signer'
                    ? !isSigned && !isDeniedRow && !!rec.signing_token
                    : !!rec.signing_token;

                  let badge: { label: string; cls: string; icon: React.ReactNode };
                  if (kind === 'signer') {
                    if (isSigned) badge = { label: 'Signed', cls: 'bg-emerald-100 text-emerald-700', icon: <Check className="h-3.5 w-3.5" /> };
                    else if (isDeniedRow) badge = { label: 'Denied', cls: 'bg-red-100 text-red-700', icon: <XCircle className="h-3.5 w-3.5" /> };
                    else badge = { label: 'Pending', cls: 'bg-amber-100 text-amber-700', icon: <Clock className="h-3.5 w-3.5" /> };
                  } else {
                    if (isViewed) badge = { label: 'Viewed', cls: 'bg-sky-100 text-sky-700', icon: <Eye className="h-3.5 w-3.5" /> };
                    else badge = { label: 'Not viewed', cls: 'bg-amber-100 text-amber-700', icon: <Clock className="h-3.5 w-3.5" /> };
                  }

                  return (
                    <div key={rec.id} className={`flex items-center gap-3 px-3 py-3 rounded-lg ${zebra}`}>
                      <div className={`flex items-center justify-center w-9 h-9 rounded-full text-white text-xs font-semibold shrink-0 ${avatarCls}`}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{rec.name || rec.email || (kind === 'signer' ? 'Signer' : 'Reviewer')}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {kind === 'signer'
                            ? `Signer ${index + 1}`
                            : 'Reviewer · view only'}
                          {rec.email ? ` · ${rec.email}` : ''}
                        </p>
                        {rec.comment && (
                          <p className="mt-1 text-xs text-slate-600 bg-slate-100 rounded-md px-2 py-1 border border-slate-200">
                            <span className="font-medium text-slate-500">Comment: </span>{rec.comment}
                          </p>
                        )}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0 ${badge.cls}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                      {showCopy && (
                        <button
                          type="button"
                          onClick={() => handleCopyRecipientLink(rec.id, rec.signing_token)}
                          disabled={isCopying}
                          title={isCopied ? 'Link copied!' : kind === 'signer' ? 'Copy signing link' : 'Copy review link'}
                          aria-label={isCopied ? 'Link copied' : kind === 'signer' ? 'Copy signing link' : 'Copy review link'}
                          className={`inline-flex items-center gap-1 px-2 h-8 rounded-md border text-xs font-medium shrink-0 transition-colors ${
                            isCopied
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {isCopying ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                };

                return (
                  <>
                    {/* Header */}
                    <div className="px-6 pt-5 pb-4 border-b border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-slate-900 truncate">{statusModalDoc.file_name}</p>
                          {sentDate && (
                            <p className="text-xs text-slate-500 mt-0.5">Sent {formatEsignDateTime(sentDate)}</p>
                          )}
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                          <button type="button" onClick={closeStatusModal} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
                            <XCircle className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                      {signers.length > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-600 mb-1">
                            <span>{signedCount} of {signers.length} signed</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${signers.length > 0 ? (signedCount / signers.length) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tabs */}
                    <div className="px-6 pt-3 border-b border-slate-200 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setStatusModalTab('signers')}
                        className={`relative px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 ${
                          activeTab === 'signers' ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span>Signers</span>
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{signers.length}</span>
                        {activeTab === 'signers' && (
                          <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />
                        )}
                      </button>
                      {reviewers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setStatusModalTab('reviewers')}
                          className={`relative px-3 py-2 text-sm font-semibold inline-flex items-center gap-2 ${
                            activeTab === 'reviewers' ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <span>Reviewers</span>
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{reviewers.length}</span>
                          {activeTab === 'reviewers' && (
                            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-indigo-600 rounded-full" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Body */}
                    <div className="px-4 py-4 overflow-y-auto flex-1 space-y-1.5">
                      {activeTab === 'signers' ? (
                        signers.length === 0 ? (
                          <p className="text-sm text-slate-500 px-3 py-6 text-center">No signers on this document.</p>
                        ) : (
                          signers.map((rec, idx) => renderRow(rec, idx, 'signer'))
                        )
                      ) : reviewers.length === 0 ? (
                        <p className="text-sm text-slate-500 px-3 py-6 text-center">No reviewers on this document.</p>
                      ) : (
                        reviewers.map((rec, idx) => renderRow(rec, idx, 'reviewer'))
                      )}

                      {isCompleted && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="text-sm font-medium text-emerald-800">All recipients have signed. Document is complete.</span>
                        </div>
                      )}
                      {isDenied && (
                        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                          <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                          <span className="text-sm font-medium text-red-800">This document was denied by a recipient.</span>
                        </div>
                      )}
                      {isVoided && (
                        <div className="mt-3 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2.5">
                          <p className="text-sm font-medium text-slate-700">This document was voided. Signing links no longer work.</p>
                          {statusModalDoc.void_reason && (
                            <p className="mt-1.5 text-xs text-slate-600">
                              <span className="font-semibold text-slate-700">Reason:</span> {statusModalDoc.void_reason}
                            </p>
                          )}
                          {(statusModalDoc.voided_by || statusModalDoc.voided_at) && (
                            <p className="mt-1 text-xs text-slate-500">
                              {statusModalDoc.voided_by ? <>Voided by <span className="text-slate-700">{statusModalDoc.voided_by}</span></> : null}
                              {statusModalDoc.voided_by && statusModalDoc.voided_at ? ' · ' : ''}
                              {statusModalDoc.voided_at ? formatEsignDateTime(statusModalDoc.voided_at) : ''}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleStatusModalPreview}
                        className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50"
                      >
                        <Eye className="h-4 w-4" />
                        Preview document
                      </button>
                      <div className="flex items-center gap-2">
                        {isCompleted ? (
                          <button
                            type="button"
                            onClick={handleStatusModalDownload}
                            disabled={statusModalDownloading}
                            className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {statusModalDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download signed PDF
                          </button>
                        ) : docStatus === 'sent' ? (
                          <button
                            type="button"
                            onClick={() => { void handleVoid(statusModalDoc.id); }}
                            disabled={voidingId === statusModalDoc.id}
                            className="inline-flex items-center gap-2 px-3.5 py-2 border border-red-300 text-red-700 bg-white rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
                          >
                            {voidingId === statusModalDoc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Void
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={closeStatusModal}
                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="p-6">
                <p className="text-slate-500">Could not load status.</p>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={closeStatusModal} className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EsignDocumentsPage;
