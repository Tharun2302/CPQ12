import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, CheckCircle, Rocket, Users, FileCheck, BarChart3, Eye, X } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import ApprovalDashboard from './ApprovalDashboard';
import { BACKEND_URL } from '../config/api';

interface ApprovalWorkflowProps {
  quotes?: any[];
  onStartWorkflow?: (workflowData: any) => void;
  onNavigateToDashboard?: () => void;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({ 
  quotes = []
}) => {
  const { createWorkflow } = useApprovalWorkflows();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [formData, setFormData] = useState({
    documentType: 'PDF Agreement',
    documentId: '',
    role1Email: 'saitharunreddy2302@gmail.com',
    role2Email: 'saitharunreddy2302@gmail.com'
  });

  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Optional: show quotes list (not used for eSign document download)
  useEffect(() => {
    if (quotes && quotes.length > 0) {
      setAvailableDocuments(quotes.map(quote => ({
        id: quote.id,
        name: `Quote #${quote.id}`,
        type: 'PDF Quote',
        clientName: quote.clientName || 'Unknown Client',
        amount: quote.totalCost || 0,
        status: quote.status || 'Draft',
        createdAt: quote.createdAt || new Date().toISOString()
      })));
    }
  }, [quotes]);

  // Auto-load documents on mount, but silently skip if backend is unavailable
  useEffect(() => {
    loadAvailableDocuments();
  }, []);

  const loadAvailableDocuments = async () => {
    setIsLoadingDocuments(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/documents`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.documents) {
          setAvailableDocuments(data.documents);
          console.log('📄 Loaded documents:', data.documents.length);
        }
      } else {
        console.log('⚠️ Backend not available, using quotes only');
      }
    } catch (error) {
      console.log('⚠️ Backend not available, using quotes only');
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const handleDocumentSelect = (document: any) => {
    setFormData(prev => ({
      ...prev,
      documentId: document.id,
      documentType: document.type || 'PDF Quote'
    }));
    setSelectedDocument(document);
  };

  const handlePreviewDocument = async (document: any) => {
    setIsLoadingPreview(true);
    setPdfPreviewData(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/documents/${document.id}/preview`);
      if (response.ok) {
      const result = await response.json();
      if (result.success && result.dataUrl) {
        setPdfPreviewData(result.dataUrl);
          setShowPreview(true);
        }
      }
    } catch (error) {
      console.error('Error loading document preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setPdfPreviewData(null);
  };

  const handleStartWorkflow = async () => {
    if (!formData.documentId) {
      alert('Please select a document first');
      return;
    }

    try {
      await createWorkflow({
      documentId: formData.documentId,
      documentType: formData.documentType,
        clientName: 'John Smith', // Default client name
        amount: 0, // Default amount
        totalSteps: 2,
      workflowSteps: [
          {
            step: 1,
            role: 'Technical Team',
            email: formData.role1Email,
            status: 'pending'
          },
          {
            step: 2,
            role: 'Legal Team',
            email: formData.role2Email,
            status: 'pending'
          }
        ]
      });
    } catch (error) {
      console.error('Error starting workflow:', error);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Admin Dashboard', icon: BarChart3 },
    { id: 'start', label: 'Start Approval Workflow', icon: FileCheck }
  ];

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6 w-full flex flex-col">
      <div className="w-full flex-1 space-y-6">
        {/* Integrated Tab Navigation */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-2">
          <div className="flex space-x-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300 border-0 flex-1 ${
                  activeTab === tab.id
                    ? 'bg-sky-200 text-sky-800 shadow-lg transform scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:shadow-md'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'start' && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 flex-1 overflow-auto">
            <div className="p-8 space-y-8">
              {/* Document Information Section */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Document Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Document Type */}
            <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      Document Type
              </label>
                <select
                  value={formData.documentType}
                      onChange={(e) => setFormData(prev => ({ ...prev, documentType: e.target.value }))}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium bg-white shadow-sm"
                >
                      <option value="PDF Agreement">PDF Agreement</option>
                </select>
            </div>

            {/* Document ID */}
            <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      Document ID
              </label>
              <input
                type="text"
                value={formData.documentId}
                      onChange={(e) => setFormData(prev => ({ ...prev, documentId: e.target.value }))}
                placeholder="Enter document ID..."
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium bg-white shadow-sm"
                    />
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-500">
                Document ID will be auto-filled when you select a document below.
              </p>

              {/* Approval Roles Section */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-600" />
                  Approval Roles
                </h3>
                <p className="text-xs text-gray-600 mb-4">Configure email addresses for each approval role</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Technical Team Email */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Technical Team Email
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="email"
                        value={formData.role1Email}
                        onChange={(e) => setFormData(prev => ({ ...prev, role1Email: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm bg-white"
                        placeholder="technical@company.com"
                      />
                    </div>
            </div>

                  {/* Legal Team Email */}
            <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Legal Team Email
              </label>
              <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="email"
                        value={formData.role2Email}
                        onChange={(e) => setFormData(prev => ({ ...prev, role2Email: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm bg-white"
                        placeholder="legal@company.com"
                />
                  </div>
            </div>
                  
                </div>
            </div>
              
              <p className="text-sm text-gray-500">
                Emails for the approval workflow roles. Each role will receive the document and can approve or deny it.
              </p>

            {/* Start Workflow Button */}
              <div className="pt-4">
              <button
                onClick={handleStartWorkflow}
                  className="w-full max-w-sm mx-auto flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg font-semibold text-sm hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                  <Rocket className="w-4 h-4" />
                Start Approval Workflow
              </button>
          </div>
        </div>

        {/* Load Available Documents Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Load Available Documents</h2>
          </div>
          <p className="text-gray-600 mb-4">Select a document to automatically populate the form fields above.</p>
          
          <div className="flex gap-4">
            <button
                  onClick={loadAvailableDocuments}
              disabled={isLoadingDocuments}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDocuments ? 'animate-spin' : ''}`} />
                  {isLoadingDocuments ? 'Loading...' : 'Load Documents'}
            </button>
            <button
                  onClick={() => setAvailableDocuments([])}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
                  <X className="w-4 h-4" />
                  Clear List
            </button>
          </div>

          {availableDocuments.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900">Available Documents:</h3>
                  <div className="grid gap-3">
              {availableDocuments.map((doc) => (
                <div
                  key={doc.id}
                        className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{doc.name}</p>
                            <p className="text-sm text-gray-500">
                              {doc.type} • {doc.clientName} • ${doc.amount?.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                        <button
                          onClick={() => handlePreviewDocument(doc)}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                          Preview
                        </button>
                          <button
                            onClick={() => handleDocumentSelect(doc)}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Select
                          </button>
                  </div>
                </div>
              ))}
                  </div>
            </div>
          )}
      </div>

      {/* PDF Preview Modal */}
      {showPreview && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-7xl w-full max-h-[95vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                        <h2 className="text-xl font-semibold text-gray-900">Document Preview</h2>
                        <p className="text-sm text-gray-500">{selectedDocument.name}</p>
                </div>
              </div>
              <button
                onClick={handleClosePreview}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                      <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(95vh-120px)]">
                  <div className="bg-gray-100 rounded-lg p-4">
                    {isLoadingPreview ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                          <p className="text-gray-600 text-sm">Loading document preview...</p>
                      </div>
                    ) : pdfPreviewData ? (
                      <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                          <iframe
                            src={pdfPreviewData}
                              className="w-full h-[85vh] border-0"
                              title="Document Preview"
                          />
                        </div>
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              const link = document.createElement('a');
                                link.href = pdfPreviewData;
                                link.download = `${selectedDocument.name || 'document'}.pdf`;
                              link.click();
                            }}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                              <FileText className="w-4 h-4" />
                            Download PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                          <p className="text-gray-600">No preview available for this document.</p>
                      </div>
                    )}
                  </div>
                </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between p-6 border-t border-gray-200">
                    <div className="text-sm text-gray-500">
                      Document ID: {selectedDocument.id}
              </div>
                    <div className="flex gap-3">
                <button
                  onClick={handleClosePreview}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    handleDocumentSelect(selectedDocument);
                    handleClosePreview();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Select This Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
          </div>
        )}

        {/* Admin Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="flex-1 overflow-hidden">
            <ApprovalDashboard />
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalWorkflow;
