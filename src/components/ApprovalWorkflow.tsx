import React, { useState, useEffect, useRef } from 'react';
import { FileText, Rocket, Users, FileCheck, BarChart3 } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import ApprovalDashboard from './ApprovalDashboard';
import { BACKEND_URL } from '../config/api';
import { useLocation } from 'react-router-dom';

interface ApprovalWorkflowProps {
  quotes?: any[];
  onStartWorkflow?: (workflowData: any) => void;
  onNavigateToDashboard?: () => void;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({ 
  quotes = []
}) => {
  const location = useLocation();
  const { createWorkflow } = useApprovalWorkflows();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [formData, setFormData] = useState({
    documentType: 'PDF Agreement',
    documentId: '',
    role1Email: 'anushreddydasari@gmail.com',
    role2Email: 'anushreddydasari@gmail.com'
  });

  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // If navigated from template upload / quote approval, jump directly to Start Approval Workflow tab
  useEffect(() => {
    const state = location.state as { openStartApprovalTab?: boolean; documentId?: string } | null;
    if (state?.openStartApprovalTab) {
      setActiveTab('start');
    }
    // If a documentId is passed via navigation state, pre-fill it
    if (state?.documentId) {
      setFormData(prev => ({
        ...prev,
        documentId: state.documentId
      }));
    }
  }, [location.state]);

  // Optional: show quotes list (not used for eSign document download)
  useEffect(() => {
    if (quotes && quotes.length > 0) {
      setAvailableDocuments(quotes.map(quote => ({
        id: quote.id,
        name: `Quote #${quote.id}`,
        type: 'PDF Quote',
        clientName: quote.clientName || 'Unknown Client',
        amount: quote.calculation?.totalCost ?? quote.totalCost ?? 0,
        status: quote.status || 'Draft',
        createdAt: quote.createdAt || new Date().toISOString()
      })));
    }
  }, [quotes]);


  // Handle manual document upload (PDF, Excel, CSV, etc.) and save to MongoDB
  const uploadManualDocument = async (): Promise<string | null> => {
    if (!uploadedFile) return null;

    try {
      setIsUploadingDocument(true);
      setUploadMessage(null);

      const backendUrl = BACKEND_URL || 'http://localhost:3001';

      // Convert file to base64 (same approach used in TemplateManager)
      const fileBase64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(uploadedFile);
      });

      const nowIso = new Date().toISOString();

      const documentPayload = {
        fileName: uploadedFile.name,
        fileData: fileBase64,
        fileSize: uploadedFile.size,
        clientName: 'Manual Approval',
        company: 'Manual Approval',
        quoteId: null,
        metadata: {
          totalCost: 0
        },
        status: 'active',
        createdAt: nowIso,
        generatedDate: nowIso
      };

      const response = await fetch(`${backendUrl}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(documentPayload)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        const errorMessage = result?.error || 'Failed to upload document for approval';
        console.error('Error uploading manual document:', errorMessage);
        setUploadMessage(`Error uploading document: ${errorMessage}`);
        return null;
      }

      const documentId = result.documentId as string | undefined;
      if (!documentId) {
        setUploadMessage('Document uploaded but no document ID was returned.');
        return null;
      }

      // Reflect the new document ID in the form so users can see it
      setFormData(prev => ({ ...prev, documentId }));
      setUploadMessage('✅ Document uploaded successfully and ready for approval.');

      return documentId;
    } catch (error) {
      console.error('Error uploading manual document:', error);
      setUploadMessage('Error uploading document. Please try again.');
      return null;
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleStartWorkflow = async () => {
    let effectiveDocumentId = formData.documentId;

    // If no document ID provided but a file is uploaded, upload it first
    if (!effectiveDocumentId && uploadedFile) {
      const uploadedId = await uploadManualDocument();
      if (!uploadedId) {
        alert('Failed to upload document. Please try again.');
        return;
      }
      effectiveDocumentId = uploadedId;
    }

    if (!effectiveDocumentId) {
      alert('Please enter a Document ID or upload a file before starting the workflow.');
      return;
    }

    try {
      // Try to enrich workflow with data from the selected document / quote
      const selectedDoc = availableDocuments.find(doc => doc.id === effectiveDocumentId);
      const matchingQuote = quotes?.find(q => q.id === effectiveDocumentId);

      const clientName =
        matchingQuote?.clientName ||
        selectedDoc?.clientName ||
        'Unknown Client';

      const amount =
        matchingQuote?.calculation?.totalCost ??
        matchingQuote?.totalCost ??
        selectedDoc?.amount ??
        0;

      const newWorkflow = await createWorkflow({
        documentId: effectiveDocumentId,
        documentType: formData.documentType,
        clientName,
        amount,
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

      if (newWorkflow) {
        // After creating the workflow, send the first email to the Technical Team only
        try {
          const backendUrl = BACKEND_URL || 'http://localhost:3001';
          const managerEmail = formData.role1Email;

          console.log('📧 Sending Technical Team email for manual workflow...', {
            managerEmail,
            workflowId: newWorkflow.id,
            documentId: effectiveDocumentId
          });

          const response = await fetch(`${backendUrl}/api/send-manager-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              managerEmail,
              workflowData: {
                documentId: effectiveDocumentId,
                documentType: formData.documentType,
                clientName,
                amount,
                workflowId: newWorkflow.id
              }
            })
          });

          let result: any = null;
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            result = await response.json();
          } else {
            const text = await response.text();
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
            } else {
              result = { success: true };
            }
          }

          if (result?.success) {
            alert('✅ Approval workflow started.\n📧 Technical Team has been notified for first approval.');
          } else {
            alert('✅ Workflow created but Technical Team email failed.\nPlease notify Technical Team manually.');
          }
        } catch (emailError) {
          console.error('❌ Error sending Technical Team email for manual workflow:', emailError);
          alert('✅ Workflow created but Technical Team email failed.\nPlease notify Technical Team manually.');
        }
      } else {
        alert('Approval workflow could not be created. Please try again.');
      }
    } catch (error) {
      console.error('Error starting workflow:', error);
      alert('Failed to start approval workflow. Please try again.');
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Admin Dashboard', icon: BarChart3 },
    { id: 'start', label: 'Start Manual Approval Workflow', icon: FileCheck }
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

                  {/* OR upload a document directly for this workflow */}
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      Or Upload Document (PDF, Excel, CSV)
                    </label>
                    <div className="flex flex-col gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.csv,.xlsx,.xls"
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          setUploadedFile(file || null);
                          setUploadMessage(null);
                        }}
                        className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-xl bg-white shadow-sm cursor-pointer"
                      />
                      {uploadedFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setUploadedFile(null);
                            setUploadMessage(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                          className="self-start text-xs text-red-600 hover:text-red-700"
                        >
                          Clear selected file
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      You can either paste an existing Document ID or upload a new file. If you upload,
                      we&apos;ll automatically save it and use its Document ID for this workflow.
                    </p>
                    {uploadedFile && (
                      <p className="mt-1 text-xs text-gray-600">
                        Selected file: <span className="font-medium">{uploadedFile.name}</span>
                      </p>
                    )}
                    {isUploadingDocument && (
                      <p className="mt-1 text-xs text-blue-600">
                        Uploading document, please wait...
                      </p>
                    )}
                    {uploadMessage && (
                      <p className="mt-1 text-xs text-gray-700">
                        {uploadMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-500">
                Enter the Document ID of the PDF you want to send for approval, or upload a new
                document using the file selector above.
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
                  Start Manual Approval Workflow
                </button>
              </div>
            </div>
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
