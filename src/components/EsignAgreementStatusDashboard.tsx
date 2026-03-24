import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Check, Clock, XCircle, Eye, PenLine, Download, MoreVertical, ThumbsUp, Calendar } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import Navigation from './Navigation';

interface RecipientStatus {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  order?: number;
  comment?: string | null;
}

interface StatusModalDoc {
  id: string;
  file_name: string;
  status: string;
}

interface Agreement {
  id: string;
  file_name: string;
  uploaded_by?: string;
  upload_source?: string;
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

const EsignAgreementStatusDashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<StatusFilterTab>('all');
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<RecipientStatus[]>([]);
  const [statusModalLoading, setStatusModalLoading] = useState(false);
  const [statusModalDownloading, setStatusModalDownloading] = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [dateFilter, setDateFilter] = useState<{ type: 'none' } | { type: 'dateRange'; from: string; to: string }>({ type: 'none' });

  const closeActionsMenu = useCallback(() => {
    setOpenActionsId(null);
    setDropdownPosition(null);
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/agreement-status`);
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      if (!contentType.includes('application/json')) {
        setError('Backend returned an unexpected response. Ensure the API server is running (e.g. node server.cjs on port 3001) and restart it after code changes.');
        setAgreements([]);
        return;
      }
      let data: { success?: boolean; agreements?: Agreement[] };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError('Invalid response from server. Restart the backend server and try again.');
        setAgreements([]);
        return;
      }
      if (data.success && Array.isArray(data.agreements)) {
        setAgreements(data.agreements);
        setError(null);
      } else {
        setAgreements([]);
        if (!res.ok) setError((data as { error?: string }).error || `Request failed (${res.status})`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load. Is the backend server running?');
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'sent': return 'Sent';
      case 'denied': return 'Denied';
      case 'voided': return 'Voided';
      case 'draft': return 'Draft';
      default: return status || 'Draft';
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'sent': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'denied': return 'bg-red-100 text-red-800 border-red-200';
      case 'voided': return 'bg-slate-200 text-slate-700 border-slate-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const recipientStatusIcon = (status: string) => {
    if (status === 'signed') return <Check className="h-4 w-4 text-emerald-600 shrink-0" />;
    if (status === 'reviewed') return <Check className="h-4 w-4 text-amber-600 shrink-0" />;
    if (status === 'denied') return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    return <Clock className="h-4 w-4 text-slate-400 shrink-0" />;
  };

  const recipientStatusText = (status: string) => {
    if (status === 'signed') return 'Signed';
    if (status === 'reviewed') return 'Reviewed';
    if (status === 'denied') return 'Denied';
    return 'Pending';
  };

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

  const dateFilteredAgreements = applyDateFilter(agreements);

  const filterAgreementsByTab = (list: Agreement[]): Agreement[] => {
    switch (activeTab) {
      case 'completed':
        return list.filter((ag) => ag.status === 'completed');
      case 'pending':
        return list.filter((ag) => ag.status === 'draft' || ag.status === 'sent');
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
    pending: dateFilteredAgreements.filter((ag) => ag.status === 'draft' || ag.status === 'sent').length,
    rejected: dateFilteredAgreements.filter((ag) => ag.status === 'denied' || ag.status === 'voided').length
  };

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const endOfToday = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };
  const inToday = (ts: number) => ts >= startOfToday() && ts <= endOfToday();
  const completedTodayCount = agreements.filter((ag) => {
    if (ag.status !== 'completed') return false;
    const d = toDate(ag.signed_at) || toDate(ag.created_at);
    return d ? inToday(d.getTime()) : false;
  }).length;

  /** Stage names by position (Team Lead → Technical → Legal → Deal Desk) when role is generic. */
  const STAGE_BY_ORDER = ['Team Lead', 'Technical', 'Legal', 'Deal Desk'];

  /**
   * For "sent" status: which stage we're at (first pending recipient).
   * Uses role name if it's a known stage; otherwise uses order (0=Team Lead, 1=Technical, 2=Legal, 3=Deal Desk).
   */
  const getSentStage = (recipients: RecipientStatus[]): string => {
    const sorted = [...recipients].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const pendingIndex = sorted.findIndex((r) => r.status !== 'signed' && r.status !== 'reviewed' && r.status !== 'denied');
    if (pendingIndex < 0 || !recipients.length) return '';
    const pending = sorted[pendingIndex];
    const role = (pending.role || '').trim();
    if (role === 'Team Approval') return 'Team Lead';
    if (role === 'Technical Team') return 'Technical';
    if (role === 'Legal Team') return 'Legal';
    if (role === 'Deal Desk') return 'Deal Desk';
    if (role && role.toLowerCase() !== 'reviewer' && role.toLowerCase() !== 'signer') return role;
    return STAGE_BY_ORDER[pendingIndex] ?? STAGE_BY_ORDER[0];
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
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

  const openStatusModal = useCallback(async (agreementId: string) => {
    setStatusModalId(agreementId);
    setStatusModalDoc(null);
    setStatusModalRecipients([]);
    setStatusModalLoading(true);
    try {
      const [docRes, recRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}`),
        fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/recipients`),
      ]);
      const docData = await docRes.json();
      const recData = await recRes.json();
      if (docData.success && docData.document) {
        setStatusModalDoc({ id: docData.document.id || agreementId, file_name: docData.document.file_name, status: docData.document.status });
      }
      if (recData.success && Array.isArray(recData.recipients)) {
        const sorted = [...recData.recipients].sort((a: RecipientStatus, b: RecipientStatus) => ((a.order ?? 999) - (b.order ?? 999)));
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
      handleDownload(statusModalId, statusModalDoc.file_name);
    } finally {
      setStatusModalDownloading(false);
    }
  };

  const handleVoid = async (agreementId: string) => {
    if (!window.confirm('Void this agreement? Signing links will stop working. The document will stay in the list as voided.')) return;
    setVoidingId(agreementId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${agreementId}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        await fetchStatus();
        if (statusModalId === agreementId) closeStatusModal();
      } else {
        alert(data.error || `Void failed${!res.ok ? ` (${res.status})` : ''}`);
      }
    } catch {
      alert('Failed to void agreement.');
    } finally {
      setVoidingId(null);
    }
  };

  const handleStatusModalPreview = () => {
    if (!statusModalId) return;
    window.open(`${BACKEND_URL}/api/esign/documents/${statusModalId}/file?inline=1`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation currentTab="esign-tracking" />

      <div className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div
                className="rounded-xl border border-sky-200 bg-sky-50/80 p-5 flex items-start justify-between gap-4 min-h-[100px] cursor-pointer hover:bg-sky-100/80 hover:border-sky-300 transition-colors"
                onClick={() => setActiveTab('pending')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('pending'); } }}
                aria-label="View pending agreements"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Pending</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{tabCounts.pending}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    Queue needing action
                  </p>
                </div>
                <svg className="w-14 h-10 shrink-0 text-sky-400/70" viewBox="0 0 56 40" fill="none" aria-hidden>
                  <path d="M0 32 L8 28 L16 30 L24 24 L32 26 L40 22 L48 26 L56 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div
                className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-5 flex items-start justify-between gap-4 min-h-[100px] cursor-pointer hover:bg-emerald-100/80 hover:border-emerald-300 transition-colors"
                onClick={() => setActiveTab('completed')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('completed'); } }}
                aria-label="View completed agreements"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Completed today</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{completedTodayCount}</p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Completed agreements
                  </p>
                </div>
                <svg className="w-14 h-10 shrink-0 text-emerald-400/70" viewBox="0 0 56 40" fill="none" aria-hidden>
                  <path d="M0 28 L8 26 L16 28 L24 24 L32 26 L40 24 L48 26 L56 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div
                className="rounded-xl border border-red-200 bg-red-50/80 p-5 flex items-start justify-between gap-4 min-h-[100px] cursor-pointer hover:bg-red-100/80 hover:border-red-300 transition-colors"
                onClick={() => setActiveTab('rejected')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab('rejected'); } }}
                aria-label="View rejected agreements"
              >
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Rejected</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{tabCounts.rejected}</p>
                  <p className="text-xs text-red-600/90 mt-1 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Denied / voided
                  </p>
                </div>
                <svg className="w-14 h-10 shrink-0 text-red-300/70" viewBox="0 0 56 40" fill="none" aria-hidden>
                  <path d="M0 24 L8 28 L16 26 L24 30 L32 26 L40 28 L48 24 L56 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}
          {!loading && !error && agreements.length > 0 && (
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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

            {!loading && !error && agreements.length > 0 && (
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
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Stage</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredAgreements.map((ag) => (
                      <tr key={ag.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-900 truncate max-w-xs block" title={ag.file_name}>{ag.file_name}</span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[
                                  ag.uploaded_by,
                                  ag.upload_source === 'manual' ? 'Manual upload' : null,
                                  ag.requested_by ? `Requested by ${ag.requested_by}` : null,
                                  formatDate(ag.created_at),
                                ]
                                  .filter(Boolean)
                                  .join(' • ') || '—'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            {ag.status === 'sent' && getSentStage(ag.recipients) ? (
                              <>
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${statusBadgeClass(ag.status)}`}>
                                  {getSentStage(ag.recipients)}
                                </span>
                                <span className="text-xs text-slate-500">Sent</span>
                              </>
                            ) : (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border w-fit ${statusBadgeClass(ag.status)}`}>
                                {statusLabel(ag.status)}
                              </span>
                            )}
                            {(ag.status === 'denied' || ag.status === 'voided') && (() => {
                              const withComment = (ag.recipients || []).find((r) => r.comment);
                              return withComment ? (
                                <p className="text-xs text-slate-600 mt-1.5 max-w-xs truncate" title={withComment.comment || undefined}>
                                  Comment: {withComment.comment}
                                </p>
                              ) : null;
                            })()}
                          </div>
                        </td>
                        <td className="px-6 py-4">
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
                            {(ag.status === 'sent' || ag.status === 'completed' || ag.status === 'voided' || ag.status === 'denied') && (
                              <button
                                type="button"
                                onClick={() => openStatusModal(ag.id)}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
                              >
                                <Eye className="h-4 w-4" />
                                View status
                              </button>
                            )}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                )}
              {openActionsId && dropdownPosition && (() => {
                const openAgreement = filteredAgreements.find((a) => a.id === openActionsId);
                if (!openAgreement) return null;
                const status = (openAgreement.status || '').toLowerCase();
                const showDownload = status === 'signed' || status === 'completed' || status === 'denied';
                return createPortal(
                  <>
                    <div className="fixed inset-0 z-40" aria-hidden onClick={closeActionsMenu} />
                    <div
                      className="fixed z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                      style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {status === 'sent' && (
                        <button
                          type="button"
                          onClick={() => { handleVoid(openAgreement.id); closeActionsMenu(); }}
                          disabled={voidingId === openAgreement.id}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {voidingId === openAgreement.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
                          Void
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
                        {statusModalRecipients.map((rec, idx) => {
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
    </div>
  );
};

export default EsignAgreementStatusDashboard;
