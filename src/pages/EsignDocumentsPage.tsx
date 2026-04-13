import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import { Upload, FileText, Loader2, PenLine, Download, Trash2, ExternalLink, Check, Clock, XCircle, Eye, MoreVertical, BookOpen, Lock } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import { shouldAutoStartLandingTour, startEsignLandingTour } from '../utils/esignTour';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';

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
  status: string;
  order?: number;
  comment?: string | null;
}

interface StatusModalDoc {
  id: string;
  file_name: string;
  status: string;
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

  // Gate: eSign is only accessible after an approval workflow has been fully approved
  const { workflows: approvalWorkflows, isLoading: approvalLoading } = useApprovalWorkflows();
  const isEsignEnabled = approvalWorkflows.some((w) => w.status === 'approved');

  /** Returns the approval status for an eSign document by matching workflow.esignDocumentId */
  const getDocApprovalStatus = (docId: string): 'approved' | 'in_progress' | 'denied' | 'pending' | null => {
    const match = approvalWorkflows.find((w) => w.esignDocumentId === docId);
    if (!match) return null;
    return match.status as 'approved' | 'in_progress' | 'denied' | 'pending';
  };
  const [documents, setDocuments] = useState<EsignDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedBy, setUploadedBy] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<StatusModalRecipient[]>([]);
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
        const mine = email
          ? (data.agreements as EsignDocument[]).filter((d) => isEsignDocumentForCurrentUser(d, email))
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
      formData.append('uploaded_by', user?.email || uploadedBy || 'anonymous');
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

  const handleVoid = async (docId: string) => {
    if (!window.confirm('Void this document? Signing links will stop working. The document will stay in the list as voided.')) return;
    setVoidingId(docId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${docId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '' }),
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
  }, []);

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

  // Block access until at least one approval workflow has been fully approved
  if (!approvalLoading && !isEsignEnabled) {
    return (
      <div className="min-h-screen bg-slate-50/80 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-lg border border-slate-200 p-10">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Lock className="w-7 h-7 text-amber-500" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Approval Required</h2>
          <p className="text-slate-500 text-sm mb-6">
            e-Sign is only available after an approval workflow has been fully approved. Please complete
            the approval process first.
          </p>
          <button
            onClick={() => navigate('/approval')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Go to Approval
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80 py-5 sm:py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-4 sm:mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link to="/deal" className="text-sm text-slate-500 hover:text-slate-800 mb-1.5 inline-block">
              ← Back to Deal
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">e sign</h1>
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

        {/* Upload — compact card, no dead horizontal space */}
        <div id="esign-tour-upload" className="w-fit max-w-full bg-white rounded-xl border border-slate-200/90 shadow-sm p-4 sm:p-5 mb-4 scroll-mt-24">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <h2 className="text-base font-semibold text-slate-900 sm:shrink-0">Upload Document</h2>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 sm:px-5 bg-violet-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-violet-700 disabled:opacity-50 shadow-sm w-fit">
              <Upload className="h-5 w-5 shrink-0" />
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin shrink-0" />
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
            <p className="mt-3 text-sm text-red-600">{uploadError}</p>
          )}
        </div>

        {/* ── Ready for e-Sign section ── */}
        {(() => {
          const readyDocs = documents.filter(
            (d) => getDocApprovalStatus(d.id) === 'approved' && d.status === 'draft'
          );
          if (readyDocs.length === 0) return null;
          return (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-emerald-200 bg-emerald-100/60">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-emerald-900">
                    Ready for e-Sign
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                      {readyDocs.length}
                    </span>
                  </h2>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    These agreements have been approved — place signature fields to send for signing.
                  </p>
                </div>
              </div>

              {/* Cards */}
              <div className="divide-y divide-emerald-100">
                {readyDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-emerald-50 transition-colors">
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-emerald-600" />
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{formatEsignCreatedByLine(doc)}</p>
                    </div>

                    {/* Approved badge */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
                      <Check className="w-3 h-3" />
                      Approved
                    </span>

                    {/* CTA */}
                    <Link
                      to={`/esign/${doc.id}/place-fields`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shrink-0 shadow-sm"
                    >
                      <PenLine className="w-3.5 h-3.5 shrink-0" />
                      Place fields &amp; Send
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Your Documents — tighter table columns (fixed layout) */}
        <div id="esign-tour-documents" className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden scroll-mt-24">
          <h2 className="text-base font-semibold text-slate-900 px-4 sm:px-5 py-3 border-b border-slate-200">All Documents</h2>
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
                <p>No documents yet. Upload a PDF to get started.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed min-w-[580px] divide-y divide-slate-200">
                <colgroup>
                  <col style={{ width: '42%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 sm:px-5 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Document</th>
                    <th scope="col" className="px-3 sm:px-4 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Stage</th>
                    <th scope="col" className="px-3 sm:px-4 py-2.5 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Approval</th>
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
                        {/* Approval status column */}
                        <td className="px-3 sm:px-4 py-3 align-top">
                          {(() => {
                            const approvalStatus = getDocApprovalStatus(doc.id);
                            if (approvalStatus === 'approved') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3 shrink-0" />
                                  Approved
                                </span>
                              );
                            }
                            if (approvalStatus === 'in_progress') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  In Review
                                </span>
                              );
                            }
                            if (approvalStatus === 'pending') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  Pending
                                </span>
                              );
                            }
                            if (approvalStatus === 'denied') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                                  <XCircle className="w-3 h-3 shrink-0" />
                                  Denied
                                </span>
                              );
                            }
                            return <span className="text-xs text-slate-400">—</span>;
                          })()}
                        </td>
                        <td className="px-4 sm:px-5 py-3 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-2">
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
          const showViewLink = st === 'sent';
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
                {showViewLink && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/esign/${openDoc.id}/send`);
                      closeActionsMenu();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    View Link
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
            <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">e sign status</h2>
              <button type="button" onClick={closeStatusModal} className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10" aria-label="Close">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {statusModalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                </div>
              ) : statusModalDoc ? (
                <>
                  <p className="text-slate-700 font-medium truncate">{statusModalDoc.file_name}</p>
                  {statusModalDoc.status === 'denied' ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/90 text-white">Denied</span>
                  ) : statusModalDoc.status === 'voided' ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-200 text-slate-700">Voided</span>
                  ) : (statusModalDoc.status === 'sent' || statusModalDoc.status === 'completed') ? (
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800">Sent for signature</span>
                  ) : null}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Recipients</h3>
                    <ul className="space-y-2">
                      {statusModalRecipients.map((rec) => {
                        const statusLabel = rec.status === 'signed' ? 'Signed' : rec.status === 'reviewed' ? 'Reviewed' : rec.status === 'denied' ? 'Denied' : 'Pending';
                        const statusClass = rec.status === 'signed' ? 'text-emerald-600 font-medium' : rec.status === 'reviewed' ? 'text-amber-600 font-medium' : rec.status === 'denied' ? 'text-red-600 font-medium' : 'text-slate-500';
                        return (
                          <li key={rec.id} className="py-2 border-b border-slate-100 last:border-0">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-800">
                                {rec.name || rec.email || 'Signer'}{' '}
                                <span className="text-slate-400">({(rec.role || 'signer').toLowerCase()})</span>
                                {' — '}
                                <span className={statusClass}>{statusLabel}</span>
                              </span>
                              {rec.status === 'signed' ? <Check className="h-5 w-5 text-emerald-600 shrink-0" /> : rec.status === 'denied' ? <XCircle className="h-5 w-5 text-red-500 shrink-0" /> : rec.status === 'reviewed' ? <Check className="h-5 w-5 text-amber-600 shrink-0" /> : <Clock className="h-5 w-5 text-amber-500 shrink-0" />}
                            </div>
                            {rec.comment && (
                              <div className="mt-1.5 text-sm text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                                <span className="font-medium text-slate-500">Comment: </span>
                                {rec.comment}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {statusModalDoc.status === 'denied' && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 mt-4">
                      <XCircle className="h-5 w-5 text-red-600 shrink-0" />
                      <span className="font-medium text-red-800">This document was denied by a recipient.</span>
                    </div>
                  )}
                  {statusModalDoc.status === 'voided' && (
                    <div className="flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 mt-4">
                      <span className="font-medium text-slate-700">This document was voided. Signing links no longer work.</span>
                    </div>
                  )}
                  {['sent', 'signed', 'denied', 'voided'].includes(statusModalDoc.status) && (
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={handleStatusModalPreview}
                          className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
                        >
                          <Eye className="h-5 w-5" />
                          Preview document
                        </button>
                      </div>
                      {(statusModalDoc.status === 'sent' || statusModalDoc.status === 'signed') && (
                        <p className="text-xs text-slate-500">Shows the latest PDF on file, including any signatures applied so far.</p>
                      )}
                    </div>
                  )}
                  {statusModalDoc.status === 'completed' && (
                    <>
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mt-4">
                        <Check className="h-5 w-5 text-emerald-600 shrink-0" />
                        <span className="font-medium text-emerald-800">Done — All recipients have signed</span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-4">
                        <button
                          type="button"
                          onClick={handleStatusModalDownload}
                          disabled={statusModalDownloading}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {statusModalDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                          Download signed PDF
                        </button>
                        <button type="button" onClick={handleStatusModalPreview} className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">
                          <Eye className="h-5 w-5" />
                          Preview
                        </button>
                      </div>
                    </>
                  )}
                  {statusModalDoc.status === 'sent' && statusModalRecipients.length > 0 && (
                    <p className="text-sm text-slate-500 mt-4">Waiting for all recipients to sign.</p>
                  )}
                </>
              ) : (
                <p className="text-slate-500">Could not load status.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EsignDocumentsPage;
