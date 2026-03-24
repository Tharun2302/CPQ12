import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  FileCheck,
  FileText,
  ListChecks,
  Loader2,
  PenLine,
  Search,
  ThumbsUp,
  X,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { useAuth } from '../hooks/useAuth';
import { BACKEND_URL } from '../config/api';

type ViewKey = 'dashboard' | 'pending' | 'approved' | 'rejected';

/** When on dashboard, optionally narrow the list (e.g. "approved today" from the green metric card). */
type DashboardListFilter = 'all' | 'approved_today';

interface ApprovalDashboardProps {
  onStartManualApprovalWorkflow?: () => void;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const badgeClass = (status: string) => {
  switch (status) {
    case 'approved':
      // Soft Mint Green with dark green text
      return 'bg-[#DCFCE7] text-[#166534] ring-1 ring-[#86EFAC]';
    case 'denied':
      // Soft Coral Red
      return 'bg-[#FCA5A5] text-[#991B1B] ring-1 ring-[#FCA5A5]';
    case 'in_progress':
      return 'bg-[#2563EB] text-white ring-1 ring-[#2563EB]';
    case 'pending':
    default:
      // Warm Amber with dark brown text
      return 'bg-[#FEF3C7] text-[#78350F] ring-1 ring-[#FDE68A]';
  }
};

const Sparkline: React.FC<{ data: number[]; stroke: string }> = ({ data, stroke }) => {
  const w = 56;
  const h = 18;
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
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
    </svg>
  );
};

const getStep = (workflow: any, role: string) => {
  const steps = workflow?.workflowSteps || [];
  return steps.find((s: any) => s?.role === role);
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

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ onStartManualApprovalWorkflow }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [dashboardListFilter, setDashboardListFilter] = useState<DashboardListFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [esignCreatingId, setEsignCreatingId] = useState<string | null>(null);
  const [esignError, setEsignError] = useState<string | null>(null);

  const {
    workflows,
    refreshWorkflows,
  } = useApprovalWorkflows();

  // Refetch workflows when user returns to this tab/window so Deal Desk "Email sent" shows after Legal approval
  const refreshRef = useRef(refreshWorkflows);
  refreshRef.current = refreshWorkflows;
  useEffect(() => {
    const onFocus = () => refreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const now = new Date();
  const today0 = startOfDay(now);
  const yesterday0 = new Date(today0);
  yesterday0.setDate(today0.getDate() - 1);

  const normalized = query.trim().toLowerCase();

  const {
    all,
    pending,
    approved,
    rejected,
    approvedToday,
    approvedTodayList,
    sparkPending,
    sparkApproved,
    sparkRejected,
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

    const approvedTodayList = safe
      .filter(isApproved)
      .filter((w: any) => {
        const d = new Date(w.updatedAt || w.createdAt);
        return isSameDay(d, now);
      })
      .filter(matchesQuery)
      .sort(sortByCreatedAt);

    const approvedTodayCount = safe.filter(isApproved).filter((w: any) => {
      const d = new Date(w.updatedAt || w.createdAt);
      return isSameDay(d, now);
    }).length;

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

    for (const w of safe) {
      const createdKey = w.createdAt ? startOfDay(new Date(w.createdAt)).toISOString().slice(0, 10) : null;
      const updatedKey = (w.updatedAt || w.createdAt) ? startOfDay(new Date(w.updatedAt || w.createdAt)).toISOString().slice(0, 10) : null;

      if (createdKey) {
        const idx = idxFor(createdKey);
        if (idx >= 0 && isPending(w)) sparkP[idx] += 1;
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
      approvedToday: approvedTodayCount,
      approvedTodayList,
      sparkPending: sparkP,
      sparkApproved: sparkA,
      sparkRejected: sparkR,
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
        // dashboard: all items, or narrowed by metric card (e.g. approved today)
        if (dashboardListFilter === 'approved_today') {
          return approvedTodayList;
        }
        return all;
    }
  }, [activeView, dashboardListFilter, all, approvedTodayList, pending, approved, rejected]);

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

  const handleStartEsign = async (workflow: any) => {
    const docId = workflow?.documentId;
    if (!docId) {
      setEsignError('No document linked to this workflow.');
      return;
    }
    setEsignCreatingId(workflow.id);
    setEsignError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/from-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          uploaded_by: user?.email || 'approval-workflow',
          workflowId: workflow.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to create e-sign document');
      if (data.success && data.document?.id) {
        navigate(`/esign/${data.document.id}/place-fields`);
        return;
      }
      throw new Error('Invalid response');
    } catch (e) {
      setEsignError(e instanceof Error ? e.message : 'Failed to start e-sign');
    } finally {
      setEsignCreatingId(null);
    }
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
        if (result?.success && result?.dataUrl) {
          setDocumentPreviewUrl(result.dataUrl as string);
          setIsPreviewLoading(false);
          return;
        }
      }

      // 2) Fallback: fetch the document file directly
      const directResp = await fetch(`${BACKEND_URL}/api/documents/${docId}`);
      if (!directResp.ok) {
        setPreviewError(`Document not found (HTTP ${directResp.status}).`);
        setIsPreviewLoading(false);
        return;
      }
      const blob = await directResp.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      setDocumentPreviewUrl(objectUrl);
      setIsPreviewLoading(false);
    } catch (e) {
      console.error('Failed to load agreement preview:', e);
      setPreviewError('Failed to load the agreement. Please try again.');
      setIsPreviewLoading(false);
    }
  };

  const listSectionTitle =
    activeView === 'dashboard'
      ? dashboardListFilter === 'approved_today'
        ? 'Approved today'
        : 'All Approvals'
      : activeView === 'pending'
        ? 'Pending Approvals'
        : activeView === 'approved'
          ? 'Approved'
          : 'Rejected';

  return (
    <div className="w-full min-h-screen overflow-hidden bg-white" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif" }}>
      {/* Back to home */}
      <button
        type="button"
        onClick={() => navigate('/deal')}
        className="fixed top-4 left-4 z-50 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-lg transition-colors"
        title="Back to home"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-medium">Back to home</span>
      </button>

      <main className="w-full min-w-0 p-3 sm:p-4">
          {/* Metric cards — primary navigation (replaces removed sidebar) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('pending');
                    setDashboardListFilter('all');
                  }}
                  className={`rounded-xl bg-amber-50 border p-3 shadow-md text-left w-full transition-all hover:shadow-lg hover:border-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${
                    activeView === 'pending'
                      ? 'border-amber-500 ring-2 ring-amber-400/50'
                      : 'border-amber-200/90'
                  }`}
                  aria-label={`Pending approvals: ${pending.length} in queue. Click to view the pending list.`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-amber-900/80 text-xs font-semibold uppercase tracking-wide">Pending Approvals</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-amber-950">{pending.length}</div>
                    <Sparkline data={sparkPending} stroke="#D97706" />
                  </div>
                  <div className="mt-1.5 text-amber-950/90 text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Queue needing action
                  </div>
                  <div className="mt-2 text-[11px] text-amber-800 font-medium">Click to open pending list</div>
                </button>

                <div
                  className={`rounded-xl border bg-[#DCFCE7] p-3 shadow-md flex flex-col gap-2 ${
                    activeView === 'approved' ? 'border-[#15803d] ring-2 ring-[#15803d]/35' : 'border-[#86EFAC]'
                  }`}
                >
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('dashboard');
                    setDashboardListFilter('approved_today');
                  }}
                  className={`rounded-lg border p-3 text-left w-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#15803d] focus-visible:ring-offset-2 ${
                    dashboardListFilter === 'approved_today' && activeView === 'dashboard'
                      ? 'bg-[#BBF7D0] border-[#15803d] ring-2 ring-[#15803d]/40 shadow-lg'
                      : 'bg-[#DCFCE7] border-[#86EFAC] hover:shadow-lg hover:border-[#4ADE80]'
                  }`}
                  aria-pressed={dashboardListFilter === 'approved_today'}
                  aria-label={`Approved today: ${approvedToday} deals. Click to list deals approved today.`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[#166534] text-xs font-semibold uppercase tracking-wide">Approved Today</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-[#166534]">{approvedToday}</div>
                    <Sparkline data={sparkApproved} stroke="#166534" />
                  </div>
                  <div className="mt-1.5 text-[#166534] text-sm flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-[#166534]" />
                    Completed approvals
                  </div>
                  <div className="mt-2 text-[11px] text-[#14532d] font-semibold">Click to show these deals below</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('approved');
                    setDashboardListFilter('all');
                  }}
                  className="text-left text-[11px] font-semibold text-[#14532d] hover:text-[#15803d] underline underline-offset-2"
                >
                  View all approved ({approved.length})
                </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveView('rejected');
                    setDashboardListFilter('all');
                  }}
                  className={`rounded-xl bg-[#FEF2F2] border p-3 shadow-md text-left w-full transition-all hover:shadow-lg hover:border-rose-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
                    activeView === 'rejected' ? 'border-rose-500 ring-2 ring-rose-400/50' : 'border-[#FCA5A5]'
                  }`}
                  aria-label="Show rejected workflows"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[#991B1B] text-xs font-semibold uppercase tracking-wide">Rejected</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-[#991B1B]">{rejected.length}</div>
                    <Sparkline data={sparkRejected} stroke="#FCA5A5" />
                  </div>
                  <div className="mt-1.5 text-[#991B1B] text-sm flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-[#991B1B]" />
                    Denied workflows
                  </div>
                  <div className="mt-2 text-[11px] text-rose-800 font-medium">Click to open Rejected list</div>
                </button>
              </div>

          {/* List */}
          <div className="mt-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-gray-900 font-bold">{listSectionTitle}</div>
                {activeView !== 'dashboard' && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('dashboard');
                      setDashboardListFilter('all');
                    }}
                    className="text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-2"
                  >
                    All approvals
                  </button>
                )}
                {activeView === 'dashboard' && dashboardListFilter === 'approved_today' && (
                  <button
                    type="button"
                    onClick={() => setDashboardListFilter('all')}
                    className="text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8] underline underline-offset-2"
                  >
                    View all approvals
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3 md:flex-wrap md:justify-end">
                <button
                  type="button"
                  onClick={onStartManualApprovalWorkflow}
                  disabled={!onStartManualApprovalWorkflow}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-white px-4 py-2.5 text-sm font-semibold shadow-md hover:bg-[#1D4ED8] transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
                  title={onStartManualApprovalWorkflow ? 'Start Manual Approval Workflow' : 'Not available'}
                >
                  <FileCheck className="h-4 w-4 text-white" />
                  Start Manual Approval
                </button>
                <div className="w-full md:w-[420px]">
                  <div className="flex items-center gap-2 rounded-2xl bg-white border border-gray-200 px-4 py-2.5 shadow-sm">
                    <Search className="h-4 w-4 text-gray-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by deal / quote ID / client / requester…"
                      className="w-full bg-transparent outline-none text-gray-900 placeholder:text-gray-400 text-sm"
                    />
                  </div>
                </div>
                <div className="text-gray-600 text-sm md:whitespace-nowrap md:text-right">
                  Showing <span className="text-gray-900 font-semibold">{list.length}</span> items
                </div>
              </div>
            </div>

            {esignError && (
              <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-4 py-2 text-rose-800 text-sm flex items-center justify-between gap-2">
                <span>{esignError}</span>
                <button type="button" onClick={() => setEsignError(null)} className="text-rose-600 hover:text-rose-800" aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {list.map((workflow: any) => {
                const status = workflow.status || 'pending';
                const statusLabel = String(status).replace('_', ' ');
                const requestedBy = workflow.creatorName || workflow.creatorEmail || '—';
                const createdAt = workflow.createdAt ? new Date(workflow.createdAt) : null;

                const teamStep = getStep(workflow, 'Team Approval');
                const technicalStep = getStep(workflow, 'Technical Team');
                const legalStep = getStep(workflow, 'Legal Team');
                const dealDeskStep = getStep(workflow, 'Deal Desk');

                return (
                  <div
                    key={workflow.id}
                    className="group rounded-xl bg-white border border-gray-200 p-5 shadow-[0_2px_12px_rgba(15,23,42,0.08)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.12)] hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-stretch justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_220px] gap-2">
                        <div className="min-w-0 lg:col-span-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-[#2563EB] font-extrabold text-base truncate min-w-0">
                              {workflow.documentId || 'Untitled Quote / SOW'}
                            </div>
                            <span
                              className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap ${badgeClass(
                                status
                              )}`}
                              aria-label={`Status: ${statusLabel}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-1 text-gray-700 text-sm">
                            Requested by <span className="text-gray-900 font-semibold">{requestedBy}</span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide">Created</div>
                          <div className="mt-1 text-gray-900 font-semibold">
                            {createdAt ? createdAt.toLocaleDateString('en-GB') : '—'}
                          </div>
                          <div className="text-gray-600 text-xs">
                            {createdAt ? createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide">Client</div>
                          <div className="mt-1 text-gray-900 font-bold truncate">
                            {workflow.clientName || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col sm:flex-row gap-2 self-stretch">
                        {workflow?.documentId &&
                          legalStep?.status === 'approved' &&
                          (workflow.esignDocumentId ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/esign/${workflow.esignDocumentId}/status`)}
                              title="View e-sign status (Recipient 1 & 2)"
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] border border-[#2563EB] px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-[#1D4ED8] hover:border-[#1D4ED8] transition-all whitespace-nowrap"
                            >
                              <ListChecks className="h-4 w-4 text-white" />
                              <span className="hidden sm:inline">View e-sign status</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEsign(workflow)}
                              disabled={esignCreatingId === workflow.id}
                              title="Send for e-signature after Legal — Recipient 1 & 2"
                              aria-label="Send for e-signature"
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#10B981] border border-[#10B981] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#059669] hover:border-[#059669] transition-all whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {esignCreatingId === workflow.id ? (
                                <Loader2 className="h-4 w-4 text-white animate-spin" />
                              ) : (
                                <PenLine className="h-4 w-4 text-white" />
                              )}
                              <span className="hidden sm:inline">Send for signature</span>
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => openAgreementPreview(workflow)}
                          title="Preview document"
                          aria-label="Preview document"
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-transparent border border-[#64748B] px-4 py-2 text-sm font-semibold text-[#64748B] shadow-sm hover:bg-[#64748B] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 focus-visible:ring-offset-2 transition-all whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4 text-white" />
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
                      const baseSteps = [
                        { label: 'Team', step: teamStep, extra: teamStep ? [teamStep.group, teamStep.comments].filter(Boolean).join(' · ') : '' },
                        { label: 'Tech', step: technicalStep, extra: technicalStep?.comments || '' },
                        { label: 'Legal', step: legalStep, extra: legalStep?.comments || '' },
                      ];
                      const dealDeskStepItem = { label: 'Deal Desk', step: dealDeskStep, extra: dealDeskExtra };
                      const steps = [...baseSteps, dealDeskStepItem];

                      const currentIdx = steps.findIndex((item) => {
                        const raw = item.step?.status || 'pending';
                        return raw !== 'approved' && raw !== 'notified' && raw !== 'signed';
                      });
                      const resolvedCurrentIdx = currentIdx === -1 ? steps.length - 1 : currentIdx;
                      const currentItem = steps[resolvedCurrentIdx];
                      const currentExtra = currentItem?.extra
                        ? `${currentItem.label}: ${currentItem.extra}`
                        : `${currentItem?.label || 'Current'}: —`;

                      return (
                        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="text-gray-700 text-xs font-bold uppercase tracking-wide">Approvals</div>
                            <div className="text-gray-500 text-xs">
                              Step {resolvedCurrentIdx + 1} / {steps.length}
                            </div>
                          </div>

                          <div className="mt-2 relative">
                            <div className="absolute left-0 right-0 top-[9px] h-px bg-gray-200" />
                            <div className="relative z-10 flex items-start justify-between gap-2">
                              {steps.map((item, idx) => {
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
                                      <div className="h-4 w-4 rounded-full bg-[#86EFAC] ring-2 ring-white flex items-center justify-center">
                                        <Check className="h-3 w-3 text-[#166534]" />
                                      </div>
                                    ) : (
                                      <div className={`h-4 w-4 rounded-full ring-2 ring-white ${stepperDotClass(idx, resolvedCurrentIdx, dotStatus)}`} />
                                    )}
                                    <div className={`mt-1 text-[11px] truncate ${stepperLabelClass(idx, resolvedCurrentIdx, dotStatus)}`}>{item.label}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="mt-1 text-xs text-gray-600 truncate" title={currentExtra}>
                            Current: <span className="text-gray-900 font-semibold">{currentExtra}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {status === 'denied' && (
                      <div className="mt-4">
                        <span className="inline-flex items-center gap-2 text-[#991B1B] text-sm font-semibold">
                          <XCircle className="h-4 w-4" /> Rejected
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {list.length === 0 && (
                <div className="col-span-full rounded-2xl bg-white border border-gray-200 p-8 text-center text-gray-600">
                  No items found. Try clearing filters or searching with a different keyword.
                </div>
              )}
            </div>
          </div>
      </main>

      {/* Agreement Preview Modal */}
      {showPreviewModal && selectedWorkflow && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#2563EB]" />
                  <h3 className="text-lg font-extrabold text-gray-900 truncate">
                    Document Preview
                  </h3>
                </div>
                <div className="text-xs text-gray-600 mt-1 truncate">
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

            <div className="p-6">
              {isPreviewLoading && (
                <div className="h-[70vh] flex flex-col items-center justify-center text-gray-600">
                  <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
                  <div className="mt-3 text-sm font-semibold">Loading agreement…</div>
                </div>
              )}

              {!isPreviewLoading && previewError && (
                <div className="h-[70vh] flex items-center justify-center">
                  <div className="max-w-lg w-full rounded-xl border border-rose-200 bg-rose-50 p-5">
                    <div className="text-rose-800 font-extrabold">Unable to load agreement</div>
                    <div className="text-rose-700 text-sm mt-2">{previewError}</div>
                  </div>
                </div>
              )}

              {!isPreviewLoading && !previewError && documentPreviewUrl && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <iframe
                    src={documentPreviewUrl}
                    title="Agreement Preview"
                    className="w-full h-[70vh] border-0"
                  />
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

