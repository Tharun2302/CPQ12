import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, RefreshCw, BarChart3, Check, Clock, XCircle, Eye, PenLine, Download } from 'lucide-react';
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
  created_at: string;
  sent_at?: string;
  status: string;
  recipients: RecipientStatus[];
}

const EsignAgreementStatusDashboard: React.FC = () => {
  const { user } = useAuth();
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusModalId, setStatusModalId] = useState<string | null>(null);
  const [statusModalDoc, setStatusModalDoc] = useState<StatusModalDoc | null>(null);
  const [statusModalRecipients, setStatusModalRecipients] = useState<RecipientStatus[]>([]);
  const [statusModalLoading, setStatusModalLoading] = useState(false);
  const [statusModalDownloading, setStatusModalDownloading] = useState(false);

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
      case 'draft': return 'Draft';
      default: return status || 'Draft';
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'sent': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'denied': return 'bg-red-100 text-red-800 border-red-200';
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

  const handleStatusModalPreview = () => {
    if (!statusModalId) return;
    window.open(`${BACKEND_URL}/api/esign/documents/${statusModalId}/file?inline=1`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation currentTab="esign-tracking" />

      <div className="lg:pl-64">
        <div className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Agreement Status</h1>
                  <p className="text-slate-600 text-sm mt-0.5">Track current status of all agreements</p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchStatus}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Document</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {agreements.map((ag) => (
                      <tr key={ag.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                              <FileText className="h-4 w-4 text-indigo-600" />
                            </div>
                            <div>
                              <span className="font-medium text-slate-900 truncate max-w-xs block" title={ag.file_name}>{ag.file_name}</span>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {[ag.uploaded_by, formatDate(ag.created_at)].filter(Boolean).join(' • ') || '—'}
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
                            {ag.status !== 'draft' && (
                              <button
                                type="button"
                                onClick={() => openStatusModal(ag.id)}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
                              >
                                <Eye className="h-4 w-4" />
                                View status
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <h2 className="text-xl font-bold text-white">Agreement Status</h2>
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
