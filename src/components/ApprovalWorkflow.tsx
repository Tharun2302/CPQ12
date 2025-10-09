import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Plus, CheckCircle, Rocket, Users, Mail, FileCheck, BarChart3, Eye, X } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
// EmailService import removed - now using backend API for email sending

interface ApprovalWorkflowProps {
  quotes?: any[];
  onStartWorkflow?: (workflowData: any) => void;
  onNavigateToDashboard?: () => void;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({ 
  quotes = [], 
  onStartWorkflow,
  onNavigateToDashboard
}) => {
  const { createWorkflow } = useApprovalWorkflows();
  // EmailService instance removed - now using backend API
  const [formData, setFormData] = useState({
    documentType: 'PDF Quote',
    documentId: '',
    managerEmail: 'manager@company.com',
    ceoEmail: 'ceo@company.com',
    clientEmail: 'client@gmail.com'
  });

  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Load available documents from quotes
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

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLoadDocuments = async () => {
    setIsLoadingDocuments(true);
    try {
      console.log('📄 Loading PDF documents from database...');
      
      const response = await fetch('http://localhost:3001/api/documents');
      const result = await response.json();
      
      if (result.success && result.documents) {
        console.log(`✅ Loaded ${result.documents.length} documents from database`);
        
        // Convert database documents to frontend format
        const convertedDocuments = result.documents.map((doc: any) => ({
          id: doc.id,
          name: doc.fileName || `Document ${doc.id}`,
          type: 'PDF Quote',
          clientName: doc.clientName || 'Unknown Client',
          amount: doc.metadata?.totalCost || 0,
          status: doc.status || 'Active',
          createdAt: doc.createdAt || doc.generatedDate,
          fileName: doc.fileName,
          company: doc.company,
          quoteId: doc.quoteId
        }));
        
        setAvailableDocuments(convertedDocuments);
        console.log('📋 Documents converted and set:', convertedDocuments);
      } else {
        console.error('❌ Failed to load documents:', result.error);
        alert('Failed to load documents: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error loading documents:', error);
      alert('Error loading documents. Please try again.');
    } finally {
      setIsLoadingDocuments(false);
    }
  };

  const handleCreateTestDocument = async () => {
    try {
      console.log('📄 Creating test documents in database...');
      
      const response = await fetch('http://localhost:3001/api/documents/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ Created ${result.documents.length} test documents`);
        
        // Convert database documents to frontend format
        const convertedDocuments = result.documents.map((doc: any) => ({
          id: doc.id,
          name: doc.fileName || `Document ${doc.id}`,
          type: 'PDF Quote',
          clientName: doc.clientName || 'Unknown Client',
          amount: doc.totalCost || 0,
          status: 'Active',
          createdAt: new Date().toISOString(),
          fileName: doc.fileName,
          company: doc.company,
          quoteId: doc.quoteId
        }));
        
        setAvailableDocuments(prev => [...convertedDocuments, ...prev]);
        
        // Auto-populate form with first test document
        if (convertedDocuments.length > 0) {
          setFormData(prev => ({
            ...prev,
            documentId: convertedDocuments[0].id
          }));
        }
        
        alert(`✅ Created ${result.documents.length} test documents successfully!`);
      } else {
        console.error('❌ Failed to create test documents:', result.error);
        alert('Failed to create test documents: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error creating test documents:', error);
      alert('Error creating test documents. Please try again.');
    }
  };

  const handleDocumentSelect = (document: any) => {
    setFormData(prev => ({
      ...prev,
      documentId: document.id,
      documentType: document.type
    }));
  };

  const handlePreviewDocument = async (document: any) => {
    setSelectedDocument(document);
    setShowPreview(true);
    setIsLoadingPreview(true);
    setPdfPreviewData(null);

    try {
      console.log('📄 Loading PDF preview for:', document.id);
      
      const response = await fetch(`http://localhost:3001/api/documents/${document.id}/preview`);
      const result = await response.json();
      
      if (result.success && result.dataUrl) {
        setPdfPreviewData(result.dataUrl);
        console.log('✅ PDF preview loaded successfully');
      } else {
        console.error('❌ Failed to load PDF preview:', result.error);
      }
    } catch (error) {
      console.error('❌ Error loading PDF preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setSelectedDocument(null);
    setPdfPreviewData(null);
    setIsLoadingPreview(false);
  };

  const handleStartWorkflow = async () => {
    if (!formData.documentId) {
      alert('Please select a document first');
      return;
    }

    if (!formData.managerEmail || !formData.ceoEmail || !formData.clientEmail) {
      alert('Please fill in all email addresses');
      return;
    }

    // Find the selected document to get client name and amount
    const selectedDocument = availableDocuments.find(doc => doc.id === formData.documentId);
    
    const workflowData = {
      documentId: formData.documentId,
      documentType: formData.documentType,
      clientName: selectedDocument?.clientName || 'Unknown Client',
      amount: selectedDocument?.amount || 0,
      totalSteps: 3,
      workflowSteps: [
        { step: 1, role: 'Manager', email: formData.managerEmail, status: 'pending' as const },
        { step: 2, role: 'CEO', email: formData.ceoEmail, status: 'pending' as const },
        { step: 3, role: 'Client', email: formData.clientEmail, status: 'pending' as const }
      ]
    };

    // Create the workflow using the hook
    console.log('🔄 About to create workflow with data:', workflowData);
    const newWorkflow = createWorkflow(workflowData);
    console.log('✅ Workflow created successfully:', newWorkflow);

    if (onStartWorkflow) {
      console.log('🔄 Calling onStartWorkflow callback');
      onStartWorkflow(newWorkflow);
    }

    // Send email only to Manager first (sequential approval)
    try {
      console.log('📧 Sending email to Manager only (sequential approval)...');
      
      const response = await fetch('http://localhost:3001/api/send-manager-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          managerEmail: formData.managerEmail,
          workflowData: {
            documentId: formData.documentId,
            documentType: formData.documentType,
            clientName: selectedDocument?.clientName || 'Unknown Client',
            amount: selectedDocument?.amount || 0,
            workflowId: newWorkflow.id
          }
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('✅ Approval workflow started successfully!\n📧 Email sent to Manager for first approval.\n\nNext steps:\n1. Manager approves → CEO gets email\n2. CEO approves → Client gets email');
        console.log('📧 Manager email sent successfully:', result);
      } else {
        alert('⚠️ Workflow started but Manager email failed: ' + result.message);
        console.error('Manager email error:', result);
      }
    } catch (error) {
      console.error('Error sending Manager email:', error);
      alert('⚠️ Workflow started but Manager email failed. Please check the console for details.');
    }
    
    // Reset form
    setFormData({
      documentType: 'PDF Quote',
      documentId: '',
      managerEmail: 'manager@company.com',
      ceoEmail: 'ceo@company.com',
      clientEmail: 'client@gmail.com'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Start Approval Workflow</h1>
                <p className="text-gray-600 mt-1">Send documents through the approval process (Manager → CEO → Client)</p>
              </div>
            </div>
            {onNavigateToDashboard && (
              <button
                onClick={onNavigateToDashboard}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                View Approval Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Load Available Documents Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Load Available Documents</h2>
          </div>
          <p className="text-gray-600 mb-4">Select a document to automatically populate the form fields below.</p>
          
          <div className="flex gap-4">
            <button
              onClick={handleLoadDocuments}
              disabled={isLoadingDocuments}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDocuments ? 'animate-spin' : ''}`} />
              Load Available Documents
            </button>
            <button
              onClick={handleCreateTestDocument}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Test Documents
            </button>
          </div>

          {/* Available Documents List */}
          {availableDocuments.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Available Documents:</h3>
                <div className="text-sm text-gray-600 bg-green-100 px-2 py-1 rounded">
                  {availableDocuments.length} PDF(s) loaded from database
                </div>
              </div>
              {availableDocuments.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleDocumentSelect(doc)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    formData.documentId === doc.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <div className="font-medium text-gray-900">{doc.name}</div>
                        {formData.documentId === doc.id && (
                          <CheckCircle className="w-4 h-4 text-blue-600" />
                        )}
                        <button
                          onClick={() => handlePreviewDocument(doc)}
                          className="ml-auto flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Preview
                        </button>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div><strong>Client:</strong> {doc.clientName}</div>
                        <div><strong>Company:</strong> {doc.company || 'N/A'}</div>
                        <div><strong>Amount:</strong> ${doc.amount?.toLocaleString() || '0'}</div>
                        <div><strong>Status:</strong> {doc.status}</div>
                        {doc.quoteId && <div><strong>Quote ID:</strong> {doc.quoteId}</div>}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{new Date(doc.createdAt).toLocaleDateString()}</div>
                      <div className="mt-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                        PDF Ready
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approval Workflow Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="space-y-6">
            {/* Document Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Document Type:
              </label>
              <div className="relative">
                <select
                  value={formData.documentType}
                  onChange={(e) => handleInputChange('documentType', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="PDF Quote">PDF Quote</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Document ID */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Document ID:
              </label>
              <input
                type="text"
                value={formData.documentId}
                onChange={(e) => handleInputChange('documentId', e.target.value)}
                placeholder="Enter document ID..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Document ID will be auto-filled when you select a document above.
              </p>
            </div>

            {/* Manager Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Manager Email:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={formData.managerEmail}
                  onChange={(e) => handleInputChange('managerEmail', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* CEO Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                CEO Email:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={formData.ceoEmail}
                  onChange={(e) => handleInputChange('ceoEmail', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Client Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Client Email:
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="w-5 h-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={formData.clientEmail}
                  onChange={(e) => handleInputChange('clientEmail', e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Email where the final approved document will be sent.
              </p>
            </div>

            {/* Start Workflow Button */}
            <div className="pt-6">
              <button
                onClick={handleStartWorkflow}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-teal-600 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                <Rocket className="w-5 h-5" />
                Start Approval Workflow
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {showPreview && selectedDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">PDF Document Overview</h2>
                  <p className="text-sm text-gray-600">{selectedDocument.name}</p>
                </div>
              </div>
              <button
                onClick={handleClosePreview}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Document Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Document Information</h3>
                  
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Document Name:</span>
                      <span className="text-gray-900">{selectedDocument.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Client:</span>
                      <span className="text-gray-900">{selectedDocument.clientName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Company:</span>
                      <span className="text-gray-900">{selectedDocument.company || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Amount:</span>
                      <span className="text-gray-900 font-semibold">${selectedDocument.amount?.toLocaleString() || '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedDocument.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedDocument.status}
                      </span>
                    </div>
                    {selectedDocument.quoteId && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-700">Quote ID:</span>
                        <span className="text-gray-900 font-mono text-sm">{selectedDocument.quoteId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Created:</span>
                      <span className="text-gray-900">{new Date(selectedDocument.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* PDF Preview */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">PDF Preview</h3>
                  
                  <div className="bg-gray-100 rounded-lg p-4">
                    {isLoadingPreview ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600 text-sm">Loading PDF preview...</p>
                      </div>
                    ) : pdfPreviewData ? (
                      <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                          <iframe
                            src={pdfPreviewData}
                            className="w-full h-96 border-0"
                            title="PDF Preview"
                          />
                        </div>
                        <div className="flex justify-center">
                          <button
                            onClick={() => {
                              // Download the PDF file
                              const link = document.createElement('a');
                              link.href = `http://localhost:3001/api/documents/${selectedDocument.id}/file`;
                              link.download = selectedDocument.name;
                              link.click();
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                          >
                            Download PDF
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-32 h-40 bg-white rounded-lg shadow-sm mx-auto mb-4 flex items-center justify-center">
                          <FileText className="w-16 h-16 text-gray-400" />
                        </div>
                        <p className="text-gray-600 text-sm mb-4">
                          PDF preview not available
                        </p>
                        <button
                          onClick={() => {
                            // Download the PDF file
                            const link = document.createElement('a');
                            link.href = `http://localhost:3001/api/documents/${selectedDocument.id}/file`;
                            link.download = selectedDocument.name;
                            link.click();
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Download PDF
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
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
  );
};

export default ApprovalWorkflow;
