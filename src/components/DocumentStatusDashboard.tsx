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
  const [documentId, setDocumentId] = useState('');
  const [statusData, setStatusData] = useState<DocumentStatusData | null>(null);
  const [recentEvents, setRecentEvents] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

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

  // Initial load of recent events
  useEffect(() => {
    fetchRecentEvents();
    const interval = setInterval(fetchRecentEvents, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                Document Status Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Real-time BoldSign document tracking</p>
            </div>
            <button
              onClick={fetchRecentEvents}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex gap-3">
            <input
              type="text"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && fetchDocumentStatus(documentId)}
              placeholder="Enter BoldSign Document ID"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => fetchDocumentStatus(documentId)}
              disabled={loading || !documentId.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading ? 'Loading...' : 'Check Status'}
            </button>
            <label className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Auto-refresh</span>
            </label>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}
        </div>

        {/* Document Status Details */}
        {statusData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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

        {/* Recent Webhook Events */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Webhook Events</h2>
          
          {recentEvents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No webhook events received yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Events will appear here when BoldSign sends webhook notifications
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Event Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Document ID</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Signer</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Timestamp</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">{getEventBadge(event.eventType)}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => {
                            setDocumentId(event.documentId);
                            fetchDocumentStatus(event.documentId);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-mono text-sm hover:underline"
                        >
                          {event.documentId.substring(0, 16)}...
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {event.signerName || 'N/A'}
                          </p>
                          <p className="text-xs text-gray-600">{event.signerEmail || '-'}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {new Date(event.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {event.processed ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle className="w-4 h-4" />
                            Processed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
                            <Clock className="w-4 h-4" />
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentStatusDashboard;

