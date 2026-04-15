import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Calendar,
  FileText,
  Loader2,
  Search,
  X,
  XCircle,
  ArrowLeft,
  PenLine,
  Bell,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { getDocumentFileInlineUrl, iframeSrcFromDocumentPreview } from '../utils/documentPreviewUrl';
import PdfCanvasViewer from './PdfCanvasViewer';

type ViewKey = 'dashboard' | 'pending' | 'approved' | 'rejected';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Parse `YYYY-MM-DD` from a date input as a local calendar day. */
const parseDateInputLocal = (s: string): Date | null => {
  const parts = s.trim().split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
};

/** Latest step completion time for an approved workflow (fallback: updatedAt). */
const getApprovalCompletedAtMs = (w: any): number | null => {
  if (w.status !== 'approved') return null;
  const steps = w.workflowSteps || [];
  let max = 0;
  for (const s of steps) {
    const raw = s?.approvedAt || s?.completedAt || s?.updatedAt;
    if (raw) max = Math.max(max, new Date(raw).getTime());
  }
  const fall = w.updatedAt || w.createdAt;
  const t = max || (fall ? new Date(fall).getTime() : 0);
  return t > 0 && !isNaN(t) ? t : null;
};

const workflowMatchesDateRange = (w: any, fromStr: string, toStr: string): boolean => {
  const fromRaw = fromStr.trim();
  const toRaw = toStr.trim();
  if (!fromRaw && !toRaw) return true;

  const fromD = fromRaw ? parseDateInputLocal(fromRaw) : null;
  const toD = toRaw ? parseDateInputLocal(toRaw) : null;
  if (fromRaw && !fromD) return true;
  if (toRaw && !toD) return true;

  const fromMs = fromD ? startOfDay(fromD).getTime() : null;
  const toMs = toD ? endOfDay(toD).getTime() : null;

  const status = w.status || 'pending';
  let ts: number | null = null;
  if (status === 'approved') {
    ts = getApprovalCompletedAtMs(w);
  } else if (status === 'pending' || status === 'in_progress') {
    ts = w.createdAt ? new Date(w.createdAt).getTime() : null;
  } else if (status === 'denied') {
    ts = w.updatedAt ? new Date(w.updatedAt).getTime() : null;
  }
  if (ts === null || isNaN(ts)) return false;
  if (fromMs !== null && ts < fromMs) return false;
  if (toMs !== null && ts > toMs) return false;
  return true;
};

const badgeClass = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80';
    case 'denied':
      return 'bg-rose-50 text-rose-800 ring-1 ring-rose-200/80';
    case 'in_progress':
      return 'bg-teal-50 text-teal-800 ring-1 ring-teal-200/80';
    case 'pending':
    default:
      return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/80';
  }
};

const Sparkline: React.FC<{ data: number[]; stroke: string }> = ({ data, stroke }) => {
  const w = 48;
  const h = 14;
  const pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);

  const points = data
    .map((v, i) => {
      const x = pad + (i * (w - pad * 2)) / Math.max(data.length - 1, 1);
      const y = h - pad - ((v - min) * (h - pad * 2)) / range;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
    </svg>
  );
};

const getStep = (workflow: any, role: string) => {
  const steps = workflow?.workflowSteps || [];
  return steps.find((s: any) => s?.role === role);
};

const hasRole = (workflow: any, role: string) =>
  Array.isArray(workflow?.workflowSteps) && workflow.workflowSteps.some((s: any) => s?.role === role);

const labelFromRole = (role: string) => {
  switch (role) {
    case 'Team Approval':
      return 'Team';
    case 'Technical Team':
      return 'Tech';
    case 'Legal Team':
      return 'Legal';
    case 'Deal Desk':
      return 'Deal Desk';
    case 'Migration Manager':
      return 'MM';
    case 'Account Manager':
      return 'AM';
    default:
      return role || 'Step';
  }
};

const stepStatusLabel = (status?: string) => {
  if (!status) return 'pending';
  return status === 'denied' ? 'rejected' : status.replace('_', ' ');
};

const stepperDotClass = (idx: number, currentIdx: number, rawStatus?: string) => {
  const s = rawStatus || 'pending';
  if (s === 'denied') return 'bg-[#FCA5A5]';
  if (s === 'approved') return 'bg-[#86EFAC]';
  if (idx < currentIdx) return 'bg-[#86EFAC]';
  if (idx === currentIdx) return 'bg-[#FCD34D]';
  return 'bg-gray-300';
};

const stepperLabelClass = (idx: number, currentIdx: number, rawStatus?: string) => {
  const s = rawStatus || 'pending';
  if (s === 'denied') return 'text-[#991B1B]';
  if (s === 'approved') return 'text-[#166534]';
  if (idx === currentIdx) return 'text-gray-900 font-semibold';
  return 'text-gray-600';
};

const ApprovalDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const showStandaloneBackLink = location.pathname !== '/approval';
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [query, setQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  // Tracks which workflow is currently being prepared for eSign (loading state)
  const [processingEsignId, setProcessingEsignId] = useState<string | null>(null);
  // Tracks which workflow reminder is being sent + per-workflow success flash
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);

  const {
    workflows,
    refreshWorkflows,
  } = useApprovalWorkflows();

  /**
   * Creates an eSign document from the approved workflow's agreement and
   * navigates to the place-fields page so the creator can add recipients,
   * place signature fields, and send for e-signature.
   */
  const handleProceedToEsign = async (workflow: any) => {
    setProcessingEsignId(workflow.id);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/from-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: workflow.documentId,
          uploaded_by: workflow.creatorEmail || 'approval-workflow',
          requested_by_name: workflow.creatorName || '',
          requested_by_email: workflow.creatorEmail || '',
          workflowId: workflow.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.document?.id) {
        throw new Error(data.error || 'Failed to create e-sign document');
      }
      // Clear pending-approval sessionStorage so the place-fields page shows
      // "Send for Signature" directly (approval is already complete)
      sessionStorage.removeItem('quotePendingApproval');
      navigate(`/esign/${data.document.id}/place-fields`);
    } catch (err: any) {
      alert(err?.message || 'Failed to open e-sign. Please try again.');
    } finally {
      setProcessingEsignId(null);
    }
  };

  /**
   * Checks the current status of an existing eSign document and navigates
   * to the appropriate page:
   *   - 'draft'              → place-fields (add recipients/fields and send)
   *   - 'sent' / 'completed' → tracking/status page
   *   - not found / voided   → create a fresh document via handleProceedToEsign
   */
  const handleProceedToEsignWithCheck = async (workflow: any) => {
    const esignDocId = workflow.esignDocumentId;
    if (!esignDocId) {
      handleProceedToEsign(workflow);
      return;
    }
    setProcessingEsignId(workflow.id);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${esignDocId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.document) {
        const docStatus: string = data.document.status || 'draft';
        sessionStorage.removeItem('quotePendingApproval');
        if (docStatus === 'draft') {
          navigate(`/esign/${esignDocId}/place-fields`);
        } else {
          // sent, completed, denied, voided — show tracking page
          navigate(`/esign/${esignDocId}/status`);
        }
      } else {
        // Document not found or invalid — create a new one
        setProcessingEsignId(null);
        handleProceedToEsign(workflow);
      }
    } catch {
      // Network error — fall back to creating a new document
      setProcessingEsignId(null);
      handleProceedToEsign(workflow);
    } finally {
      setProcessingEsignId(null);
    }
  };

  /** Sends a reminder email to the current pending approver. */
  const handleSendReminder = async (workflowId: string) => {
    setSendingReminderId(workflowId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to send reminder');
      // Show brief success flash on the card
      setReminderSentId(workflowId);
      setTimeout(() => setReminderSentId(null), 3000);
    } catch (err: any) {
      alert(err?.message || 'Failed to send reminder. Please try again.');
    } finally {
      setSendingReminderId(null);
    }
  };

  // Refetch workflows when user returns to this tab/window so Deal Desk "Email sent" shows after Legal approval
  const refreshRef = useRef(refreshWorkflows);
  refreshRef.current = refreshWorkflows;
  useEffect(() => {
    const onFocus = () => refreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const now = new Date();

  const normalized = query.trim().toLowerCase();

  const {
    all,
    pending,
    approved,
    rejected,
    sparkPending,
    sparkApproved,
    sparkRejected,
    sparkAll,
  } = useMemo(() => {
    const safe = (workflows || []).filter(Boolean);

    const isPending = (w: any) => w.status === 'pending' || w.status === 'in_progress';
    const isApproved = (w: any) => w.status === 'approved';
    const isRejected = (w: any) => w.status === 'denied';

    const matchesQuery = (w: any) => {
      if (!normalized) return true;
      const doc = String(w.documentId || '').toLowerCase();
      const client = String(w.clientName || '').toLowerCase();
      const creator = String(w.creatorEmail || '').toLowerCase();
      return doc.includes(normalized) || client.includes(normalized) || creator.includes(normalized);
    };

    // Helper function to sort by createdAt (descending - newest first)
    const sortByCreatedAt = (a: any, b: any) => {
      // Sort by createdAt (creation date) - descending order (newest first)
      // Ensure dates are treated as proper Date objects
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      
      // Handle invalid dates
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1; // Put invalid dates at the end
      if (isNaN(dateB)) return -1; // Put invalid dates at the end
      
      return dateB - dateA; // Descending order (newest first)
    };

    const pendingAll = safe.filter(isPending).filter(matchesQuery).sort(sortByCreatedAt);
    const approvedAll = safe.filter(isApproved).filter(matchesQuery).sort(sortByCreatedAt);
    const rejectedAll = safe.filter(isRejected).filter(matchesQuery).sort(sortByCreatedAt);

    // Dashboard list: show everything (pending + approved + rejected), sorted by createdAt (most recent first).
    const allSorted = safe
      .filter(matchesQuery)
      .sort(sortByCreatedAt);

    // 7-day sparklines (today inclusive)
    const dayKeys = Array.from({ length: 7 }, (_, i) => {
      const d = startOfDay(new Date(now));
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });
    const idxFor = (isoDateKey: string) => dayKeys.indexOf(isoDateKey);
    const sparkP = new Array(7).fill(0);
    const sparkA = new Array(7).fill(0);
    const sparkR = new Array(7).fill(0);
    const sparkTot = new Array(7).fill(0);

    for (const w of safe) {
      const createdKey = w.createdAt ? startOfDay(new Date(w.createdAt)).toISOString().slice(0, 10) : null;
      const updatedKey = (w.updatedAt || w.createdAt) ? startOfDay(new Date(w.updatedAt || w.createdAt)).toISOString().slice(0, 10) : null;

      if (createdKey) {
        const idx = idxFor(createdKey);
        if (idx >= 0) {
          sparkTot[idx] += 1;
          if (isPending(w)) sparkP[idx] += 1;
        }
      }
      if (updatedKey) {
        const idx = idxFor(updatedKey);
        if (idx >= 0 && isApproved(w)) sparkA[idx] += 1;
        if (idx >= 0 && isRejected(w)) sparkR[idx] += 1;
      }
    }

    return {
      all: allSorted,
      pending: pendingAll,
      approved: approvedAll,
      rejected: rejectedAll,
      sparkPending: sparkP,
      sparkApproved: sparkA,
      sparkRejected: sparkR,
      sparkAll: sparkTot,
    };
  }, [workflows, normalized]);

  const list = useMemo(() => {
    switch (activeView) {
      case 'pending':
        return pending;
      case 'approved':
        return approved;
      case 'rejected':
        return rejected;
      default:
        return all;
    }
  }, [activeView, all, pending, approved, rejected]);

  const filteredList = useMemo(() => {
    if (!filterDateFrom.trim() && !filterDateTo.trim()) return list;
    return list.filter((w: any) => workflowMatchesDateRange(w, filterDateFrom, filterDateTo));
  }, [list, filterDateFrom, filterDateTo]);

  const dateFilterActive = Boolean(filterDateFrom.trim() || filterDateTo.trim());

  // Use the existing "View Details" behavior by navigating to the modal in other dashboards.
  const revokeObjectUrlIfAny = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const closePreviewModal = () => {
    setShowPreviewModal(false);
    setSelectedWorkflow(null);
    setIsPreviewLoading(false);
    setPreviewError(null);
    setDocumentPreviewUrl(null);
    revokeObjectUrlIfAny();
  };

  const openAgreementPreview = async (workflow: any) => {
    setSelectedWorkflow(workflow);
    setShowPreviewModal(true);
    setIsPreviewLoading(true);
    setPreviewError(null);
    setDocumentPreviewUrl(null);
    revokeObjectUrlIfAny();

    const docId = workflow?.documentId;
    if (!docId) {
      setPreviewError('No document ID found for this workflow.');
      setIsPreviewLoading(false);
      return;
    }

    try {
      // 1) Preferred: preview endpoint returns a data URL for iframe
      const previewResp = await fetch(`${BACKEND_URL}/api/documents/${docId}/preview`);
      if (previewResp.ok) {
        const result = await previewResp.json();
        if (result?.success) {
          const src =
            iframeSrcFromDocumentPreview(result, docId) || getDocumentFileInlineUrl(docId);
          setDocumentPreviewUrl(src);
          setIsPreviewLoading(false);
          return;
        }
      }

      // 2) Fallback: binary PDF stream (avoid JSON /api/documents/:id in iframe — that showed raw text on mobile)
      setDocumentPreviewUrl(getDocumentFileInlineUrl(docId));
      setIsPreviewLoading(false);
    } catch (e) {
      console.error('Failed to load agreement preview:', e);
      setPreviewError('Failed to load the agreement. Please try again.');
      setIsPreviewLoading(false);
    }
  };

  const listSectionTitle =
    activeView === 'dashboard'
      ? 'All Approvals'
      : activeView === 'pending'
        ? 'Pending Approvals'
        : activeView === 'approved'
          ? 'Approved'
          : 'Rejected';

  return (
    <div
      className="w-full max-w-full min-w-0 bg-white text-slate-800"
      style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif" }}
    >
      {showStandaloneBackLink && (
        <button
          type="button"
          onClick={() => navigate('/deal')}
          className="fixed top-[4.5rem] left-2 z-50 inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 sm:top-4 sm:left-4 sm:px-3 rounded-lg bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-lg transition-colors max-w-[calc(100vw-1rem)]"
          title="Back to home"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          <span className="text-xs sm:text-sm font-medium truncate">Back to home</span>
        </button>
      )}

      <main className="w-full max-w-full min-w-0 box-border py-2 px-0 sm:px-1 sm:py-3">
          {/* Summary cards: white panels with colored top accent (reference layout) */}
          <div className="grid min-w-0 w-full grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className={`rounded-lg bg-white border border-gray-200 border-t-4 border-t-slate-500 px-2.5 sm:px-3 py-2.5 shadow-sm text-left w-full min-w-0 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-0 ${
                    activeView === 'dashboard' ? 'shadow-md ring-1 ring-slate-200' : ''
                  }`}
                  aria-pressed={activeView === 'dashboard'}
                  aria-label={`All approvals: ${all.length} items. Click to show the full list.`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">All Approvals</div>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <div className="text-2xl font-extrabold text-gray-900 tabular-nums leading-none">{all.length}</div>
                    <Sparkline data={sparkAll} stroke="#64748B" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('approved')}
                  className={`rounded-lg bg-white border border-gray-200 border-t-4 border-t-emerald-500 px-2.5 sm:px-3 py-2.5 shadow-sm text-left w-full min-w-0 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-0 ${
                    activeView === 'approved' ? 'shadow-md ring-1 ring-emerald-200' : ''
                  }`}
                  aria-pressed={activeView === 'approved'}
                  aria-label={`Approved: ${approved.length} deals. Click to view all approved deals.`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Approved</div>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <div className="text-2xl font-extrabold text-gray-900 tabular-nums leading-none">{approved.length}</div>
                    <Sparkline data={sparkApproved} stroke="#059669" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('pending')}
                  className={`rounded-lg bg-white border border-gray-200 border-t-4 border-t-amber-400 px-2.5 sm:px-3 py-2.5 shadow-sm text-left w-full min-w-0 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-0 ${
                    activeView === 'pending' ? 'shadow-md ring-1 ring-amber-200' : ''
                  }`}
                  aria-label={`Pending approvals: ${pending.length} in queue. Click to view the pending list.`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Pending Approvals</div>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <div className="text-2xl font-extrabold text-gray-900 tabular-nums leading-none">{pending.length}</div>
                    <Sparkline data={sparkPending} stroke="#D97706" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveView('rejected')}
                  className={`rounded-lg bg-white border border-gray-200 border-t-4 border-t-rose-500 px-2.5 sm:px-3 py-2.5 shadow-sm text-left w-full min-w-0 transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-0 ${
                    activeView === 'rejected' ? 'shadow-md ring-1 ring-rose-200' : ''
                  }`}
                  aria-label="Show rejected workflows"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Rejected</div>
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <div className="text-2xl font-extrabold text-gray-900 tabular-nums leading-none">{rejected.length}</div>
                    <Sparkline data={sparkRejected} stroke="#f87171" />
                  </div>
                </button>
              </div>

          {/* List */}
          <div className="mt-3 min-w-0 max-w-full">
            <div
              className={`flex min-w-0 max-w-full flex-col gap-3 mb-3 lg:flex-row lg:items-center lg:gap-3 ${
                activeView === 'dashboard' ? '' : 'lg:justify-between'
              }`}
            >
              {activeView !== 'dashboard' && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="text-lg font-bold text-gray-900">{listSectionTitle}</div>
                  <button
                    type="button"
                    onClick={() => setActiveView('dashboard')}
                    className="text-sm font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
                  >
                    All approvals
                  </button>
                </div>
              )}
              <div
                className={`grid min-w-0 w-full max-w-full grid-cols-1 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-stretch lg:gap-4 ${
                  activeView === 'dashboard' ? '' : 'lg:flex-1 lg:min-w-0'
                }`}
              >
                <div
                  className="flex h-full min-h-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white border border-gray-200 px-3 py-2.5 sm:px-4 w-full lg:w-max lg:max-w-none"
                  title="Approved: completion time. Pending: created. Rejected: last update."
                >
                  <Calendar className="h-5 w-5 text-gray-400 shrink-0" aria-hidden />
                  <span className="text-sm font-medium text-gray-600 whitespace-nowrap">Date</span>
                  <label className="flex flex-1 min-w-0 items-center gap-1.5 sm:flex-initial">
                    <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">From</span>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="min-w-0 flex-1 text-sm text-gray-900 border border-gray-200 rounded-md px-2.5 py-2 w-full sm:w-44 md:w-48 bg-white"
                    />
                  </label>
                  <span className="text-gray-400 text-sm px-0.5 hidden sm:inline" aria-hidden>
                    –
                  </span>
                  <label className="flex flex-1 min-w-0 items-center gap-1.5 sm:flex-initial w-full sm:w-auto">
                    <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">To</span>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="min-w-0 flex-1 text-sm text-gray-900 border border-gray-200 rounded-md px-2.5 py-2 w-full sm:w-44 md:w-48 bg-white"
                    />
                  </label>
                  {dateFilterActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterDateFrom('');
                        setFilterDateTo('');
                      }}
                      className="text-sm font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex min-h-[2.5rem] min-w-0 w-full lg:min-h-0">
                  <div className="flex h-full min-h-[2.5rem] min-w-0 w-full items-center gap-2.5 rounded-lg bg-white border border-gray-200 px-3 py-2.5 sm:px-4 lg:min-h-0">
                    <Search className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by deal / quote ID / client / requester..."
                      className="min-h-0 min-w-0 flex-1 bg-transparent py-0.5 text-base leading-snug text-gray-900 placeholder:text-gray-500"
                    />
                  </div>
                </div>
                <div className="flex h-full min-h-0 shrink-0 items-center justify-center text-sm text-gray-600 sm:text-base whitespace-nowrap lg:justify-self-end">
                  Showing <span className="text-gray-900 font-semibold tabular-nums mx-0.5">{filteredList.length}</span>
                  {dateFilterActive && list.length !== filteredList.length && (
                    <span className="text-gray-500"> of {list.length}</span>
                  )}
                  {' '}items
                </div>
              </div>
            </div>

            <div className="grid min-w-0 max-w-full grid-cols-1 gap-2.5">
              {filteredList.map((workflow: any) => {
                const status = workflow.status || 'pending';
                const statusLabel = String(status).replace('_', ' ');
                const requestedBy = workflow.creatorName || workflow.creatorEmail || '—';
                const createdAt = workflow.createdAt ? new Date(workflow.createdAt) : null;

                const teamStep = getStep(workflow, 'Team Approval');
                const technicalStep = getStep(workflow, 'Technical Team');
                const legalStep = getStep(workflow, 'Legal Team');
                const dealDeskStep = getStep(workflow, 'Deal Desk');
                const migrationManagerStep = getStep(workflow, 'Migration Manager');
                const accountManagerStep = getStep(workflow, 'Account Manager');

                return (
                  <div
                    key={workflow.id}
                    className="group min-w-0 max-w-full rounded-lg bg-white border border-gray-200 p-3.5 sm:p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
                  >
                    <div className="flex min-w-0 max-w-full flex-col gap-2.5 xl:flex-row xl:items-stretch xl:justify-between xl:gap-3">
                      <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,14rem)] gap-x-4 gap-y-2">
                        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <div className="min-w-0 truncate text-sm font-semibold text-gray-900">
                              {workflow.documentId || 'Untitled Quote / SOW'}
                            </div>
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${badgeClass(
                                status
                              )}`}
                              aria-label={`Status: ${statusLabel}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-700">
                            Requested by <span className="text-gray-900 font-semibold">{requestedBy}</span>
                          </div>
                          {workflow.reminderDays > 0 && (
                            <div className="mt-1.5 flex items-center gap-1">
                              <Bell className="w-3 h-3 text-amber-500 shrink-0" />
                              <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                                Reminder every {workflow.reminderDays} day{workflow.reminderDays > 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">Created</div>
                          <div className="mt-1 text-sm font-semibold text-gray-900 leading-snug">
                            {createdAt ? createdAt.toLocaleDateString('en-GB') : '—'}
                          </div>
                          <div className="text-xs text-gray-600 leading-snug">
                            {createdAt ? createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm font-semibold uppercase tracking-wide text-gray-500">Client</div>
                          <div className="mt-1 text-base font-semibold text-gray-900 truncate" title={workflow.clientName || undefined}>
                            {workflow.clientName || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 flex-col gap-2 self-stretch sm:w-auto sm:flex-row sm:self-start lg:self-stretch">
                        {/* Send Reminder — shown for pending / in_progress workflows */}
                        {(status === 'pending' || status === 'in_progress') && (
                          reminderSentId === workflow.id ? (
                            <span className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-sm font-semibold text-emerald-700 whitespace-nowrap">
                              <Check className="h-4 w-4 shrink-0" />
                              Reminder Sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSendReminder(workflow.id)}
                              disabled={sendingReminderId === workflow.id}
                              title="Send a reminder email to the current pending approver"
                              className={`inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-amber-500 border border-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all whitespace-nowrap ${
                                sendingReminderId === workflow.id
                                  ? 'opacity-70 cursor-not-allowed'
                                  : 'hover:bg-amber-600 hover:border-amber-600'
                              }`}
                            >
                              {sendingReminderId === workflow.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                  <span>Sending…</span>
                                </>
                              ) : (
                                <>
                                  <Bell className="h-4 w-4 shrink-0" />
                                  <span>Send Reminder</span>
                                </>
                              )}
                            </button>
                          )
                        )}

                        {/* e-Sign button — shown for all approved workflows, same look regardless of state */}
                        {status === 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleProceedToEsignWithCheck(workflow)}
                            disabled={processingEsignId === workflow.id}
                            title="Approval complete — add recipients, place fields and send for e-signature"
                            className={`inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-emerald-600 border border-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all whitespace-nowrap ${
                              processingEsignId === workflow.id
                                ? 'opacity-70 cursor-not-allowed'
                                : 'hover:bg-emerald-700 hover:border-emerald-700'
                            }`}
                          >
                            {processingEsignId === workflow.id ? (
                              <>
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                <span>Opening…</span>
                              </>
                            ) : (
                              <>
                                <PenLine className="h-4 w-4 shrink-0" />
                                <span>Proceed to e-Sign</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openAgreementPreview(workflow)}
                          title="Preview document"
                          aria-label="Preview document"
                          className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-md bg-white border border-gray-300 px-3.5 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/50 focus-visible:ring-offset-0 transition-all whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="sm:hidden">Preview</span>
                          <span className="hidden sm:inline">Preview Doc</span>
                        </button>
                      </div>
                    </div>

                    {/* Approval step summary: Team, Tech, Legal, [Recipient 1, Recipient 2, ...], Deal Desk */}
                    {(() => {
                      const dealDeskExtra = dealDeskStep?.comments === 'Notified'
                        ? 'Email sent'
                        : dealDeskStep?.comments === 'Notification failed'
                          ? 'Email failed'
                          : (dealDeskStep?.comments || '');
                      const isStandard = hasRole(workflow, 'Team Approval');

                      // Core quote/SOW approval is Team → Tech → Legal → Deal Desk. MM/AM only appear when
                      // those roles exist on this workflow (migration-style flows), not for every deal.
                      const steps = isStandard
                        ? [
                            { label: 'Team', step: teamStep, extra: teamStep ? [teamStep.group, teamStep.comments].filter(Boolean).join(' · ') : '' },
                            { label: 'Tech', step: technicalStep, extra: technicalStep?.comments || '' },
                            { label: 'Legal', step: legalStep, extra: legalStep?.comments || '' },
                            { label: 'Deal Desk', step: dealDeskStep, extra: dealDeskExtra },
                            ...(hasRole(workflow, 'Migration Manager')
                              ? [{ label: 'MM', step: migrationManagerStep, extra: migrationManagerStep?.comments || '' }]
                              : []),
                            ...(hasRole(workflow, 'Account Manager')
                              ? [{ label: 'AM', step: accountManagerStep, extra: accountManagerStep?.comments || '' }]
                              : []),
                          ]
                        : (workflow?.workflowSteps || [])
                            .slice()
                            .sort((a: any, b: any) => Number(a?.step || 0) - Number(b?.step || 0))
                            .map((s: any) => ({
                              label: labelFromRole(String(s?.role || 'Step')),
                              step: s,
                              extra: s?.comments || '',
                            }));

                      const currentIdx = steps.findIndex((item: (typeof steps)[number]) => {
                        const raw = item.step?.status || 'pending';
                        return raw !== 'approved' && raw !== 'notified' && raw !== 'signed';
                      });
                      const resolvedCurrentIdx = currentIdx === -1 ? steps.length - 1 : currentIdx;
                      const currentItem = steps[resolvedCurrentIdx];
                      const currentExtra = currentItem?.extra
                        ? `${currentItem.label}: ${currentItem.extra}`
                        : `${currentItem?.label || 'Current'}: —`;

                      const totalDisplayed = Math.max(
                        Number(workflow.totalSteps || 0),
                        Array.isArray(workflow.workflowSteps) ? workflow.workflowSteps.length : 0,
                        steps.length
                      );

                      return (
                        <div className="mt-2.5 min-w-0 max-w-full overflow-x-auto rounded-lg bg-gray-50/80 border border-gray-200 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Approvals</div>
                            <div className="text-xs tabular-nums text-gray-500">
                              Step {workflow.currentStep || resolvedCurrentIdx + 1} / {totalDisplayed || steps.length || 1}
                            </div>
                          </div>

                          <div className="mt-1 relative">
                            <div className="absolute left-0 right-0 top-[7px] h-px bg-gray-200" />
                            <div className="relative z-10 flex min-w-[520px] sm:min-w-0 items-start justify-between gap-0.5 sm:gap-1">
                              {steps.map((item: (typeof steps)[number], idx: number) => {
                                const raw = item.step?.status || 'pending';
                                const who = item.step?.email ? `Email: ${item.step.email}` : null;
                                const grp = item.step?.group ? `Group: ${item.step.group}` : null;
                                const cmt = item.step?.comments ? `Comments: ${item.step.comments}` : null;
                                const tsRaw =
                                  item.step?.approvedAt ||
                                  item.step?.completedAt ||
                                  item.step?.updatedAt ||
                                  item.step?.createdAt ||
                                  null;
                                const ts = tsRaw ? `Time: ${new Date(tsRaw).toLocaleString()}` : null;
                                const statusLabel = raw === 'signed' ? 'Signed' : stepStatusLabel(raw);
                                const title = [
                                  `${item.label}: ${statusLabel}`,
                                  ...(item.extra ? [`Info: ${item.extra}`] : []),
                                  ...([who, grp, cmt, ts].filter(Boolean) as string[]),
                                ].join('\n');

                                const completed =
                                  raw === 'approved' || raw === 'notified' || raw === 'signed' || (idx < resolvedCurrentIdx && raw !== 'denied');
                                const dotStatus = raw === 'signed' ? 'approved' : raw;
                                return (
                                  <div key={item.label} className="flex-1 min-w-0 flex flex-col items-center" title={title}>
                                    {completed ? (
                                      <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#86EFAC] ring-1 ring-white">
                                        <Check className="h-2.5 w-2.5 text-[#166534]" />
                                      </div>
                                    ) : (
                                      <div className={`h-3.5 w-3.5 rounded-full ring-1 ring-white ${stepperDotClass(idx, resolvedCurrentIdx, dotStatus)}`} />
                                    )}
                                    <div className={`mt-1 text-xs leading-snug truncate max-w-full ${stepperLabelClass(idx, resolvedCurrentIdx, dotStatus)}`}>{item.label}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-1.5 text-sm text-gray-600 sm:truncate" title={currentExtra}>
                            Current: <span className="font-semibold text-gray-900 break-words sm:break-normal">{currentExtra}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {status === 'denied' && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#991B1B]">
                          <XCircle className="h-4 w-4 shrink-0" /> Rejected
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredList.length === 0 && (
                <div className="col-span-full rounded-2xl bg-white border border-gray-200 p-8 text-center text-base text-gray-600">
                  {dateFilterActive && list.length > 0 ? (
                    <>
                      No approvals in this date range. Adjust the dates or{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setFilterDateFrom('');
                          setFilterDateTo('');
                        }}
                        className="font-semibold text-teal-700 hover:text-teal-800 underline underline-offset-2"
                      >
                        clear the date filter
                      </button>
                      .
                    </>
                  ) : (
                    <>No items found. Try clearing filters or searching with a different keyword.</>
                  )}
                </div>
              )}
            </div>
          </div>
      </main>

      {/* Agreement Preview Modal */}
      {showPreviewModal && selectedWorkflow && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-6xl max-h-[100dvh] sm:max-h-[95vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200 bg-gray-50 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-teal-600" />
                  <h3 className="text-lg font-extrabold text-gray-900 truncate">
                    Document Preview
                  </h3>
                </div>
                <div className="mt-1 line-clamp-2 sm:truncate text-sm text-gray-600">
                  {selectedWorkflow.documentId} • {selectedWorkflow.clientName || 'Unknown Client'}
                </div>
              </div>
              <button
                type="button"
                onClick={closePreviewModal}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 sm:p-6 min-h-0 flex-1 overflow-y-auto">
              {isPreviewLoading && (
                <div className="h-[45vh] sm:h-[60vh] md:h-[70vh] flex flex-col items-center justify-center text-gray-600">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                  <div className="mt-3 text-sm font-semibold">Loading agreement…</div>
                </div>
              )}

              {!isPreviewLoading && previewError && (
                <div className="h-[45vh] sm:h-[60vh] md:h-[70vh] flex items-center justify-center">
                  <div className="max-w-lg w-full rounded-xl border border-rose-200 bg-rose-50 p-5">
                    <div className="text-rose-800 font-extrabold">Unable to load agreement</div>
                    <div className="text-rose-700 text-sm mt-2">{previewError}</div>
                  </div>
                </div>
              )}

              {!isPreviewLoading && !previewError && documentPreviewUrl && (
                <div className="rounded-xl border border-gray-200 overflow-hidden overflow-y-auto max-h-[45vh] sm:max-h-[60vh] md:max-h-[70vh]" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <PdfCanvasViewer src={documentPreviewUrl} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalDashboard;

