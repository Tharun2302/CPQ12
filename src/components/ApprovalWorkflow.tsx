import React, { useState, useEffect, useRef } from 'react';
import { FileText, Rocket, Users, FileCheck, BarChart3, Settings, X, Plus, Trash2 } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import ApprovalDashboard from './ApprovalDashboard';
import { BACKEND_URL } from '../config/api';
import { useLocation } from 'react-router-dom';
import { getCurrentUser } from '../utils/authUtils';

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
    role1Email: 'cpq.zenop.ai.technical@cloudfuze.com',
    role2Email: 'cpq.zenop.ai.legal@cloudfuze.com',
    role4Email: 'salesops@cloudfuze.com'
  });

  // Team Approval settings - loaded from MongoDB API
  const [teamApprovalSettings, setTeamApprovalSettings] = useState<{
    teamLeads: Record<string, string>;
    additionalRecipients: Record<string, string[]>; // Keep for backward compatibility
    authorizedSenders: Record<string, string[]>; // People who can send approval emails to this team lead
  }>({
    teamLeads: {
      SMB: 'chitradip.saha@cloudfuze.com',
      AM: 'joy.prakash@cloudfuze.com',
      ENT: 'anthony@cloudfuze.com',
      DEV: 'anushreddydasari@gmail.com',
      DEV2: 'raya.durai@cloudfuze.com',
    },
    additionalRecipients: {
      SMB: [],
      AM: [],
      ENT: [],
      DEV: [],
      DEV2: [],
    },
    authorizedSenders: {
      SMB: [],
      AM: [],
      ENT: [],
      DEV: [],
      DEV2: [],
    }
  });

  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Load settings from MongoDB API on component mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoadingSettings(true);
        setSettingsError(null);
        
        const response = await fetch(`${BACKEND_URL}/api/team-approval-settings`);
        const result = await response.json();
        
        if (result.success && result.data) {
          // Migrate old data: ensure authorizedSenders exists
          if (!result.data.authorizedSenders) {
            result.data.authorizedSenders = {
              SMB: [],
              AM: [],
              ENT: [],
              DEV: [],
              DEV2: [],
            };
          }
          setTeamApprovalSettings(result.data);
          
          // Also save to localStorage as backup/cache
          try {
            localStorage.setItem('cpq_team_approval_settings', JSON.stringify(result.data));
          } catch {}
        } else {
          // Try loading from localStorage as fallback
          try {
            const saved = localStorage.getItem('cpq_team_approval_settings');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (!parsed.authorizedSenders) {
                parsed.authorizedSenders = {
                  SMB: [], AM: [], ENT: [], DEV: [], DEV2: [],
                };
              }
              setTeamApprovalSettings(parsed);
            }
          } catch {}
        }
      } catch (error) {
        console.error('Error loading team approval settings:', error);
        setSettingsError('Failed to load settings. Using defaults.');
        
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem('cpq_team_approval_settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (!parsed.authorizedSenders) {
              parsed.authorizedSenders = {
                SMB: [], AM: [], ENT: [], DEV: [], DEV2: [],
              };
            }
            setTeamApprovalSettings(parsed);
          }
        } catch {}
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings to MongoDB API whenever they change (with debounce)
  useEffect(() => {
    if (isLoadingSettings) return; // Don't save on initial load
    
    const saveSettings = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/team-approval-settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(teamApprovalSettings),
        });

        const result = await response.json();
        if (result.success) {
          console.log('✅ Team approval settings saved to MongoDB');
          // Also save to localStorage as backup/cache
          try {
            localStorage.setItem('cpq_team_approval_settings', JSON.stringify(teamApprovalSettings));
          } catch {}
        } else {
          console.error('Failed to save settings to MongoDB:', result.error);
          // Fallback: save to localStorage
          try {
            localStorage.setItem('cpq_team_approval_settings', JSON.stringify(teamApprovalSettings));
          } catch {}
        }
      } catch (error) {
        console.error('Error saving team approval settings:', error);
        // Fallback: save to localStorage
        try {
          localStorage.setItem('cpq_team_approval_settings', JSON.stringify(teamApprovalSettings));
        } catch {}
      }
    };

    // Debounce: wait 1 second after last change before saving
    const timeoutId = setTimeout(saveSettings, 1000);
    return () => clearTimeout(timeoutId);
  }, [teamApprovalSettings, isLoadingSettings]);

  // Get logged-in user's email
  const currentUser = getCurrentUser();
  const loggedInUserEmail = currentUser?.email || '';

  // Check if user is authorized for any team
  const getUserAuthorizedTeam = (): string | null => {
    if (!loggedInUserEmail) return null;
    
    // Check each team's authorized senders list
    for (const [team, senders] of Object.entries(teamApprovalSettings.authorizedSenders || {})) {
      if (Array.isArray(senders) && senders.includes(loggedInUserEmail)) {
        return team;
      }
    }
    
    // Also check if logged-in user is a team lead
    for (const [team, leadEmail] of Object.entries(teamApprovalSettings.teamLeads || {})) {
      if (leadEmail === loggedInUserEmail) {
        return team;
      }
    }
    
    return null;
  };

  // Automatic team selection logic based on logged-in user's email
  const getAutoSelectedTeam = (amount: number = 0, clientName: string = ''): string => {
    const authorizedTeam = getUserAuthorizedTeam();
    
    if (authorizedTeam) {
      console.log(`✅ Auto-selected team ${authorizedTeam} based on logged-in user: ${loggedInUserEmail}`);
      return authorizedTeam;
    }
    
    // If user is not authorized, use manual selection (defaults to SMB)
    return manualTeamSelection;
  };

  // Handle sending authorization request to team lead
  const handleSendAuthorizationRequest = async () => {
    if (!requestingTeam || !loggedInUserEmail) return;

    setIsSendingRequest(true);
    try {
      const teamLeadEmail = teamApprovalSettings.teamLeads[requestingTeam];
      if (!teamLeadEmail) {
        alert('Team lead email not found for this team.');
        setIsSendingRequest(false);
        return;
      }

      const backendUrl = BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/send-authorization-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requesterEmail: loggedInUserEmail,
          requesterName: currentUser?.name || loggedInUserEmail.split('@')[0],
          teamLeadEmail: teamLeadEmail,
          teamName: requestingTeam,
          message: requestMessage || `Hi, I would like to request authorization to send approval workflows to the ${requestingTeam} team.`,
        }),
      });

      const result = await response.json();
      if (result.success) {
        alert(`✅ Authorization request sent to ${teamLeadEmail} for ${requestingTeam} team. The request has been saved to the database.`);
        setShowRequestModal(false);
        setRequestingTeam('');
        setRequestMessage('');
      } else {
        alert('Failed to send request. Please try again or contact the team lead directly.');
      }
    } catch (error) {
      console.error('Error sending authorization request:', error);
      alert('Failed to send request. Please try again or contact the team lead directly.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  // Get team approval email
  const getTeamApprovalEmail = (team: string): string => {
    const key = (team || '').toUpperCase();
    return teamApprovalSettings.teamLeads[key] || '';
  };

  // State for settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string>('SMB');
  const [newRecipientEmail, setNewRecipientEmail] = useState<string>('');
  const [newAuthorizedSenderEmail, setNewAuthorizedSenderEmail] = useState<string>('');

  // State for manual team selection (when user is not authorized)
  const [manualTeamSelection, setManualTeamSelection] = useState<string>('SMB');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestingTeam, setRequestingTeam] = useState<string>('');
  const [requestMessage, setRequestMessage] = useState<string>('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  // Auto-suggest logged-in user when opening settings
  useEffect(() => {
    if (showSettingsModal && loggedInUserEmail) {
      // Check if logged-in user is already in authorized senders for current team
      const currentSenders = teamApprovalSettings.authorizedSenders[editingTeam] || [];
      const isAlreadyAdded = currentSenders.includes(loggedInUserEmail);
      
      // If not already added and not the team lead, suggest adding them
      if (!isAlreadyAdded && teamApprovalSettings.teamLeads[editingTeam] !== loggedInUserEmail) {
        // Auto-populate the input field with logged-in user's email
        setNewAuthorizedSenderEmail(loggedInUserEmail);
      }
    }
  }, [showSettingsModal, editingTeam, loggedInUserEmail, teamApprovalSettings]);

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

      // Automatically determine team based on amount/client
      const autoSelectedTeam = getAutoSelectedTeam(amount, clientName);
      const teamEmail = getTeamApprovalEmail(autoSelectedTeam);
      if (!teamEmail) {
        alert('Team Approval email not configured. Please configure team settings.');
        return;
      }

      // Get additional recipients for this team (for backward compatibility)
      const additionalRecipients = teamApprovalSettings.additionalRecipients[autoSelectedTeam] || [];

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
            group: autoSelectedTeam,
            comments: '',
            additionalRecipients: additionalRecipients
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
              additionalRecipients: additionalRecipients,
              workflowData: {
                documentId: effectiveDocumentId,
                documentType: formData.documentType,
                clientName,
                amount,
                workflowId: newWorkflow.id,
                teamGroup: autoSelectedTeam
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
            alert(`✅ Approval workflow started.\n📧 Team Approval (${autoSelectedTeam}) has been notified for first approval.`);
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

              {/* Team Approval - Automatic Selection with Edit Option */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-600" />
                    Team Approval Group
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Edit Settings
                  </button>
                </div>
                <p className="text-xs text-gray-600 mb-4">
                  Team lead is automatically selected. Click "Edit Settings" to configure team leads and add recipients.
                </p>
                <div className="bg-white rounded-lg p-3 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      {loggedInUserEmail && (() => {
                        const authorizedTeam = getUserAuthorizedTeam();
                        const selectedTeam = getAutoSelectedTeam();
                        const isAuthorized = authorizedTeam === selectedTeam;
                        
                        if (!authorizedTeam) {
                          // User not authorized - show manual selection dropdown
                          return (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-2">
                                  Select Team (You are not authorized by any team)
                                </label>
                                <select
                                  value={manualTeamSelection}
                                  onChange={(e) => setManualTeamSelection(e.target.value)}
                                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white"
                                >
                                  <option value="SMB">SMB ({teamApprovalSettings.teamLeads.SMB})</option>
                                  <option value="AM">AM ({teamApprovalSettings.teamLeads.AM})</option>
                                  <option value="ENT">ENT ({teamApprovalSettings.teamLeads.ENT})</option>
                                  <option value="DEV">DEV ({teamApprovalSettings.teamLeads.DEV})</option>
                                  <option value="DEV2">DEV2 ({teamApprovalSettings.teamLeads.DEV2})</option>
                                </select>
                              </div>
                              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="text-xs text-amber-800 font-semibold mb-1">
                                  ⚠️ Not Authorized
                                </div>
                                <div className="text-xs text-amber-700 mb-2">
                                  You are not authorized by any team leader. Select a team above or request authorization.
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRequestingTeam(manualTeamSelection);
                                    setShowRequestModal(true);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                >
                                  Request Authorization from {manualTeamSelection} Team Lead
                                </button>
                              </div>
                              <div className="text-xs text-gray-600">
                                Selected Team: <span className="text-purple-600 font-semibold">{selectedTeam}</span>
                              </div>
                              <div className="text-xs text-gray-600">
                                Team Lead: {getTeamApprovalEmail(selectedTeam) || 'Not configured'}
                              </div>
                            </div>
                          );
                        }
                        
                        // User is authorized - show normal display
                        return (
                          <>
                            <div className="text-sm font-semibold text-gray-900">
                              Selected Team: <span className="text-purple-600">{selectedTeam}</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Team Lead: {getTeamApprovalEmail(selectedTeam) || 'Not configured'}
                            </div>
                            <div className="text-xs text-blue-600 mt-1 font-semibold">
                              ✓ You are authorized to send approvals to this team
                            </div>
                          </>
                        );
                      })()}
                      
                      {!loggedInUserEmail && (
                        <>
                          <div className="text-sm font-semibold text-gray-900">
                            Selected Team: <span className="text-purple-600">{getAutoSelectedTeam()}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Team Lead: {getTeamApprovalEmail(getAutoSelectedTeam()) || 'Not configured'}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
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

      {/* Team Approval Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-3">
                <Settings className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-extrabold text-gray-900">Team Approval Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {/* Team Selection Tabs */}
                <div className="flex gap-2 border-b border-gray-200">
                  {['SMB', 'AM', 'ENT', 'DEV', 'DEV2'].map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setEditingTeam(team)}
                      className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
                        editingTeam === team
                          ? 'border-purple-600 text-purple-600'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {team}
                    </button>
                  ))}
                </div>

                {/* Current Team Settings */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      Team Lead Email ({editingTeam})
                    </label>
                    <input
                      type="email"
                      value={teamApprovalSettings.teamLeads[editingTeam] || ''}
                      onChange={(e) => {
                        setTeamApprovalSettings(prev => ({
                          ...prev,
                          teamLeads: {
                            ...prev.teamLeads,
                            [editingTeam]: e.target.value
                          }
                        }));
                      }}
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white"
                      placeholder="team.lead@cloudfuze.com"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      This email will receive approval requests for {editingTeam} team workflows.
                    </p>
                  </div>

                    {/* Authorized Senders - People who can send approval emails to this team lead */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">
                        Authorized Senders (People who can send approvals to this team lead)
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        Add people who can send approval emails to the {editingTeam} team lead. When they log in and start a workflow, their team will be automatically selected.
                      </p>
                      {loggedInUserEmail && (
                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-800">
                            <strong>Logged in as:</strong> {loggedInUserEmail}
                            {teamApprovalSettings.authorizedSenders[editingTeam]?.includes(loggedInUserEmail) ? (
                              <span className="text-green-600 ml-2">✓ Already authorized - Your workflows will auto-select {editingTeam} team</span>
                            ) : teamApprovalSettings.teamLeads[editingTeam] === loggedInUserEmail ? (
                              <span className="text-purple-600 ml-2">(You are the team lead - no authorization needed)</span>
                            ) : (
                              <span className="text-blue-600 ml-2">- Click "Add" to authorize yourself to send approvals to {editingTeam} team</span>
                            )}
                          </p>
                        </div>
                      )}
                    
                    {/* Add New Authorized Sender */}
                    <div className="flex gap-2 mb-3">
                      <input
                        type="email"
                        value={newAuthorizedSenderEmail}
                        onChange={(e) => setNewAuthorizedSenderEmail(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newAuthorizedSenderEmail.trim()) {
                            e.preventDefault();
                            setTeamApprovalSettings(prev => ({
                              ...prev,
                              authorizedSenders: {
                                ...prev.authorizedSenders,
                                [editingTeam]: [
                                  ...(prev.authorizedSenders[editingTeam] || []),
                                  newAuthorizedSenderEmail.trim()
                                ]
                              }
                            }));
                            setNewAuthorizedSenderEmail('');
                          }
                        }}
                        className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white"
                        placeholder="authorized.sender@cloudfuze.com"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newAuthorizedSenderEmail.trim()) {
                            setTeamApprovalSettings(prev => ({
                              ...prev,
                              authorizedSenders: {
                                ...prev.authorizedSenders,
                                [editingTeam]: [
                                  ...(prev.authorizedSenders[editingTeam] || []),
                                  newAuthorizedSenderEmail.trim()
                                ]
                              }
                            }));
                            setNewAuthorizedSenderEmail('');
                          }
                        }}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    </div>

                    {/* Authorized Senders List */}
                    <div className="space-y-2">
                      {teamApprovalSettings.authorizedSenders[editingTeam]?.length > 0 ? (
                        teamApprovalSettings.authorizedSenders[editingTeam].map((email, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <span className="text-sm text-gray-700">{email}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setTeamApprovalSettings(prev => ({
                                  ...prev,
                                  authorizedSenders: {
                                    ...prev.authorizedSenders,
                                    [editingTeam]: prev.authorizedSenders[editingTeam].filter((_, i) => i !== idx)
                                  }
                                }));
                              }}
                              className="text-red-600 hover:text-red-700 p-1 rounded transition-colors"
                              aria-label="Remove authorized sender"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-400 italic py-2">
                          No authorized senders added yet. Add emails to allow users to automatically send approvals to this team lead.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  alert('✅ Team approval settings saved successfully!');
                }}
                className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Authorization Request Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-purple-600" />
                <h2 className="text-lg font-extrabold text-gray-900">Request Authorization</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRequestModal(false);
                  setRequestingTeam('');
                  setRequestMessage('');
                }}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Requesting authorization for: <span className="text-purple-600">{requestingTeam} Team</span>
                </label>
                <p className="text-xs text-gray-600">
                  Team Lead: {teamApprovalSettings.teamLeads[requestingTeam] || 'Not configured'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Your Message (Optional)
                </label>
                <textarea
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  placeholder={`Hi, I would like to request authorization to send approval workflows to the ${requestingTeam} team.`}
                  className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white min-h-[100px]"
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  A request email will be sent to the team lead with your message.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowRequestModal(false);
                  setRequestingTeam('');
                  setRequestMessage('');
                }}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendAuthorizationRequest}
                disabled={isSendingRequest}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSendingRequest ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    Send Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalWorkflow;
