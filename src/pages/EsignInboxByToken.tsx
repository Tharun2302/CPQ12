import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FileText, Loader2, PenLine, ShieldX, ArrowRight, User, BarChart3, CheckCircle, X, Eye, Check, XCircle } from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface QueueItem {
  documentId: string;
  file_name: string;
  signing_token: string;
  role: string;
}

interface HistoryItem {
  documentId: string;
  file_name: string;
  status: string;
  documentStatus: string;
}

interface InboxResponse {
  success: boolean;
  role?: string;
  workflow?: string;
  queue?: QueueItem[];
  history?: HistoryItem[];
  error?: string;
}

/**
 * E-Sign inbox opened from email link (no login). Token in URL = signing_token.
 * Shows "My E-Sign Queue" (pending) and "Workflow Status" (history) like the approval dashboard.
 */
const EsignInboxByToken: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [data, setData] = useState<InboxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'status'>('queue');
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedQueueItem, setSelectedQueueItem] = useState<QueueItem | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showDenyComment, setShowDenyComment] = useState(false);
  const [denyComment, setDenyComment] = useState('');
  const refreshInbox = useCallback(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/esign/inbox-by-token?token=${encodeURIComponent(token)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: InboxResponse | null) => {
        if (json?.success) setData(json);
      })
      .catch(() => {});
  }, [token]);

  const openDocumentModal = useCallback((item: QueueItem) => {
    setSelectedQueueItem(item);
    setShowDocumentModal(true);
    setShowDenyComment(false);
    setDenyComment('');
    setReviewError(null);
  }, []);

  const closeDocumentModal = useCallback(() => {
    setShowDocumentModal(false);
    setSelectedQueueItem(null);
    setShowDenyComment(false);
    setDenyComment('');
    setReviewError(null);
  }, []);

  const isReviewer = (selectedQueueItem?.role || '').toString().toLowerCase() === 'reviewer';

  const handleApprove = useCallback(async () => {
    if (!selectedQueueItem?.signing_token) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/mark-reviewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signing_token: selectedQueueItem.signing_token, action: 'approve' }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        closeDocumentModal();
        refreshInbox();
      } else {
        setReviewError(json.error || 'Failed to approve');
      }
    } catch {
      setReviewError('Request failed');
    } finally {
      setReviewSubmitting(false);
    }
  }, [selectedQueueItem?.signing_token, closeDocumentModal, refreshInbox]);

  const handleDeny = useCallback(async () => {
    if (!selectedQueueItem?.signing_token) return;
    if (!showDenyComment) {
      setShowDenyComment(true);
      return;
    }
    const comment = denyComment.trim();
    if (!comment) {
      setReviewError('Comment is required when denying');
      return;
    }
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/mark-reviewed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signing_token: selectedQueueItem.signing_token, action: 'deny', comment }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.success) {
        closeDocumentModal();
        refreshInbox();
      } else {
        setReviewError(json.error || 'Failed to deny');
      }
    } catch {
      setReviewError('Request failed');
    } finally {
      setReviewSubmitting(false);
    }
  }, [selectedQueueItem?.signing_token, showDenyComment, denyComment, closeDocumentModal, refreshInbox]);

  useEffect(() => {
    if (!token) {
      setStatus('denied');
      return;
    }
    const controller = new AbortController();
    fetch(`${BACKEND_URL}/api/esign/inbox-by-token?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 403 || !res.ok) {
          setStatus('denied');
          return null;
        }
        return res.json();
      })
      .then((json: InboxResponse | null) => {
        if (json?.success) {
          const queue = json.queue ?? [];
          if (queue.length > 0 && queue[0].signing_token) {
            navigate(`/sign/${queue[0].signing_token}`, { replace: true });
            return;
          }
          setData(json);
          setStatus('ok');
        } else {
          setStatus('denied');
        }
      })
      .catch(() => setStatus('denied'));

    return () => controller.abort();
  }, [token, navigate]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
          <ShieldX className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{token ? 'Access Denied' : 'Open your dashboard'}</h1>
          <p className="text-slate-600">
            {token
              ? 'This link is invalid or has expired. Please use the link from your email to open your dashboard.'
              : 'No login required. Use the link from your email (Option 1 – “Team Lead Dashboard”) to open your queue and documents.'}
          </p>
        </div>
      </div>
    );
  }

  const queue = data?.queue ?? [];
  const history = data?.history ?? [];

  const roleKey = (data?.role || '').toString().toLowerCase();
  const dashboardTitle =
    roleKey === 'technical' ? 'Technical Dashboard'
    : roleKey === 'legal' ? 'Legal Dashboard'
    : 'Team Lead Dashboard';

  const tabs = [
    { id: 'queue' as const, label: 'My Queue', icon: User, count: queue.length },
    { id: 'status' as const, label: 'Workflow Status', icon: BarChart3, count: history.length },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
              <PenLine className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{dashboardTitle}</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex space-x-1 overflow-x-auto py-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-200 ${
                    isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {activeTab === 'queue' && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">My Queue</h2>
            {queue.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p>No documents pending your signature.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map((doc) => (
                  <div
                    key={doc.documentId + doc.signing_token}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4"
                  >
                    <button
                      type="button"
                      onClick={() => openDocumentModal(doc)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left hover:bg-slate-50 -m-2 p-2 rounded-lg transition-colors"
                    >
                      <FileText className="w-10 h-10 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{doc.file_name}</p>
                        <p className="text-sm text-slate-500">Click to view document, then review or sign</p>
                      </div>
                      <Eye className="w-5 h-5 text-slate-400 shrink-0" />
                    </button>
                    <a
                      href={`${window.location.origin}/sign/${doc.signing_token}`}
                      className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
                    >
                      View & Sign
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'status' && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Workflow Status</h2>
            {history.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                <BarChart3 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p>No completed documents yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, idx) => (
                  <div
                    key={item.documentId + String(idx)}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle className="w-10 h-10 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{item.file_name}</p>
                        <p className="text-sm text-slate-500">
                          {item.status === 'signed' ? 'Signed' : item.status === 'reviewed' ? 'Reviewed' : item.documentStatus || 'Completed'}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                      Done
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Document preview modal (like approval flow) */}
      {showDocumentModal && selectedQueueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-indigo-600 shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Document Preview</h2>
                  <p className="text-sm text-slate-500 truncate max-w-md">{selectedQueueItem.file_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDocumentModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden bg-slate-100">
              <iframe
                src={`${BACKEND_URL}/api/esign/documents/${selectedQueueItem.documentId}/file?inline=1`}
                className="w-full h-full min-h-[60vh] border-0"
                title="Document preview"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0 space-y-3">
              {reviewError && (
                <p className="text-sm text-red-600">{reviewError}</p>
              )}
              {showDenyComment && (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-slate-700">Reason for denial (required)</label>
                  <textarea
                    value={denyComment}
                    onChange={(e) => setDenyComment(e.target.value)}
                    placeholder="Enter reason..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[80px]"
                    rows={3}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowDenyComment(false); setDenyComment(''); setReviewError(null); }}
                    className="self-start text-sm text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDocumentModal}
                  disabled={reviewSubmitting}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-50"
                >
                  Close
                </button>
                {isReviewer ? (
                  <>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={reviewSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {reviewSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={handleDeny}
                      disabled={reviewSubmitting}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
                    >
                      {reviewSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      {showDenyComment ? 'Confirm denial' : 'Deny'}
                    </button>
                    <a
                      href={`${window.location.origin}/sign/${selectedQueueItem.signing_token}`}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                    >
                      Review Document
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </>
                ) : (
                  <a
                    href={`${window.location.origin}/sign/${selectedQueueItem.signing_token}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                  >
                    Sign Document
                    <ArrowRight className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EsignInboxByToken;
