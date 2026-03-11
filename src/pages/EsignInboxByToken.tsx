import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Loader2, PenLine, ShieldX, ArrowRight, User, BarChart3, CheckCircle } from 'lucide-react';
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
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'denied' | 'ok'>('loading');
  const [data, setData] = useState<InboxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'status'>('queue');

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
          setData(json);
          setStatus('ok');
        } else {
          setStatus('denied');
        }
      })
      .catch(() => setStatus('denied'));

    return () => controller.abort();
  }, [token]);

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
              : 'No login required. Use the link from your e-sign email (Option 1 – “E-Sign Team Lead Dashboard”) to open your queue and documents.'}
          </p>
        </div>
      </div>
    );
  }

  const workflow = data?.workflow || 'Team Lead → Technical → Legal → Deal Desk';
  const queue = data?.queue ?? [];
  const history = data?.history ?? [];

  const roleKey = (data?.role || '').toString().toLowerCase();
  const dashboardTitle =
    roleKey === 'technical' ? 'E-Sign Technical Dashboard'
    : roleKey === 'legal' ? 'E-Sign Legal Dashboard'
    : 'E-Sign Team Lead Dashboard';

  const tabs = [
    { id: 'queue' as const, label: 'My E-Sign Queue', icon: User, count: queue.length },
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
              <p className="text-slate-600 text-sm mt-0.5">Review and sign documents. No login required—your email link is your access.</p>
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
        <div className="mb-6 rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
          <p className="text-sm font-medium text-indigo-900">Workflow</p>
          <p className="text-indigo-700 text-sm mt-0.5">{workflow}</p>
        </div>

        {activeTab === 'queue' && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">My E-Sign Queue</h2>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-10 h-10 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{doc.file_name}</p>
                        <p className="text-sm text-slate-500">Ready for your signature</p>
                      </div>
                    </div>
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
    </div>
  );
};

export default EsignInboxByToken;
