import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle,
  Clock,
  FileCheck,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  ThumbsUp,
  X,
  XCircle,
} from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';

type ViewKey = 'dashboard' | 'pending' | 'approved' | 'rejected' | 'history';

interface ApprovalDashboardProps {
  onStartManualApprovalWorkflow?: () => void;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const pctChange = (today: number, yesterday: number) => {
  if (yesterday === 0) return today === 0 ? 0 : 100;
  return Math.round(((today - yesterday) / yesterday) * 100);
};

const badgeClass = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    case 'denied':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    case 'in_progress':
      return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200';
    default:
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  }
};

const getStep = (workflow: any, role: string) => {
  const steps = workflow?.workflowSteps || [];
  return steps.find((s: any) => s?.role === role);
};

const stepStatusLabel = (status?: string) => {
  if (!status) return 'pending';
  return status === 'denied' ? 'rejected' : status.replace('_', ' ');
};

const iconForView: Record<ViewKey, React.ComponentType<{ className?: string }>> = {
  dashboard: ShieldCheck,
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  history: FileCheck,
};

const ApprovalDashboard: React.FC<ApprovalDashboardProps> = ({ onStartManualApprovalWorkflow }) => {
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [query, setQuery] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<any | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const {
    workflows,
  } = useApprovalWorkflows();

  const now = new Date();
  const today0 = startOfDay(now);
  const yesterday0 = new Date(today0);
  yesterday0.setDate(today0.getDate() - 1);

  const normalized = query.trim().toLowerCase();

  const {
    pending,
    approved,
    rejected,
    history,
    approvedToday,
    rejectedToday,
    trendPendingPct,
    trendApprovedPct,
    trendRejectedPct,
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

    const pendingAll = safe.filter(isPending).filter(matchesQuery);
    const approvedAll = safe.filter(isApproved).filter(matchesQuery);
    const rejectedAll = safe.filter(isRejected).filter(matchesQuery);

    const historyAll = safe
      .filter((w: any) => w.status === 'approved' || w.status === 'denied')
      .filter(matchesQuery)
      .sort((a: any, b: any) => +new Date(b.updatedAt || b.createdAt) - +new Date(a.updatedAt || a.createdAt));

    const approvedTodayCount = safe.filter(isApproved).filter((w: any) => {
      const d = new Date(w.updatedAt || w.createdAt);
      return isSameDay(d, now);
    }).length;

    const rejectedTodayCount = safe.filter(isRejected).filter((w: any) => {
      const d = new Date(w.updatedAt || w.createdAt);
      return isSameDay(d, now);
    }).length;

    const pendingToday = safe.filter(isPending).filter((w: any) => isSameDay(new Date(w.createdAt), now)).length;
    const pendingYesterday = safe
      .filter(isPending)
      .filter((w: any) => isSameDay(new Date(w.createdAt), yesterday0)).length;

    const approvedYesterday = safe.filter(isApproved).filter((w: any) => isSameDay(new Date(w.updatedAt || w.createdAt), yesterday0)).length;
    const rejectedYesterday = safe.filter(isRejected).filter((w: any) => isSameDay(new Date(w.updatedAt || w.createdAt), yesterday0)).length;

    return {
      pending: pendingAll,
      approved: approvedAll,
      rejected: rejectedAll,
      history: historyAll,
      approvedToday: approvedTodayCount,
      rejectedToday: rejectedTodayCount,
      trendPendingPct: pctChange(pendingToday, pendingYesterday),
      trendApprovedPct: pctChange(approvedTodayCount, approvedYesterday),
      trendRejectedPct: pctChange(rejectedTodayCount, rejectedYesterday),
    };
  }, [workflows, normalized]);

  const counts = {
    dashboard: workflows.length,
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    history: history.length,
  };

  const list = useMemo(() => {
    switch (activeView) {
      case 'pending':
        return pending;
      case 'approved':
        return approved;
      case 'rejected':
        return rejected;
      case 'history':
        return history;
      default:
        // dashboard shows pending first (speedy decision-making)
        return pending;
    }
  }, [activeView, pending, approved, rejected, history]);

  const trendChip = (pct: number) => {
    const positive = pct >= 0;
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          positive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
        }`}
      >
        {positive ? `+${pct}%` : `${pct}%`}
      </span>
    );
  };

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

  const sidebarItems: Array<{ key: ViewKey; label: string }> = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'pending', label: 'Pending Approvals' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'history', label: 'History / Audit Logs' },
  ];

  return (
    <div className="w-full min-h-screen overflow-hidden bg-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-72 flex-col border-r border-gray-200 bg-white">
          <div className="px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg" />
              <div>
                <div className="text-gray-900 font-bold text-sm tracking-wide">Approval</div>
                <div className="text-gray-500 text-xs">Management</div>
              </div>
            </div>
          </div>

          {/* Primary CTA under "Approval Management" */}
          <div className="px-3 -mt-2 pb-4">
            <button
              type="button"
              onClick={onStartManualApprovalWorkflow}
              disabled={!onStartManualApprovalWorkflow}
              className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
              title={onStartManualApprovalWorkflow ? 'Start Manual Approval Workflow' : 'Not available'}
            >
              <span className="flex items-center gap-3">
                <FileCheck className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold">Start Manual Approval Workflow</span>
              </span>
            </button>
          </div>

          <nav className="px-3 pb-6 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = iconForView[item.key];
              const active = item.key === activeView;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveView(item.key)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    active
                      ? 'bg-indigo-50 text-indigo-900 shadow-sm ring-1 ring-indigo-100'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      active ? 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200' : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'
                    }`}
                  >
                    {counts[item.key]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto p-4 text-xs text-gray-500">
            Tip: use search to find by deal, quote ID, client, or requester.
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-3 sm:p-4">
          {/* Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Pending Approvals</div>
                {trendChip(trendPendingPct)}
              </div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{pending.length}</div>
              <div className="mt-1.5 text-gray-600 text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Queue needing action
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Approved Today</div>
                {trendChip(trendApprovedPct)}
              </div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{approvedToday}</div>
              <div className="mt-1.5 text-gray-600 text-sm flex items-center gap-2">
                <ThumbsUp className="h-4 w-4 text-emerald-600" />
                Completed approvals
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">Rejected</div>
                {trendChip(trendRejectedPct)}
              </div>
              <div className="mt-2 text-2xl font-extrabold text-gray-900">{rejected.length}</div>
              <div className="mt-1.5 text-gray-600 text-sm flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-600" />
                Denied workflows
              </div>
            </div>
          </div>

          {/* List */}
          <div className="mt-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <div className="text-gray-900 font-bold">
                {activeView === 'dashboard' ? 'Pending Approvals' : sidebarItems.find((s) => s.key === activeView)?.label}
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
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

            <div className="grid grid-cols-1 gap-3">
              {list.map((workflow: any) => {
                const status = workflow.status || 'pending';
                const requestedBy = workflow.creatorEmail || '—';
                const createdAt = workflow.createdAt ? new Date(workflow.createdAt) : null;

                const teamStep = getStep(workflow, 'Team Approval');
                const technicalStep = getStep(workflow, 'Technical Team');
                const legalStep = getStep(workflow, 'Legal Team');
                const dealDeskStep = getStep(workflow, 'Deal Desk');

                return (
                  <div
                    key={workflow.id}
                    className="group rounded-xl bg-white border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="min-w-0 lg:col-span-1">
                          <div className="text-gray-900 font-extrabold text-base truncate">
                            {workflow.documentId || 'Untitled Quote / SOW'}
                          </div>
                          <div className="mt-1 text-gray-600 text-sm">
                            Requested by <span className="text-gray-900 font-semibold">{requestedBy}</span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide">Created</div>
                          <div className="mt-1 text-gray-900 font-semibold">
                            {createdAt ? createdAt.toLocaleDateString('en-GB') : '—'}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {createdAt ? createdAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                          </div>
                        </div>

                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide">Client</div>
                          <div className="mt-1 text-gray-900 font-semibold truncate">
                            {workflow.clientName || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAgreementPreview(workflow)}
                          className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-50 transition-all"
                        >
                          View Doc
                        </button>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${badgeClass(status)}`}>
                          {String(status).replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Approval step summary (Team/Technical/Legal/Deal Desk) */}
                    <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-gray-700 text-xs font-bold uppercase tracking-wide">Approvals</div>
                        <div className="text-gray-500 text-xs">
                          Step {workflow.currentStep || 1} / {workflow.totalSteps || (workflow.workflowSteps?.length || 4)}
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {[
                          { label: 'Team', step: teamStep, extra: teamStep ? [teamStep.group, teamStep.comments].filter(Boolean).join(' · ') : '' },
                          { label: 'Tech', step: technicalStep, extra: technicalStep?.comments || '' },
                          { label: 'Legal', step: legalStep, extra: legalStep?.comments || '' },
                          { label: 'Deal Desk', step: dealDeskStep, extra: dealDeskStep?.comments || '' },
                        ].map((item) => {
                          const stepStatus = item.step?.status || 'pending';
                          return (
                            <div
                              key={item.label}
                              className="rounded-lg bg-white border border-gray-200 px-2 py-2 overflow-hidden"
                            >
                              <div className="text-gray-500 text-[11px] font-semibold uppercase tracking-wide leading-tight">
                                {item.label}
                              </div>
                              <div className="mt-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${badgeClass(stepStatus)}`}>
                                  {stepStatusLabel(stepStatus)}
                                </span>
                              </div>
                              <div className="mt-2 text-gray-700 text-xs min-h-[16px]">
                                <span className="break-words">
                                  {item.extra || '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {(status === 'approved' || status === 'denied') && (
                      <div className="mt-4">
                        {status === 'approved' && (
                          <span className="inline-flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                            <CheckCircle className="h-4 w-4" /> Approved
                          </span>
                        )}
                        {status === 'denied' && (
                          <span className="inline-flex items-center gap-2 text-rose-700 text-sm font-semibold">
                            <XCircle className="h-4 w-4" /> Rejected
                          </span>
                        )}
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
      </div>

      {/* Agreement Preview Modal */}
      {showPreviewModal && selectedWorkflow && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-indigo-600" />
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
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
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

