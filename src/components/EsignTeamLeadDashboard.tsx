import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { FileText, Loader2, PenLine, User, RefreshCw, BarChart3, Eye, X } from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { useAuth } from '../hooks/useAuth';
import Navigation from './Navigation';

interface PendingItem {
  documentId: string;
  file_name: string;
  signing_token: string;
  role: string;
}

const EsignTeamLeadDashboard: React.FC = () => {
  const { user, loading } = useAuth();
  const userEmail = (user?.email || '').trim().toLowerCase();

  if (!loading && !user) return <Navigate to="/esign-inbox" replace />;

  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!userEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/pending-for-email?email=${encodeURIComponent(userEmail)}`);
      const text = await res.text();
      let data: { success?: boolean; error?: string; items?: PendingItem[] };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? 'Invalid response' : 'Backend unavailable.');
        setItems([]);
        return;
      }
      if (data.success && Array.isArray(data.items)) setItems(data.items);
      else setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) {
      setLoading(false);
      setError('Sign in to see your queue.');
      return;
    }
    fetchQueue();
  }, [userEmail, fetchQueue]);

  const handleViewDocument = useCallback(async (item: PendingItem) => {
    setSelectedItem(item);
    setShowDocumentModal(true);
    setDocumentPreviewUrl(null);
    setIsLoadingPreview(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/esign/documents/${item.documentId}/file`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setDocumentPreviewUrl(url);
      }
    } catch {
      setDocumentPreviewUrl(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const closeDocumentModal = useCallback(() => {
    if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
    setShowDocumentModal(false);
    setSelectedItem(null);
    setDocumentPreviewUrl(null);
  }, [documentPreviewUrl]);

  const openSignDocument = (signingToken: string) => {
    if (documentPreviewUrl) URL.revokeObjectURL(documentPreviewUrl);
    setShowDocumentModal(false);
    setSelectedItem(null);
    setDocumentPreviewUrl(null);
    window.location.href = `${window.location.origin}/sign/${signingToken}`;
  };

  const queueCount = items.length;
  const tabs = [
    { id: 'queue', label: 'My Queue', icon: User, count: queueCount },
    { id: 'status', label: 'Workflow Status', icon: BarChart3, count: queueCount },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentTab="esign-team-lead" />

      <div className="lg:pl-64">
        <div className="bg-white shadow-lg border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                  <User className="w-6 h-6 text-teal-600" />
                </div>
                <h1 className="text-4xl font-bold text-gray-900">Team Lead Dashboard</h1>
              </div>
              <p className="text-xl text-gray-600">Sign or review documents (Team → Tech → Legal → Deal Desk)</p>
              {userEmail && <p className="text-sm text-gray-500 mt-1">Logged in as: {userEmail}</p>}
            </div>
          </div>
        </div>

        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex space-x-1 overflow-x-auto py-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium text-sm whitespace-nowrap transition-all duration-200 ${
                      isActive ? 'bg-teal-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                    {React.createElement(tabs.find(t => t.id === activeTab)?.icon || User, { className: 'w-4 h-4 text-teal-600' })}
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">{tabs.find(t => t.id === activeTab)?.label}</h2>
                </div>
                {userEmail && (
                  <button
                    type="button"
                    onClick={() => fetchQueue()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
              </div>
              {userEmail && (
                <p className="text-xs text-gray-500 mt-2">Documents appear here when it is your turn to sign or review. Click &quot;View Document&quot; to preview, then sign or mark as reviewed.</p>
              )}
            </div>

            <div className="p-6">
              {!userEmail && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-amber-800 text-center">
                  Sign in to see documents pending your signature.
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                </div>
              )}

              {error && !loading && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 text-center">
                  {error}
                </div>
              )}

              {!loading && !error && userEmail && items.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 italic text-lg">No documents in your queue.</p>
                  <p className="text-gray-400 text-sm mt-1">When someone sends a document for signature (fixed roles), it will appear here.</p>
                </div>
              )}

              {!loading && !error && userEmail && items.length > 0 && (
                <div className="space-y-4">
                  {items.map((item) => (
                    <div key={item.signing_token} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-100">
                            <PenLine className="w-5 h-5 text-teal-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900 truncate max-w-md">{item.file_name}</h3>
                            <p className="text-sm text-gray-500">{item.role === 'reviewer' ? 'Reviewer' : 'Signer'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                          <span>Status</span>
                          <span className="text-teal-600 font-semibold">Pending your signature</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className="bg-teal-500 h-2 rounded-full" style={{ width: '25%' }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-sm p-2 rounded bg-teal-50 border border-teal-200">
                        <span className="font-medium">Team Lead</span>
                        <span className="text-gray-500">{userEmail}</span>
                        <span className="text-teal-600 font-semibold text-xs">(Your Turn)</span>
                      </div>
                      <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleViewDocument(item)}
                          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          View Document
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDocumentModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
                  <p className="text-sm text-gray-500">{selectedItem.file_name}</p>
                </div>
              </div>
              <button onClick={closeDocumentModal} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
              {isLoadingPreview ? (
                <div className="text-center py-16">
                  <Loader2 className="h-10 w-10 animate-spin text-teal-600 mx-auto mb-4" />
                  <p className="text-gray-600 text-sm">Loading document preview...</p>
                </div>
              ) : documentPreviewUrl ? (
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                  <iframe src={documentPreviewUrl} className="w-full h-[70vh] border-0" title="Document Preview" />
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500">Could not load preview. Use the button below to open the signing page.</div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-end gap-3 shrink-0">
              <button onClick={closeDocumentModal} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100">
                Close
              </button>
              <button
                onClick={() => openSignDocument(selectedItem.signing_token)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <PenLine className="w-4 h-4" />
                {selectedItem.role === 'reviewer' ? 'Review document' : 'Sign document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EsignTeamLeadDashboard;
