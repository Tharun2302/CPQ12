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
    teamSelection: 'SMB',
    role1Email: 'cpq.zenop.ai.technical@cloudfuze.com',
    role2Email: 'cpq.zenop.ai.legal@cloudfuze.com',
    role4Email: 'salesops@cloudfuze.com'
  });

  // Team Approval emails mapping
  const TEAM_APPROVAL_EMAILS: Record<string, string> = {
    SMB: 'chitradip.saha@cloudfuze.com',
    AM: 'joy.prakash@cloudfuze.com',
    ENT: 'anthony@cloudfuze.com',
    DEV: 'anushreddydasari@gmail.com',
    DEV2: 'raya.durai@cloudfuze.com',
  };

  // Helper function to get team approval email
  const getTeamApprovalEmail = (team: string): string => {
    const key = (team || '').toUpperCase();
    return TEAM_APPROVAL_EMAILS[key] || '';
  };

  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle navigation state to open specific tabs
  useEffect(() => {
    const state = location.state as { 
      openStartApprovalTab?: boolean; 
      openDashboardTab?: boolean;
      documentId?: string;
      source?: string;
    } | null;
    
    // If navigated from quote approval, open Admin Dashboard tab
    if (state?.openDashboardTab || state?.source === 'quote-approval') {
      setActiveTab('dashboard');
      console.log('✅ Opening Admin Dashboard tab after approval submission');
    } 
    // If navigated from template upload, jump directly to Start Approval Workflow tab
    else if (state?.openStartApprovalTab) {
      setActiveTab('start');
    }
    
    // If a documentId is passed via navigation state, pre-fill it
    if (state?.documentId) {
      setFormData(prev => ({
        ...prev,
        documentId: state.documentId || ''
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

      // Get Team Approval email from selection
      const teamEmail = getTeamApprovalEmail(formData.teamSelection);
      if (!teamEmail) {
        alert('Please select a valid Team Approval group.');
        return;
      }

      const newWorkflow = await createWorkflow({
        documentId: effectiveDocumentId,
        documentType: formData.documentType,
        clientName,
        amount,
        totalSteps: 4,
        workflowSteps: [
          {
            step: 1,
            role: 'Team Approval',
            email: teamEmail,
            status: 'pending',
            group: formData.teamSelection,
            comments: ''
          },
          {
            step: 2,
            role: 'Technical Team',
            email: formData.role1Email,
            status: 'pending'
          },
          {
            step: 3,
            role: 'Legal Team',
            email: formData.role2Email,
            status: 'pending'
          },
          {
            step: 4,
            role: 'Deal Desk',
            email: formData.role4Email,
            status: 'pending'
          }
        ]
      });

      if (newWorkflow) {
        // After creating the workflow, send the first email to Team Approval
        try {
          const backendUrl = BACKEND_URL || 'http://localhost:3001';

          console.log('📧 Sending Team Approval email for manual workflow...', {
            teamEmail,
            workflowId: newWorkflow.id,
            documentId: effectiveDocumentId
          });

          const response = await fetch(`${backendUrl}/api/send-team-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              teamEmail,
              workflowData: {
                documentId: effectiveDocumentId,
                documentType: formData.documentType,
                clientName,
                amount,
                workflowId: newWorkflow.id,
                teamGroup: formData.teamSelection
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
            alert(`✅ Approval workflow started.\n📧 Team Approval (${formData.teamSelection}) has been notified for first approval.`);
          } else {
            alert('✅ Workflow created but Team Approval email failed.\nPlease notify Team Approval manually.');
          }
        } catch (emailError) {
          console.error('❌ Error sending Team Approval email for manual workflow:', emailError);
          alert('✅ Workflow created but Team Approval email failed.\nPlease notify Team Approval manually.');
        }
      } else {
        alert('Approval workflow could not be created. Please try again.');
      }
    } catch (error) {
      console.error('Error starting workflow:', error);
      alert('Failed to start approval workflow. Please try again.');
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 to-blue-50 w-full">
      <div className="w-full space-y-6">
        {/* Tab Content */}
        {activeTab === 'start' && (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200">
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 bg-gray-100 text-gray-800 shadow-sm hover:bg-gray-200"
                >
                  <BarChart3 className="w-5 h-5" />
                  Back to Dashboard
                </button>
              </div>
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

              {/* Team Approval Selection */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  Team Approval Group
                </h3>
                <p className="text-xs text-gray-600 mb-4">Select the Team Approval group for first approval</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Team Approval Group
                  </label>
                  <select
                    value={formData.teamSelection}
                    onChange={(e) => setFormData(prev => ({ ...prev, teamSelection: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white"
                  >
                    <option value="SMB">SMB ({TEAM_APPROVAL_EMAILS.SMB})</option>
                    <option value="AM">AM ({TEAM_APPROVAL_EMAILS.AM})</option>
                    <option value="ENT">ENT ({TEAM_APPROVAL_EMAILS.ENT})</option>
                    <option value="DEV">DEV ({TEAM_APPROVAL_EMAILS.DEV})</option>
                    <option value="DEV2">DEV2 ({TEAM_APPROVAL_EMAILS.DEV2})</option>
                  </select>
                </div>
              </div>

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

                  {/* Deal Desk Email */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">
                      Deal Desk Email
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="email"
                        value={formData.role4Email}
                        onChange={(e) => setFormData(prev => ({ ...prev, role4Email: e.target.value }))}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm bg-white"
                        placeholder="dealdesk@company.com"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-500">
                Workflow order: Team Approval → Technical Team → Legal Team → Deal Desk. Each role will receive the document and can approve or deny it.
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
          <div className="w-full">
            <ApprovalDashboard onStartManualApprovalWorkflow={() => setActiveTab('start')} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalWorkflow;
