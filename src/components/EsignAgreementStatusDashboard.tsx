import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Check, Clock, XCircle, Eye, PenLine, Download, MoreVertical, ThumbsUp, Calendar, Bell, CalendarClock, Send, MailCheck, CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, Forward, ChevronRight, ChevronDown, Lock, Search, Upload, Copy } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import Navigation from './Navigation';
import EditDatesModal from './EditDatesModal';

interface RecipientStatus {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  order?: number;
  comment?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  token_expires_at?: string | null;
  forwarded_to_name?: string | null;
  forwarded_to_email?: string | null;
  forwarded_at?: string | null;
  forward_count?: number;
  forwarded_from_name?: string | null;
  forwarded_from_email?: string | null;
}

interface ActivityEntry {
  action: string;
  actor?: string | null;
  timestamp: string;
  recipient?: string | null;
}

/** Tracking statuses surfaced in the UI. Delivered/Failed require the (deferred) SendGrid webhook. */
type TrackStatus =
  | 'queued' | 'sent' | 'delivered' | 'viewed'
  | 'signed' | 'reviewed' | 'waiting' | 'completed'
  | 'expired' | 'declined' | 'failed';

const TRACK_BADGE: Record<TrackStatus, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  queued:    { label: 'Queued',             cls: 'bg-slate-100 text-slate-600 border-slate-200',     Icon: Clock },
  sent:      { label: 'Sent',               cls: 'bg-blue-100 text-blue-700 border-blue-200',        Icon: Send },
  delivered: { label: 'Delivered',          cls: 'bg-cyan-100 text-cyan-700 border-cyan-200',        Icon: MailCheck },
  viewed:    { label: 'Viewed',             cls: 'bg-violet-100 text-violet-700 border-violet-200',  Icon: Eye },
  signed:    { label: 'Signed',             cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: Check },
  reviewed:  { label: 'Reviewed',           cls: 'bg-amber-100 text-amber-700 border-amber-200',     Icon: Check },
  waiting:   { label: 'Waiting for others', cls: 'bg-amber-100 text-amber-700 border-amber-200',     Icon: Clock },
  completed: { label: 'Completed',          cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  expired:   { label: 'Expired',            cls: 'bg-slate-200 text-slate-600 border-slate-300',     Icon: AlertCircle },
  declined:  { label: 'Declined',           cls: 'bg-red-100 text-red-700 border-red-200',           Icon: XCircle },
  failed:    { label: 'Failed',             cls: 'bg-red-100 text-red-700 border-red-200',           Icon: AlertTriangle },
};

/** Resolve a recipient's true tracking status, accounting for forwarding, expiry, and review vs sign. */
function deriveRecipientStatus(rec: RecipientStatus, docStatus: string): TrackStatus {
  const raw = (rec.status || 'pending').toLowerCase();
  if (raw === 'denied') return 'declined';
  if (raw === 'signed') return 'signed';
  if (raw === 'reviewed') return 'reviewed';
  const expired =
    docStatus !== 'completed' &&
    rec.token_expires_at != null &&
    new Date(rec.token_expires_at).getTime() < Date.now();
  if (expired) return 'expired';
  if (raw === 'viewed') return 'viewed';
  if (!rec.sent_at) return 'queued';
  return 'sent';
}

/** Most recent activity timestamp for a recipient (signed > viewed > sent). */
function recipientLastActivity(rec: RecipientStatus): string | null {
  return rec.signed_at || rec.viewed_at || rec.sent_at || null;
}

/** Maps an audit_logs action to a human label + icon for the activity timeline. */
function activityMeta(action: string): { label: string; Icon: React.ComponentType<{ className?: string }>; tone: string } {
  switch (action) {
    case 'uploaded':            return { label: 'Document uploaded', Icon: FileText, tone: 'text-slate-500' };
    case 'sent':                return { label: 'Sent for signature', Icon: Send, tone: 'text-blue-600' };
    case 'opened':              return { label: 'Opened', Icon: Eye, tone: 'text-violet-600' };
    case 'viewed':              return { label: 'Viewed by recipient', Icon: Eye, tone: 'text-violet-600' };
    case 'signed':              return { label: 'Signed', Icon: Check, tone: 'text-emerald-600' };
    case 'reviewed':            return { label: 'Reviewed', Icon: Check, tone: 'text-amber-600' };
    case 'sign_denied':         return { label: 'Declined to sign', Icon: XCircle, tone: 'text-red-600' };
    case 'review_denied':       return { label: 'Review denied', Icon: XCircle, tone: 'text-red-600' };
    case 'forwarded':           return { label: 'Forwarded', Icon: Forward, tone: 'text-purple-600' };
    case 'voided':              return { label: 'Voided', Icon: XCircle, tone: 'text-slate-500' };
    case 'manual_reminder_sent':return { label: 'Reminder sent', Icon: Bell, tone: 'text-amber-600' };
    case 'expiry_reminder_sent':return { label: 'Expiry reminder sent', Icon: Bell, tone: 'text-amber-600' };
    case 'expiry_extended':     return { label: 'Expiry extended', Icon: Clock, tone: 'text-slate-500' };
    default:                    return { label: action.replace(/_/g, ' '), Icon: Clock, tone: 'text-slate-500' };
  }
}

interface StatusModalDoc {
  id: string;
  file_name: string;
  status: string;
  sent_at?: string | null;
  signed_at?: string | null;
  upload_source?: string | null;
}

interface Agreement {
  id: string;
  file_name: string;
  uploaded_by?: string;
  upload_source?: string;
  creator_name?: string | null;
  creator_email?: string | null;
  /** Display name/email of who requested the agreement (approval workflow or from-approval). */
  requested_by?: string | null;
  created_at: string;
  sent_at?: string;
  signed_at?: string;
  voided_at?: string;
  status: string;
  recipients: RecipientStatus[];
}

type StatusFilterTab = 'all' | 'completed' | 'pending' | 'rejected';

/** Agreement-level live status derived from the document status + recipient progress. */
type AgreementTrack = 'sent' | 'viewed' | 'waiting' | 'completed' | 'declined' | 'voided' | 'expired';

const isDoneStatus = (s?: string) => ['signed', 'reviewed'].includes((s || '').toLowerCase());

function deriveAgreementStatus(ag: Agreement): AgreementTrack {
  const s = (ag.status || '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'voided') return 'voided';
  if (s === 'denied') return 'declined';
  const recs = ag.recipients || [];
  if (recs.some((r) => (r.status || '').toLowerCase() === 'denied')) return 'declined';
  const total = recs.length;
  const signed = recs.filter((r) => isDoneStatus(r.status)).length;
  if (total > 0 && signed >= total) return 'completed';
  if (signed > 0) return 'waiting';
  if (recs.some((r) => (r.status || '').toLowerCase() === 'viewed')) return 'viewed';
  const pending = recs.filter((r) => !isDoneStatus(r.status) && (r.status || '').toLowerCase() !== 'denied');
  if (pending.length > 0 && pending.every((r) => r.token_expires_at && new Date(r.token_expires_at).getTime() < Date.now())) {
    return 'expired';
  }
  return 'sent';
}

const AGREEMENT_BADGE: Record<AgreementTrack, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  sent:      { label: 'Sent',               cls: 'bg-blue-100 text-blue-700 border-blue-200',          Icon: Send },
  viewed:    { label: 'Viewed',             cls: 'bg-violet-100 text-violet-700 border-violet-200',    Icon: Eye },
  waiting:   { label: 'Waiting for others', cls: 'bg-amber-100 text-amber-700 border-amber-200',       Icon: Clock },
  completed: { label: 'Completed',          cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', Icon: CheckCircle2 },
  declined:  { label: 'Declined',           cls: 'bg-red-100 text-red-700 border-red-200',             Icon: XCircle },
  voided:    { label: 'Voided',             cls: 'bg-slate-200 text-slate-600 border-slate-300',       Icon: AlertCircle },
  expired:   { label: 'Expired',            cls: 'bg-slate-200 text-slate-600 border-slate-300',       Icon: AlertCircle },
};

function agreementProgress(ag: Agreement): { signed: number; total: number; nextPending: string | null } {
  const recs = ag.recipients || [];
  const total = recs.length;
  const signed = recs.filter((r) => isDoneStatus(r.status)).length;
  const next = [...recs]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .find((r) => !isDoneStatus(r.status) && (r.status || '').toLowerCase() !== 'denied');
  return { signed, total, nextPending: next ? (next.name || next.email || null) : null };
}

/** Human "5 mins ago" / "today at 2:40 PM" / "3 days ago" / "12 Mar". */
function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const diffMin = Math.floor((Date.now() - t) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  if (d.toDateString() === new Date().toDateString()) {
    return `today at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
  const diffDays = Math.floor(diffMin / 60 / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Most recent activity across recipients + document, with a label for the dashboard. */
function agreementLastActivity(ag: Agreement): { label: string; iso: string | null } {
  let latest: { iso: string; label: string } | null = null;
  const consider = (iso: string | null | undefined, label: string) => {
    if (!iso) return;
    if (!latest || new Date(iso).getTime() > new Date(latest.iso).getTime()) latest = { iso, label };
  };
  (ag.recipients || []).forEach((r) => {
    consider(r.signed_at, 'Signed');
    consider(r.viewed_at, 'Viewed');
    consider(r.sent_at, 'Sent');
  });
  consider(ag.signed_at, ag.status === 'completed' ? 'Completed' : 'Signed');
  consider(ag.voided_at, 'Voided');
  consider(ag.sent_at, 'Sent');
  if (!latest) return { label: '', iso: null };
  return { label: (latest as { iso: string; label: string }).label, iso: (latest as { iso: string; label: string }).iso };
}

function formatEsignCreatedByLine(ag: Agreement): string {
  const parts = [ag.creator_name, ag.creator_email].filter((x) => x && String(x).trim());
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

function formatEsignCreatedAtLine(ag: Agreement): string | null {
  const when = formatEsignDateTime(ag.created_at);
  return when ? `Created ${when}` : null;
}

const EsignAgreementStatusDashboard: React.FC = () => {
  const { user } = useAuth();
  const userIsApprovalAdmin = Boolean((user as any)?.isApprovalAdmin);
  const [activeTab, setActiveTab] = useState<StatusFilterTab>('all');
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<RecipientStatus[]>([]);
  const [statusModalActivity, setStatusModalActivity] = useState<ActivityEntry[]>([]);
  const [statusModalLoading, setStatusModalLoading] = useState(false);
  const [statusModalRefreshing, setStatusModalRefreshing] = useState(false);
  const [statusModalDownloading, setStatusModalDownloading] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [dateFilter, setDateFilter] = useState<{ type: 'none' } | { type: 'dateRange'; from: string; to: string }>({ type: 'none' });
  const [editDatesAgreementId, setEditDatesAgreementId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; file_name: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const closeActionsMenu = useCallback(() => {
    setOpenActionsId(null);
    setDropdownPosition(null);
  }, []);

  /** Fetch the agreement list. `silent` skips the full-page spinner for background polls. */
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/agreement-status`);
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      if (!contentType.includes('application/json')) {
        if (!silent) {
          setError('Backend returned an unexpected response. Ensure the API server is running (e.g. node server.cjs on port 3001) and restart it after code changes.');
          setAgreements([]);
        }
        return;
      }
      let data: { success?: boolean; agreements?: Agreement[] };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (!silent) {
          setError('Invalid response from server. Restart the backend server and try again.');
          setAgreements([]);
        }
        return;
      }
      if (data.success && Array.isArray(data.agreements)) {
        setAgreements(data.agreements);
        setError(null);
      } else if (!silent) {
        setAgreements([]);
        if (!res.ok) setError((data as { error?: string }).error || `Request failed (${res.status})`);
      }
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : 'Failed to load. Is the backend server running?');
        setAgreements([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Live dashboard: silently refresh the list every 12s so statuses stay current without a popup.
  useEffect(() => {
    const id = window.setInterval(() => { fetchStatus(true); }, 12000);
    return () => window.clearInterval(id);
  }, [fetchStatus]);

  // Fetch the PDF as a blob so it renders inline regardless of cross-origin iframe restrictions.
  useEffect(() => {
    if (!previewDoc) { setPreviewUrl(null); setPreviewError(null); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/esign/documents/${previewDoc.id}/file?inline=1`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setPreviewError(e instanceof Error ? e.message : 'Failed to load document');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewDoc]);

  const toDate = (s: string | undefined): Date | null => (s ? new Date(s) : null);
  const getAgreementRelevantDate = (ag: Agreement): Date | null => {
    if (ag.status === 'completed') return toDate(ag.signed_at) || toDate(ag.created_at);
    if (ag.status === 'draft' || ag.status === 'sent') return toDate(ag.sent_at) || toDate(ag.created_at);
    if (ag.status === 'voided' || ag.status === 'denied') return toDate(ag.voided_at) || toDate(ag.created_at);
    return toDate(ag.created_at);
  };

  const applyDateFilter = (list: Agreement[]): Agreement[] => {
    if (dateFilter.type === 'none') return list;
    const inRange = (d: Date) => {
      const t = d.getTime();
      if (dateFilter.type === 'dateRange' && dateFilter.from && dateFilter.to) {
        const from = new Date(dateFilter.from);
        const to = new Date(dateFilter.to);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        return t >= from.getTime() && t <= to.getTime();
      }
      return true;
    };
    return list.filter((ag) => {
      const d = getAgreementRelevantDate(ag);
      return d && inRange(d);
    });
  };

  /** This page tracks sent workflows only; drafts belong on the main e sign page. */
  const agreementsSentOrBeyond = agreements.filter((ag) => ag.status !== 'draft');

  const applySearchFilter = (list: Agreement[]): Agreement[] => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((ag) => {
      const haystack = [
        ag.file_name,
        ag.creator_name,
        ag.creator_email,
        ag.requested_by,
        ag.uploaded_by,
        ag.id,
        ...(ag.recipients || []).flatMap((r) => [r.name, r.email]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  };

  const dateFilteredAgreements = applySearchFilter(applyDateFilter(agreementsSentOrBeyond));

  const filterAgreementsByTab = (list: Agreement[]): Agreement[] => {
    switch (activeTab) {
      case 'completed':
        return list.filter((ag) => ag.status === 'completed');
      case 'pending':
        return list.filter((ag) => ag.status === 'sent' || ag.status === 'signed');
      case 'rejected':
        return list.filter((ag) => ag.status === 'denied' || ag.status === 'voided');
      default:
        return list;
    }
  };

  const filteredAgreements = filterAgreementsByTab(dateFilteredAgreements);
  const tabCounts = {
    all: dateFilteredAgreements.length,
    completed: dateFilteredAgreements.filter((ag) => ag.status === 'completed').length,
    pending: dateFilteredAgreements.filter((ag) => ag.status === 'sent' || ag.status === 'signed').length,
    rejected: dateFilteredAgreements.filter((ag) => ag.status === 'denied' || ag.status === 'voided').length
  };

  const handleDownload = (id: string, fileName: string) => {
    const url = `${BACKEND_URL}/api/esign/documents/${id}/file?attachment=1`;
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'document.pdf';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /** Fetch doc + recipients + activity for a given agreement. Used by open + auto-poll. */
  const loadStatusModalData = useCallback(async (agreementId: string) => {
    const [docRes, recRes, actRes] = await Promise.all([
      fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}`),
      fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/recipients`),
      fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/activity`),
    ]);
    const docData = await docRes.json();
    const recData = await recRes.json();
    const actData = await actRes.json().catch(() => ({ success: false }));
    if (docData.success && docData.document) {
      setStatusModalDoc({ id: docData.document.id || agreementId, file_name: docData.document.file_name, status: docData.document.status, sent_at: docData.document.sent_at, signed_at: docData.document.signed_at, upload_source: docData.document.upload_source });
    }
    if (recData.success && Array.isArray(recData.recipients)) {
      const sorted = [...recData.recipients].sort((a: RecipientStatus, b: RecipientStatus) => ((a.order ?? 999) - (b.order ?? 999)));
      setStatusModalRecipients(sorted);
    }
    if (actData.success && Array.isArray(actData.activity)) {
      setStatusModalActivity(actData.activity);
    }
  }, []);

  const openStatusModal = useCallback(async (agreementId: string) => {
    setStatusModalId(agreementId);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalActivity([]);
    setStatusModalLoading(true);
    try {
      await loadStatusModalData(agreementId);
    } catch {
      setStatusModalDoc(null);
      setStatusModalRecipients([]);
    } finally {
      setStatusModalLoading(false);
    }
  }, [loadStatusModalData]);

  const closeStatusModal = useCallback(() => {
    setStatusModalId(null);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalActivity([]);
  }, []);

  // Auto-poll the open status modal every 10s so tracking stays near real-time.
  useEffect(() => {
    if (!statusModalId) return;
    const id = window.setInterval(async () => {
      setStatusModalRefreshing(true);
      try {
        await loadStatusModalData(statusModalId);
      } catch { /* keep last good data */ }
      finally { setStatusModalRefreshing(false); }
    }, 10000);
    return () => window.clearInterval(id);
  }, [statusModalId, loadStatusModalData]);

  const handleStatusModalDownload = async () => {
    if (!statusModalId || !statusModalDoc) return;
    setStatusModalDownloading(true);
    try {
      handleDownload(statusModalId, statusModalDoc.file_name);
    } finally {
      setStatusModalDownloading(false);
    }
  };

  const handleCopyLink = async (agreementId: string) => {
    if (copyingId) return;
    setCopyingId(agreementId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/recipients`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not fetch signing link.');
        return;
      }
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];
      // Prefer the recipient who still needs to act (pending/viewed), else any with a token.
      const target =
        recipients.find((r: { signing_token?: string | null; status?: string }) =>
          r.signing_token && (r.status === 'pending' || r.status === 'viewed' || !r.status)
        ) || recipients.find((r: { signing_token?: string | null }) => r.signing_token);
      if (!target?.signing_token) {
        alert('No active signing link is available for this agreement.');
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
      setCopyToast(true);
      window.setTimeout(() => setCopyToast(false), 3000);
    } catch {
      alert('Could not copy signing link.');
    } finally {
      setCopyingId(null);
    }
  };

  const handleCancelSigning = async (agreementId: string, fileName?: string) => {
    const docLabel = fileName ? `"${fileName}"` : 'this agreement';
    const reason = window.prompt(
      `Cancel signing for ${docLabel}?\n\nAll pending signing links will stop working immediately. Enter a reason (recorded for audit purposes):`,
      ''
    );
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      alert('Please enter a reason for cancelling.');
      return;
    }
    setCancelingId(agreementId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '', void_reason: `Signing cancelled: ${trimmed}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchStatus();
        if (statusModalId === agreementId) closeStatusModal();
      } else {
        alert(data.error || `Cancel failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Failed to cancel signing.');
    } finally {
      setCancelingId(null);
    }
  };

  const handleRemind = async (agreementId: string, fileName?: string) => {
    const docLabel = fileName ? `"${fileName}"` : 'this agreement';
    if (!window.confirm(`Send a reminder email to all pending recipients for ${docLabel}?`)) return;
    setRemindingId(agreementId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert(data.message || 'Reminder sent.');
      } else {
        alert(data.error || `Reminder failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Failed to send reminder.');
    } finally {
      setRemindingId(null);
    }
  };

  const handleExtendExpiry = async (agreementId: string, fileName?: string) => {
    const docLabel = fileName ? `"${fileName}"` : 'this agreement';
    const input = window.prompt(
      `Extend expiry for pending recipients on ${docLabel}.\n\nHow many days from today should the new links be valid?\n(Whole number between 1 and 90)`,
      '15'
    );
    if (input === null) return;
    const days = parseInt(input.trim(), 10);
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      alert('Please enter a whole number between 1 and 90.');
      return;
    }
    setExtendingId(agreementId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/extend-expiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_email: user?.email || '', days }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert(data.message || `Expiry extended by ${days} day${days === 1 ? '' : 's'} and reminder emails sent to pending recipients.`);
      } else {
        alert(data.error || `Extend expiry failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Failed to extend expiry.');
    } finally {
      setExtendingId(null);
    }
  };

  const isCurrentUserCreator = (ag: Agreement): boolean => {
    const me = (user?.email || '').trim().toLowerCase();
    if (!me) return false;
    const creator = (ag.uploaded_by || ag.creator_email || '').trim().toLowerCase();
    return creator !== '' && creator === me;
  };

  const handleStatusModalPreview = () => {
    if (!statusModalId || !statusModalDoc) return;
    setPreviewDoc({ id: statusModalId, file_name: statusModalDoc.file_name });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation currentTab="esign-tracking" />

      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!loading && !error && agreementsSentOrBeyond.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 mb-6 p-4 rounded-xl border border-slate-200 bg-white/80">
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">Filter by date</span>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                From
                <input
                  type="date"
                  value={dateFilter.type === 'dateRange' ? dateFilter.from : ''}
                  onChange={(e) => {
                    const from = e.target.value;
                    setDateFilter((prev) => ({
                      type: 'dateRange',
                      from,
                      to: prev.type === 'dateRange' ? prev.to : from
                    }));
                  }}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                To
                <input
                  type="date"
                  value={dateFilter.type === 'dateRange' ? dateFilter.to : ''}
                  onChange={(e) => {
                    const to = e.target.value;
                    setDateFilter((prev) => ({
                      type: 'dateRange',
                      from: prev.type === 'dateRange' ? prev.from : to,
                      to
                    }));
                  }}
                  className="w-44 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              {(dateFilter.type === 'dateRange' && (dateFilter.from || dateFilter.to)) && (
                <button
                  type="button"
                  onClick={() => setDateFilter({ type: 'none' })}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Clear filter
                </button>
              )}
              <div className="relative ml-auto w-full sm:flex-1 sm:min-w-[20rem] sm:max-w-3xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by deal / quote ID / client / requester…"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              </div>
            )}

            {error && !loading && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-center mx-6 mt-6">
                {error}
              </div>
            )}

            {!loading && !error && agreements.length === 0 && (
              <div className="text-center py-16 px-6">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">No agreements yet</p>
                <p className="text-slate-500 text-sm mt-1">Upload a document and send for signature to see status here.</p>
                <Link to="/esign" className="inline-block mt-4 text-indigo-600 hover:text-indigo-700 font-medium text-sm">Go to e sign →</Link>
              </div>
            )}

            {!loading && !error && agreements.length > 0 && agreementsSentOrBeyond.length === 0 && (
              <div className="text-center py-16 px-6">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600 font-medium">Nothing sent for signature yet</p>
                <p className="text-slate-500 text-sm mt-1">Drafts stay on the e sign page. After you send a document, it will appear here.</p>
                <Link to="/esign" className="inline-block mt-4 text-indigo-600 hover:text-indigo-700 font-medium text-sm">Go to e sign →</Link>
              </div>
            )}

            {!loading && !error && agreementsSentOrBeyond.length > 0 && (
              <>
                <div className="border-b border-slate-200 px-6">
                  <nav className="flex gap-1" aria-label="Status filter">
                    {([
                      { id: 'all' as const, label: 'All' },
                      { id: 'completed' as const, label: 'Completed' },
                      { id: 'pending' as const, label: 'Pending' },
                      { id: 'rejected' as const, label: 'Rejected' }
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                          activeTab === tab.id
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {tab.label}
                        <span className="ml-1.5 text-slate-400 font-normal">({tabCounts[tab.id]})</span>
                      </button>
                    ))}
                  </nav>
                </div>
                {filteredAgreements.length === 0 ? (
                  <div className="text-center py-16 px-6">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">
                      No {activeTab === 'completed' ? 'completed' : activeTab === 'pending' ? 'pending' : 'rejected'} agreements
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      {activeTab === 'rejected' ? 'Agreements that are denied or voided will appear here.' : `Switch to another tab or add agreements to see them here.`}
                    </p>
                  </div>
                ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Document</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Recipients</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredAgreements.map((ag) => {
                      const createdAtLine = formatEsignCreatedAtLine(ag);
                      const track = deriveAgreementStatus(ag);
                      const badge = AGREEMENT_BADGE[track];
                      const prog = agreementProgress(ag);
                      const last = agreementLastActivity(ag);
                      const expanded = expandedRowId === ag.id;
                      const hasRecipients = (ag.recipients || []).length > 0;
                      const withComment = (ag.recipients || []).find((r) => r.comment);
                      const rowStatus = (ag.status || '').toLowerCase();
                      // Download of the signed/finalized PDF is available to everyone who can see the row.
                      const canDownloadRow = rowStatus === 'signed' || rowStatus === 'completed' || rowStatus === 'denied';
                      // Management actions (reminder/extend/cancel) are shown to everyone while the agreement is
                      // out for signature; non-creators see them restricted (disabled + permission message).
                      const hasMenuActions = rowStatus === 'sent' || canDownloadRow;
                      return (
                      <React.Fragment key={ag.id}>
                      <tr className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 align-top">
                          <div className="flex items-start gap-2">
                            {hasRecipients ? (
                              <button
                                type="button"
                                onClick={() => setExpandedRowId(expanded ? null : ag.id)}
                                className="mt-1 text-slate-400 hover:text-slate-600 shrink-0"
                                title={expanded ? 'Hide recipients' : 'Show recipients'}
                                aria-expanded={expanded}
                              >
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}
                            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-slate-900 truncate max-w-xs block" title={ag.file_name}>{ag.file_name}</span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {formatEsignCreatedByLine(ag)}
                              </p>
                              {createdAtLine ? (
                                <p className="text-xs text-slate-500 mt-0.5">{createdAtLine}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 align-top">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${badge.cls}`}>
                            <badge.Icon className="h-3.5 w-3.5" /> {badge.label}
                          </span>
                          {last.iso ? (
                            <p className="text-xs text-slate-500 mt-1.5">
                              {last.label} {relativeTime(last.iso)}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 mt-1.5">Waiting for action</p>
                          )}
                          {prog.nextPending && track !== 'completed' && track !== 'voided' && track !== 'declined' ? (
                            <p className="text-xs text-amber-600 mt-0.5 max-w-[16rem] truncate">Waiting for {prog.nextPending}</p>
                          ) : null}
                          {(track === 'declined' || track === 'voided') && withComment ? (
                            <p className="text-xs text-slate-600 mt-1 max-w-[16rem] truncate" title={withComment.comment || undefined}>
                              Comment: {withComment.comment}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4 align-top">
                          {hasRecipients ? (
                            <div>
                              <p className="text-sm font-medium text-slate-700">{prog.signed} of {prog.total} signed</p>
                              <div className="mt-1.5 h-1.5 w-24 rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-500 ${track === 'completed' ? 'bg-emerald-500' : track === 'declined' || track === 'voided' ? 'bg-red-400' : 'bg-indigo-500'}`}
                                  style={{ width: `${prog.total > 0 ? Math.round((prog.signed / prog.total) * 100) : 0}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 align-top">
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            {ag.status === 'draft' && (
                              <Link
                                to={`/esign/${ag.id}/place-fields`}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                              >
                                <PenLine className="h-4 w-4" />
                                Place fields
                              </Link>
                            )}
                            {(ag.status === 'sent' || ag.status === 'signed' || ag.status === 'completed' || ag.status === 'voided' || ag.status === 'denied') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc({ id: ag.id, file_name: ag.file_name })}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                                  title="Preview document"
                                  aria-label="Preview document"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openStatusModal(ag.id)}
                                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
                                >
                                  View status
                                </button>
                              </>
                            )}
                            {ag.status === 'sent' && (() => {
                              const isCreator = isCurrentUserCreator(ag);
                              return (
                                <button
                                  type="button"
                                  onClick={isCreator
                                    ? () => handleCopyLink(ag.id)
                                    : () => alert('Only the agreement creator can copy the signing link.')}
                                  disabled={isCreator && copyingId === ag.id}
                                  className={`inline-flex items-center justify-center w-8 h-8 rounded-lg disabled:opacity-50 ${isCreator ? 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50' : 'text-slate-300 cursor-not-allowed'}`}
                                  title={isCreator ? 'Copy signing link' : 'Only the agreement creator can copy the signing link.'}
                                  aria-label="Copy signing link"
                                >
                                  {isCreator && copyingId === ag.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                                </button>
                              );
                            })()}
                            {hasMenuActions && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    if (openActionsId === ag.id) {
                                      closeActionsMenu();
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setDropdownPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) });
                                      setOpenActionsId(ag.id);
                                    }
                                  }}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400"
                                  title="Actions"
                                  aria-expanded={openActionsId === ag.id}
                                >
                                  <MoreVertical className="h-5 w-5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expanded && hasRecipients && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={4} className="px-6 py-3">
                            <div className="space-y-2 pl-9">
                              {[...ag.recipients].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).map((rec) => {
                                const ts = deriveRecipientStatus(rec, ag.status);
                                const rb = TRACK_BADGE[ts];
                                const isForwarded = !!rec.forwarded_to_email;
                                return (
                                  <div key={rec.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-800 truncate">{rec.name || rec.email || 'Signer'}</p>
                                      <p className="text-xs text-slate-500 truncate">{rec.email}<span className="capitalize"> · {rec.role || 'signer'}</span></p>
                                      {(rec.sent_at || rec.viewed_at || rec.signed_at) && (
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                                          {rec.sent_at && <span className="inline-flex items-center gap-1"><Send className="h-3 w-3 text-blue-400" /> Sent {relativeTime(rec.sent_at)}</span>}
                                          {rec.viewed_at && <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3 text-violet-400" /> Viewed {relativeTime(rec.viewed_at)}</span>}
                                          {rec.signed_at && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-400" /> Signed {relativeTime(rec.signed_at)}</span>}
                                        </div>
                                      )}
                                      {rec.comment && (
                                        <p className="mt-1 text-xs text-slate-600">Comment: {rec.comment}</p>
                                      )}
                                    </div>
                                    {isForwarded ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200 shrink-0">
                                        <Forward className="h-3.5 w-3.5" /> Forwarded
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${rb.cls}`}>
                                        <rb.Icon className="h-3.5 w-3.5" /> {rb.label}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                    })}
                  </tbody>
                </table>
              </div>
                )}
              {openActionsId && dropdownPosition && (() => {
                const openAgreement = filteredAgreements.find((a) => a.id === openActionsId);
                if (!openAgreement) return null;
                const status = (openAgreement.status || '').toLowerCase();
                const showDownload = status === 'signed' || status === 'completed' || status === 'denied';
                const isCreator = isCurrentUserCreator(openAgreement);
                const denyAction = (msg: string) => { closeActionsMenu(); alert(msg); };
                const mgmtBtnClass = isCreator
                  ? 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                  : 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 cursor-not-allowed';
                return createPortal(
                  <>
                    <div className="fixed inset-0 z-40" aria-hidden onClick={closeActionsMenu} />
                    <div
                      className="fixed z-50 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                      style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {status === 'sent' && (
                        <button
                          type="button"
                          onClick={isCreator
                            ? () => { handleRemind(openAgreement.id, openAgreement.file_name); closeActionsMenu(); }
                            : () => denyAction('Only the agreement creator can send reminders.')}
                          disabled={isCreator && remindingId === openAgreement.id}
                          className={mgmtBtnClass}
                          title={isCreator ? undefined : 'Only the agreement creator can send reminders.'}
                        >
                          {isCreator && remindingId === openAgreement.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Bell className="h-4 w-4 shrink-0" />}
                          Send Reminder
                          {!isCreator && <Lock className="h-3 w-3 ml-auto shrink-0" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { setEditDatesAgreementId(openAgreement.id); closeActionsMenu(); }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <CalendarClock className="h-4 w-4 shrink-0" />
                        {(isCurrentUserCreator(openAgreement) || userIsApprovalAdmin) ? 'Edit dates' : 'View dates'}
                      </button>
                      {status === 'sent' && (
                        <button
                          type="button"
                          onClick={isCreator
                            ? () => { handleExtendExpiry(openAgreement.id, openAgreement.file_name); closeActionsMenu(); }
                            : () => denyAction('You do not have permission to extend the expiry date.')}
                          disabled={isCreator && extendingId === openAgreement.id}
                          className={mgmtBtnClass}
                          title={isCreator ? undefined : 'You do not have permission to extend the expiry date.'}
                        >
                          {isCreator && extendingId === openAgreement.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Clock className="h-4 w-4 shrink-0" />}
                          Extend expiry
                          {!isCreator && <Lock className="h-3 w-3 ml-auto shrink-0" />}
                        </button>
                      )}
                      {status === 'sent' && (
                        <button
                          type="button"
                          onClick={isCreator
                            ? () => { handleCancelSigning(openAgreement.id, openAgreement.file_name); closeActionsMenu(); }
                            : () => denyAction('Only the agreement creator can cancel this agreement.')}
                          disabled={isCreator && cancelingId === openAgreement.id}
                          className={mgmtBtnClass}
                          title={isCreator ? undefined : 'Only the agreement creator can cancel this agreement.'}
                        >
                          {isCreator && cancelingId === openAgreement.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <XCircle className="h-4 w-4 shrink-0" />}
                          Cancel Signing
                          {!isCreator && <Lock className="h-3 w-3 ml-auto shrink-0" />}
                        </button>
                      )}
                      {showDownload && (
                        <button
                          type="button"
                          onClick={() => { handleDownload(openAgreement.id, openAgreement.file_name); closeActionsMenu(); }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-4 w-4 shrink-0" />
                          Download
                        </button>
                      )}
                    </div>
                  </>,
                  document.body
                );
              })()}
              </>
            )}
          </div>
        </div>

        {/* View status modal */}
        {statusModalId != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeStatusModal}>
            <div
              className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">e sign status</h2>
                  {statusModalRefreshing && <RefreshCw className="h-4 w-4 text-white/70 animate-spin" aria-label="Refreshing" />}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleStatusModalPreview}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25 transition-colors"
                    title="Preview document"
                    aria-label="Preview document"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button type="button" onClick={closeStatusModal} className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10" aria-label="Close">
                    <XCircle className="h-6 w-6" />
                  </button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {statusModalLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                  </div>
                ) : statusModalDoc ? (
                  (() => {
                    const docStatus = statusModalDoc.status;
                    const recs = statusModalRecipients;
                    const total = recs.length;
                    const doneCount = recs.filter((r) => ['signed', 'reviewed'].includes((r.status || '').toLowerCase())).length;
                    const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;
                    const anyDenied = recs.some((r) => (r.status || '').toLowerCase() === 'denied');
                    const firstSigned = recs.find((r) => (r.status || '').toLowerCase() === 'signed');
                    let banner: { tone: string; Icon: React.ComponentType<{ className?: string }>; text: string } | null = null;
                    if (docStatus === 'completed') {
                      banner = { tone: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: CheckCircle2, text: 'Agreement completed successfully. All recipients have signed.' };
                    } else if (docStatus === 'denied' || anyDenied) {
                      banner = { tone: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle, text: 'This agreement was declined by a recipient.' };
                    } else if (docStatus === 'voided') {
                      banner = { tone: 'bg-slate-100 border-slate-200 text-slate-700', Icon: AlertCircle, text: 'This agreement was voided. Signing links no longer work.' };
                    } else if (docStatus === 'sent' && doneCount > 0) {
                      banner = { tone: 'bg-amber-50 border-amber-200 text-amber-800', Icon: Clock, text: `Signed by ${firstSigned?.name || firstSigned?.email || 'a recipient'} — waiting for remaining recipients.` };
                    } else if (docStatus === 'sent') {
                      banner = { tone: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Send, text: 'Sent for signature. Waiting for recipients to sign.' };
                    }
                    return (
                      <>
                        <p className="text-slate-700 font-medium truncate">{statusModalDoc.file_name}</p>
                        <span className={`inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          statusModalDoc.upload_source === 'approval'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {statusModalDoc.upload_source === 'approval' ? (
                            <><CheckCircle2 className="h-3.5 w-3.5" /> Generated via approval workflow</>
                          ) : (
                            <><Upload className="h-3.5 w-3.5" /> Manually uploaded</>
                          )}
                        </span>

                        {/* Overall progress */}
                        <div className="mt-4">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-medium text-slate-600">Overall progress</span>
                            <span className="font-semibold text-slate-800">{progress}% · {doneCount} of {total} signed</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${docStatus === 'completed' ? 'bg-emerald-500' : anyDenied || docStatus === 'denied' ? 'bg-red-400' : 'bg-indigo-500'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {banner && (
                          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 mt-4 ${banner.tone}`}>
                            <banner.Icon className="h-5 w-5 shrink-0" />
                            <span className="font-medium text-sm">{banner.text}</span>
                          </div>
                        )}

                        {/* Recipient-wise tracking */}
                        <div className="mt-6">
                          <h3 className="text-sm font-semibold text-slate-700 mb-3">Recipients ({total})</h3>
                          <div className="space-y-2.5">
                            {recs.map((rec) => {
                              const ts = deriveRecipientStatus(rec, docStatus);
                              const badge = TRACK_BADGE[ts];
                              const isForwarded = !!rec.forwarded_to_email;
                              const forwardedTo = rec.forwarded_to_name || rec.forwarded_to_email;
                              const forwardedBy = rec.forwarded_from_name || rec.forwarded_from_email;
                              const last = recipientLastActivity(rec);
                              return (
                                <div key={rec.id} className="rounded-lg border border-slate-200 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-900 truncate">{rec.name || rec.email || 'Signer'}</p>
                                      <p className="text-xs text-slate-500 truncate">{rec.email}</p>
                                      <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{(rec.role || 'signer')}</p>
                                    </div>
                                    {isForwarded ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200 shrink-0">
                                        <Forward className="h-3.5 w-3.5" /> Forwarded
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${badge.cls}`}>
                                        <badge.Icon className="h-3.5 w-3.5" /> {badge.label}
                                      </span>
                                    )}
                                  </div>
                                  {/* Per-recipient timestamps */}
                                  {(rec.sent_at || rec.viewed_at || rec.signed_at) && (
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                                      {rec.sent_at && <span className="inline-flex items-center gap-1"><Send className="h-3 w-3 text-blue-500" /> Sent {formatEsignDateTime(rec.sent_at)}</span>}
                                      {rec.viewed_at && <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3 text-violet-500" /> Viewed {formatEsignDateTime(rec.viewed_at)}</span>}
                                      {rec.signed_at && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-500" /> Signed {formatEsignDateTime(rec.signed_at)}</span>}
                                    </div>
                                  )}
                                  {last && (
                                    <p className="mt-1 text-[11px] text-slate-400">Last activity: {formatEsignDateTime(last)}</p>
                                  )}
                                  {isForwarded && (
                                    <div className="mt-1.5 text-xs text-slate-500">
                                      {forwardedBy
                                        ? <><span className="font-medium text-slate-700">{forwardedBy}</span> forwarded to: <span className="font-medium text-purple-600">{forwardedTo}</span></>
                                        : <>Forwarded to: <span className="font-medium text-purple-600">{forwardedTo}</span></>
                                      }
                                    </div>
                                  )}
                                  {rec.comment && (
                                    <div className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-md px-2.5 py-1.5 border border-slate-100">
                                      <span className="font-medium text-slate-500">Comment: </span>
                                      {rec.comment}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Activity timeline */}
                        {statusModalActivity.length > 0 && (
                          <div className="mt-6">
                            <h3 className="text-sm font-semibold text-slate-700 mb-3">Activity timeline</h3>
                            <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                              {statusModalActivity.map((a, i) => {
                                const meta = activityMeta(a.action);
                                return (
                                  <li key={i} className="ml-4">
                                    <span className="absolute -left-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-2 ring-slate-200">
                                      <span className={`h-1.5 w-1.5 rounded-full ${meta.tone.replace('text-', 'bg-')}`} />
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <meta.Icon className={`h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
                                      <p className="text-sm text-slate-700">
                                        {meta.label}
                                        {a.recipient ? <span className="text-slate-400"> · {a.recipient}</span> : null}
                                      </p>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{formatEsignDateTime(a.timestamp)}</p>
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        )}

                        {/* Actions */}
                        {docStatus === 'completed' && (
                          <div className="mt-6 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={handleStatusModalDownload}
                              disabled={statusModalDownloading}
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50"
                            >
                              {statusModalDownloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                              Download signed PDF
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <p className="text-slate-500">Could not load status.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {editDatesAgreementId && (() => {
          const editingAg = agreements.find((a) => a.id === editDatesAgreementId);
          const canEdit = !!editingAg && (isCurrentUserCreator(editingAg) || userIsApprovalAdmin);
          return (
            <EditDatesModal
              documentId={editDatesAgreementId}
              actorEmail={user?.email || ''}
              canEdit={canEdit}
              onClose={() => setEditDatesAgreementId(null)}
              onSaved={() => { fetchStatus(); }}
            />
          );
        })()}

        {/* Copy-link success toast */}
        {copyToast && (
          <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-3 shadow-lg">
            <Check className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">Signing link copied successfully</span>
          </div>
        )}

        {/* In-app document preview overlay */}
        {previewDoc && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-black/70" onClick={() => setPreviewDoc(null)}>
            <div
              className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-slate-900 text-white shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="h-5 w-5 shrink-0" />
                <span className="font-medium truncate">{previewDoc.file_name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(previewDoc.id, previewDoc.file_name)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium hover:bg-white/25"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
                  aria-label="Close preview"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-200 relative" onClick={(e) => e.stopPropagation()}>
              {previewLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="text-sm">Loading document…</span>
                </div>
              ) : previewError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <AlertCircle className="h-8 w-8 text-red-500" />
                  <p className="text-sm text-slate-700">Couldn’t load the document preview.</p>
                  <p className="text-xs text-slate-500">{previewError}</p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewDoc.id, previewDoc.file_name)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <Download className="h-4 w-4" /> Download instead
                  </button>
                </div>
              ) : previewUrl ? (
                <iframe
                  title="Agreement preview"
                  src={previewUrl}
                  className="w-full h-full border-0"
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EsignAgreementStatusDashboard;
