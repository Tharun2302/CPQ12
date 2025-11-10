import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface DocumentStatus {
  id: string;
  fileName: string;
  status: 'sent' | 'viewed' | 'signed' | 'fully_signed' | 'declined' | 'expired';
  createdAt: string;
  lastEvent: string;
  lastEventAt?: string;
}

interface SignerStatus {
  email: string;
  name: string;
  status: 'pending' | 'viewed' | 'signed';
  signedAt?: string;
  viewedAt?: string;
}

interface DocumentStatusData {
  document: DocumentStatus;
  signing: {
    totalSigners: number;
    completedSignatures: number;
    completionPercentage: number;
    status: string;
  };
  signers: SignerStatus[];
  declines: Array<{
    declinedBy: string;
    declinedAt: string;
    reason: string;
  }>;
  timeline: {
    created: string;
    lastUpdated: string;
    completed?: string;
    expired?: string;
  };
}

interface BoldSignDocument {
  documentId: string;
  documentName: string;
  status: string;
  createdDate: string;
  modifiedDate?: string;
  expiryDate?: string;
  completionPercentage: number;
  totalSigners: number;
  completedSigners: number;
  signers: Array<{
    name: string;
    email: string;
    signedOn?: string;
    status: string;
  }>;
  lastEvent?: string;
  lastEventAt?: string;
}

interface WebhookLog {
  id: string;
  eventType: string;
  documentId: string;
  status: string;
  signerEmail?: string;
  signerName?: string;
  timestamp: string;
  processed: boolean;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const DocumentStatusDashboard: React.FC = () => {
  const [allDocuments, setAllDocuments] = useState<BoldSignDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<BoldSignDocument[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [documentId, setDocumentId] = useState('');
  const [statusData, setStatusData] = useState<DocumentStatusData | null>(null);
  const [recentEvents, setRecentEvents] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true); // Auto-refresh enabled by default

  // Fetch all BoldSign documents
  const fetchAllDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/boldsign/all-documents`);
      const result = await response.json();
      
      if (result.success) {
        setAllDocuments(result.data.documents);
        filterDocuments(result.data.documents, activeFilter);
        setError('');
      } else {
        setError(result.data?.message || 'Failed to fetch documents');
      }
    } catch (err) {
      console.error('Error fetching documents:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Filter documents by status
  const filterDocuments = (docs: BoldSignDocument[], filter: string) => {
    let filtered = docs;
    
    switch (filter) {
      case 'Waiting for me':
        filtered = docs.filter(d => d.status === 'InProgress' || d.status === 'WaitingForMe');
        break;
      case 'Waiting for others':
        filtered = docs.filter(d => d.status === 'WaitingForOthers');
        break;
      case 'Needs attention':
        filtered = docs.filter(d => d.status === 'NeedsAttention');
        break;
      case 'Completed':
        filtered = docs.filter(d => d.status === 'Completed');
        break;
      case 'Declined':
        filtered = docs.filter(d => d.status === 'Declined');
        break;
      case 'Expired':
        filtered = docs.filter(d => d.status === 'Expired');
        break;
      case 'Revoked':
        filtered = docs.filter(d => d.status === 'Revoked');
        break;
      default:
        filtered = docs;
    }
    
    setFilteredDocuments(filtered);
  };

  // Handle filter change
  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    filterDocuments(allDocuments, filter);
  };

  // Fetch document status
  const fetchDocumentStatus = async (docId: string) => {
    if (!docId.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/boldsign/document-status/${docId}`);
      const result = await response.json();
      
      if (result.success) {
        setStatusData(result.data);
      } else {
        setError(result.error || 'Failed to fetch document status');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching document status:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch recent webhook events
  const fetchRecentEvents = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/boldsign/webhook-logs?limit=20`);
      const result = await response.json();
      
      if (result.success) {
        setRecentEvents(result.data.logs);
      }
    } catch (err) {
      console.error('Error fetching recent events:', err);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && documentId) {
      const interval = setInterval(() => {
        fetchDocumentStatus(documentId);
      }, 10000); // Refresh every 10 seconds
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh, documentId]);

  // Initial load of all data
  useEffect(() => {
    fetchAllDocuments();
    fetchRecentEvents();
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchAllDocuments();
        fetchRecentEvents();
      }, 10000); // Refresh every 10 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Filter documents when allDocuments changes
  useEffect(() => {
    filterDocuments(allDocuments, activeFilter);
  }, [allDocuments, activeFilter]);

  // Get status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
      sent: { color: 'bg-blue-100 text-blue-800', icon: <FileText className="w-4 h-4" />, label: 'Sent' },
      viewed: { color: 'bg-purple-100 text-purple-800', icon: <Eye className="w-4 h-4" />, label: 'Viewed' },
      signed: { color: 'bg-yellow-100 text-yellow-800', icon: <CheckCircle className="w-4 h-4" />, label: 'Partially Signed' },
      fully_signed: { color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-4 h-4" />, label: 'Completed' },
      declined: { color: 'bg-red-100 text-red-800', icon: <XCircle className="w-4 h-4" />, label: 'Declined' },
      expired: { color: 'bg-gray-100 text-gray-800', icon: <Clock className="w-4 h-4" />, label: 'Expired' },
    };
    
    const badge = badges[status] || badges.sent;
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badge.color}`}>
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  // Get event type badge
  const getEventBadge = (eventType: string) => {
    const badges: Record<string, { color: string; label: string }> = {
      DocumentSigned: { color: 'bg-green-100 text-green-800', label: '✍️ Signed' },
      DocumentCompleted: { color: 'bg-emerald-100 text-emerald-800', label: '✅ Completed' },
      DocumentDeclined: { color: 'bg-red-100 text-red-800', label: '❌ Declined' },
      DocumentViewed: { color: 'bg-blue-100 text-blue-800', label: '👁️ Viewed' },
      DocumentExpired: { color: 'bg-gray-100 text-gray-800', label: '⏰ Expired' },
      DocumentRevoked: { color: 'bg-orange-100 text-orange-800', label: '🚫 Revoked' },
    };
    
    const badge = badges[eventType] || { color: 'bg-gray-100 text-gray-800', label: eventType };
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  // Get filter counts
  const getFilterCounts = () => {
    return {
      all: allDocuments.length,
      waitingForMe: allDocuments.filter(d => d.status === 'InProgress' || d.status === 'WaitingForMe').length,
      waitingForOthers: allDocuments.filter(d => d.status === 'WaitingForOthers').length,
      needsAttention: allDocuments.filter(d => d.status === 'NeedsAttention').length,
      completed: allDocuments.filter(d => d.status === 'Completed').length,
      declined: allDocuments.filter(d => d.status === 'Declined').length,
      expired: allDocuments.filter(d => d.status === 'Expired').length,
      revoked: allDocuments.filter(d => d.status === 'Revoked').length,
      scheduled: allDocuments.filter(d => d.status === 'Scheduled').length
    };
  };

  const counts = getFilterCounts();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-7 h-7 text-blue-600" />
              Document Status Dashboard
            </h1>
            <p className="text-gray-600 mt-1 text-sm">Real-time BoldSign document tracking</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              Auto-refresh (10s)
            </label>
            <button
              onClick={() => {
                fetchAllDocuments();
                fetchRecentEvents();
              }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 font-medium">Configuration Note</p>
              <p className="text-yellow-700 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Main Container */}
        <div className="bg-white rounded-lg shadow">
          {/* Filter Tabs */}
          <div className="border-b border-gray-200 px-6 pt-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-3">
              <button
                onClick={() => handleFilterChange('All')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'All'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                All
              </button>
              <button
                onClick={() => handleFilterChange('Waiting for me')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Waiting for me'
                    ? 'bg-purple-100 text-purple-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Waiting for me
                {counts.waitingForMe > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-purple-200 text-purple-900 rounded-full text-xs">
                    {counts.waitingForMe}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleFilterChange('Waiting for others')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Waiting for others'
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Waiting for others
                {counts.waitingForOthers > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-blue-200 text-blue-900 rounded-full text-xs">
                    {counts.waitingForOthers}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleFilterChange('Needs attention')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Needs attention'
                    ? 'bg-yellow-100 text-yellow-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Needs attention
                {counts.needsAttention > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-yellow-200 text-yellow-900 rounded-full text-xs">
                    {counts.needsAttention}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleFilterChange('Completed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Completed'
                    ? 'bg-green-100 text-green-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Completed
                {counts.completed > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-green-200 text-green-900 rounded-full text-xs">
                    {counts.completed}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleFilterChange('Declined')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Declined'
                    ? 'bg-red-100 text-red-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Declined
              </button>
              <button
                onClick={() => handleFilterChange('Expired')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Expired'
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Expired
              </button>
              <button
                onClick={() => handleFilterChange('Revoked')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeFilter === 'Revoked'
                    ? 'bg-orange-100 text-orange-900'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Revoked
              </button>
            </div>
          </div>

          {/* Documents Table */}
          <div className="p-6">
            {loading && filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <RefreshCw className="w-12 h-12 text-gray-300 mx-auto mb-4 animate-spin" />
                <p className="text-gray-600">Loading documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">No documents found</p>
                <p className="text-sm text-gray-500 mt-2">
                  {activeFilter === 'All' 
                    ? 'Documents will appear here automatically after being sent for signatures'
                    : `No documents in "${activeFilter}" status`}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Title</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((doc) => (
                      <tr key={doc.documentId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{doc.documentName}</p>
                            <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                              <span className="text-xs">↗</span>
                              <span>To: {doc.signers.map(s => s.name || s.email).join(', ')}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {doc.status === 'Completed' ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100">
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">Completed</p>
                                  <p className="text-xs text-gray-600">
                                    Signed by all {doc.totalSigners} signer{doc.totalSigners > 1 ? 's' : ''}
                                  </p>
                                </div>
                              </div>
                            ) : doc.status === 'InProgress' ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100">
                                  <Clock className="w-4 h-4 text-blue-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">In Progress</p>
                                  <p className="text-xs text-gray-600">
                                    {doc.completedSigners}/{doc.totalSigners} signed
                                  </p>
                                </div>
                              </div>
                            ) : doc.status === 'Declined' ? (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100">
                                  <XCircle className="w-4 h-4 text-red-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">Declined</p>
                                  <p className="text-xs text-gray-600">Signing declined</p>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100">
                                  <FileText className="w-4 h-4 text-gray-600" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">{doc.status}</p>
                                  <p className="text-xs text-gray-600">
                                    {doc.completedSigners}/{doc.totalSigners} signed
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div>
                            <p className="text-sm text-gray-900">
                              {doc.lastEventAt 
                                ? new Date(doc.lastEventAt).toLocaleString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })
                                : new Date(doc.createdDate).toLocaleString('en-US', {
                                    month: '2-digit',
                                    day: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                  })
                              }
                            </p>
                            {doc.lastEvent && (
                              <p className="text-xs text-gray-600 mt-1">
                                {doc.lastEvent === 'DocumentSigned' && `${doc.signers.find(s => s.signedOn)?.name || 'Someone'} has signed the document`}
                                {doc.lastEvent === 'DocumentCompleted' && 'All signers have completed'}
                                {doc.lastEvent === 'DocumentViewed' && 'Document was viewed'}
                                {doc.lastEvent === 'DocumentDeclined' && 'Document was declined'}
                                {!['DocumentSigned', 'DocumentCompleted', 'DocumentViewed', 'DocumentDeclined'].includes(doc.lastEvent) && doc.lastEvent}
                              </p>
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

        {/* Webhook Events (Optional - for debugging) */}
        {recentEvents.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Webhook Events</h2>
            <div className="space-y-2">
              {recentEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      event.eventType === 'DocumentCompleted' ? 'bg-green-100 text-green-800' :
                      event.eventType === 'DocumentSigned' ? 'bg-blue-100 text-blue-800' :
                      event.eventType === 'DocumentViewed' ? 'bg-purple-100 text-purple-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {event.eventType}
                    </span>
                    <span className="text-sm text-gray-600">{event.documentId.substring(0, 12)}...</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document Status Details */}
        {statusData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            {/* Main Status Card */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Document Details</h2>
              
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-600">File Name</p>
                    <p className="text-lg font-semibold text-gray-900">{statusData.document.fileName}</p>
                  </div>
                  {getStatusBadge(statusData.document.status)}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Document ID</p>
                    <p className="text-sm font-mono text-gray-900">{statusData.document.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Last Event</p>
                    <p className="text-sm font-medium text-gray-900">{statusData.document.lastEvent || 'N/A'}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Signing Progress</span>
                    <span className="font-semibold text-gray-900">
                      {statusData.signing.completedSignatures} / {statusData.signing.totalSigners} Signed
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${statusData.signing.completionPercentage}%` }}
                    />
                  </div>
                  <p className="text-right text-sm text-gray-600 mt-1">
                    {statusData.signing.completionPercentage}% Complete
                  </p>
                </div>

                {/* Signers List */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Signers</h3>
                  <div className="space-y-2">
                    {statusData.signers.map((signer, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{signer.name || signer.email}</p>
                          <p className="text-sm text-gray-600">{signer.email}</p>
                        </div>
                        <div className="text-right">
                          {signer.status === 'signed' ? (
                            <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                              <CheckCircle className="w-4 h-4" />
                              Signed
                            </span>
                          ) : signer.viewedAt ? (
                            <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                              <Eye className="w-4 h-4" />
                              Viewed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <Clock className="w-4 h-4" />
                              Pending
                            </span>
                          )}
                          {signer.signedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(signer.signedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Declines */}
                {statusData.declines.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                      <XCircle className="w-5 h-5" />
                      Declined
                    </h3>
                    {statusData.declines.map((decline, index) => (
                      <div key={index} className="text-sm">
                        <p className="text-red-800">
                          <strong>{decline.declinedBy}</strong> declined on{' '}
                          {new Date(decline.declinedAt).toLocaleString()}
                        </p>
                        <p className="text-red-700 mt-1">Reason: {decline.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Card */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Timeline</h2>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Created</p>
                    <p className="text-sm text-gray-600">
                      {new Date(statusData.timeline.created).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Last Updated</p>
                    <p className="text-sm text-gray-600">
                      {new Date(statusData.timeline.lastUpdated).toLocaleString()}
                    </p>
                  </div>
                </div>

                {statusData.timeline.completed && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Completed</p>
                      <p className="text-sm text-gray-600">
                        {new Date(statusData.timeline.completed).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {statusData.timeline.expired && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Expired</p>
                      <p className="text-sm text-gray-600">
                        {new Date(statusData.timeline.expired).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <a
                href={`${BACKEND_URL}/api/boldsign/signing-history/${statusData.document.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Full History
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentStatusDashboard;

