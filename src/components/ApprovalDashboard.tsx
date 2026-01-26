import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
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

type ViewKey = 'dashboard' | 'pending' | 'approved' | 'rejected';

interface ApprovalDashboardProps {
  onStartManualApprovalWorkflow?: () => void;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const badgeClass = (status: string) => {
  switch (status) {
    case 'approved':
      // Vibrant approved (emerald)
      return 'bg-emerald-600 text-white ring-1 ring-emerald-600';
    case 'denied':
      // Ruby rejected
      return 'bg-[#E11D48] text-white ring-1 ring-[#E11D48]';
    case 'in_progress':
      return 'bg-sky-500 text-white ring-1 ring-sky-500';
    case 'pending':
    default:
      // High-contrast pending state (Amber #F59E0B) for readability on white backgrounds
      return 'bg-[#F59E0B] text-gray-900 ring-1 ring-black/10';
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
  if (s === 'denied') return 'bg-[#E11D48]';
  if (s === 'approved') return 'bg-emerald-500';
  if (idx < currentIdx) return 'bg-emerald-500';
  if (idx === currentIdx) return 'bg-[#F59E0B]';
  return 'bg-gray-300';
};

const stepperLabelClass = (idx: number, currentIdx: number, rawStatus?: string) => {
  const s = rawStatus || 'pending';
  if (s === 'denied') return 'text-red-600';
  if (s === 'approved') return 'text-emerald-700';
  if (idx === currentIdx) return 'text-gray-900 font-semibold';
  return 'text-gray-600';
};

const iconForView: Record<ViewKey, React.ComponentType<{ className?: string }>> = {
  dashboard: ShieldCheck,
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
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
    all,
    pending,
    approved,
    rejected,
    approvedToday,
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

    const pendingAll = safe.filter(isPending).filter(matchesQuery);
    const approvedAll = safe.filter(isApproved).filter(matchesQuery);
    const rejectedAll = safe.filter(isRejected).filter(matchesQuery);

    // Dashboard list: show everything (pending + approved + rejected), prioritized by status then recency.
    const statusRank = (s: string) => {
      if (s === 'pending' || s === 'in_progress') return 0;
      if (s === 'approved') return 1;
      if (s === 'denied') return 2;
      return 3;
    };
    const allSorted = safe
      .filter(matchesQuery)
      .sort((a: any, b: any) => {
        const ra = statusRank(a.status || 'pending');
        const rb = statusRank(b.status || 'pending');
        if (ra !== rb) return ra - rb;
        return +new Date(b.updatedAt || b.createdAt) - +new Date(a.updatedAt || a.createdAt);
      });

    const approvedTodayCount = safe.filter(isApproved).filter((w: any) => {
      const d = new Date(w.updatedAt || w.createdAt);
      return isSameDay(d, now);
    }).length;

    const rejectedTodayCount = safe.filter(isRejected).filter((w: any) => {
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
      sparkPending: sparkP,
      sparkApproved: sparkA,
      sparkRejected: sparkR,
    };
  }, [workflows, normalized]);

  const counts = {
    dashboard: workflows.length,
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
  };

  const list = useMemo(() => {
    switch (activeView) {
      case 'pending':
        return pending;
      case 'approved':
        return approved;
      case 'rejected':
        return rejected;
      default:
        // dashboard shows all (pending + approved + rejected)
        return all;
    }
  }, [activeView, all, pending, approved, rejected]);

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
  ];

  return (
    <div className="w-full min-h-screen overflow-hidden bg-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-72 flex-col border-r border-gray-200 bg-white">
          <div className="pt-4" />

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

          {/* CTA below navigation */}
          <div className="px-3 pb-6">
            <button
              type="button"
              onClick={onStartManualApprovalWorkflow}
              disabled={!onStartManualApprovalWorkflow}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] text-white px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-[#059669] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={onStartManualApprovalWorkflow ? 'Start Manual Approval Workflow' : 'Not available'}
            >
              <FileCheck className="h-4 w-4 text-white" />
              Start Manual Approval
            </button>
          </div>

          <div className="mt-auto p-4 text-xs text-gray-500">
            Tip: use search to find by deal, quote ID, client, or requester.
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-3 sm:p-4">
          {activeView === 'dashboard' && (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#EFF6FF] border border-blue-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Pending Approvals</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-gray-900">{pending.length}</div>
                    <Sparkline data={sparkPending} stroke="#3B82F6" />
                  </div>
                  <div className="mt-1.5 text-gray-700 text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Queue needing action
                  </div>
                </div>

                <div className="rounded-xl bg-[#ECFDF5] border border-emerald-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Approved Today</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-gray-900">{approvedToday}</div>
                    <Sparkline data={sparkApproved} stroke="#10B981" />
                  </div>
                  <div className="mt-1.5 text-gray-700 text-sm flex items-center gap-2">
                    <ThumbsUp className="h-4 w-4 text-emerald-600" />
                    Completed approvals
                  </div>
                </div>

                <div className="rounded-xl bg-[#FEF2F2] border border-red-100 p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide">Rejected</div>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-2xl font-extrabold text-red-500">{rejected.length}</div>
                    <Sparkline data={sparkRejected} stroke="#EF4444" />
                  </div>
                  <div className="mt-1.5 text-red-500 text-sm flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Denied workflows
                  </div>
                </div>
              </div>
            </>
          )}

          {/* List */}
          <div className="mt-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
              <div className="text-gray-900 font-bold">
                {activeView === 'dashboard' ? 'All Approvals' : sidebarItems.find((s) => s.key === activeView)?.label}
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
                const statusLabel = String(status).replace('_', ' ');
                const requestedBy = workflow.creatorEmail || '—';
                const createdAt = workflow.createdAt ? new Date(workflow.createdAt) : null;

                const teamStep = getStep(workflow, 'Team Approval');
                const technicalStep = getStep(workflow, 'Technical Team');
                const legalStep = getStep(workflow, 'Legal Team');
                const dealDeskStep = getStep(workflow, 'Deal Desk');

                return (
                  <div
                    key={workflow.id}
                    className="group rounded-xl bg-white border border-gray-200 p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)] hover:shadow-[0_6px_18px_rgba(15,23,42,0.10)] hover:border-gray-300 transition-all"
                  >
                    <div className="flex items-stretch justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_220px] gap-2">
                        <div className="min-w-0 lg:col-span-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-[#4F46E5] font-extrabold text-base truncate min-w-0">
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

                      <div className="shrink-0 w-[140px] flex flex-col items-stretch self-stretch">
                        <button
                          type="button"
                          onClick={() => openAgreementPreview(workflow)}
                          title="Preview document"
                          aria-label="Preview document"
                          className="w-full flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#4F46E5] border border-[#4F46E5] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#4338CA] hover:border-[#4338CA] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-2 transition-all whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4 text-white" />
                          <span className="sm:hidden">Preview</span>
                          <span className="hidden sm:inline">Preview Doc</span>
                        </button>
                      </div>
                    </div>

                    {/* Approval step summary (Team/Technical/Legal/Deal Desk) */}
                    {(() => {
                      const steps = [
                        { label: 'Team', step: teamStep, extra: teamStep ? [teamStep.group, teamStep.comments].filter(Boolean).join(' · ') : '' },
                        { label: 'Tech', step: technicalStep, extra: technicalStep?.comments || '' },
                        { label: 'Legal', step: legalStep, extra: legalStep?.comments || '' },
                        { label: 'Deal Desk', step: dealDeskStep, extra: dealDeskStep?.comments || '' },
                      ];

                      const currentIdx = Math.max(0, Number(workflow.currentStep || 1) - 1);
                      const currentItem = steps[currentIdx];
                      const currentExtra = currentItem?.extra
                        ? `${currentItem.label}: ${currentItem.extra}`
                        : `${currentItem?.label || 'Current'}: —`;

                      return (
                        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <div className="text-gray-700 text-xs font-bold uppercase tracking-wide">Approvals</div>
                            <div className="text-gray-500 text-xs">
                              Step {workflow.currentStep || 1} / {workflow.totalSteps || (workflow.workflowSteps?.length || 4)}
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
                                const title = [
                                  `${item.label}: ${stepStatusLabel(raw)}`,
                                  ...(item.extra ? [`Info: ${item.extra}`] : []),
                                  ...([who, grp, cmt, ts].filter(Boolean) as string[]),
                                ].join('\n');

                                const completed =
                                  raw === 'approved' || (idx < currentIdx && raw !== 'denied');
                                return (
                                  <div key={item.label} className="flex-1 min-w-0 flex flex-col items-center" title={title}>
                                    {completed ? (
                                      <div className="h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white flex items-center justify-center">
                                        <Check className="h-3 w-3 text-white" />
                                      </div>
                                    ) : (
                                      <div className={`h-4 w-4 rounded-full ring-2 ring-white ${stepperDotClass(idx, currentIdx, raw)}`} />
                                    )}
                                    <div className={`mt-1 text-[11px] truncate ${stepperLabelClass(idx, currentIdx, raw)}`}>{item.label}</div>
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

