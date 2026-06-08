import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { FileText, Rocket, Users, FileCheck, BarChart3, Settings, X, Plus, Trash2, Shield, UserPlus, Loader2, Mail } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import ApprovalDashboard from './ApprovalDashboard';
import { BACKEND_URL } from '../config/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../utils/authUtils';
import { useAuth } from '../hooks/useAuth';

interface ApprovalWorkflowProps {
  quotes?: any[];
  onStartWorkflow?: (workflowData: any) => void;
  onNavigateToDashboard?: () => void;
  /** Wired from Dashboard so the nav “Start Manual Approval” opens the start tab. */
  registerStartManualApproval?: (handler: (() => void) | null) => void;
  /** Wired from Dashboard so clicking “Approval” in the sidebar while the
   *  Start Manual Approval form is open resets back to the dashboard view. */
  registerApprovalDashboardReset?: (handler: (() => void) | null) => void;
}

const ApprovalWorkflow: React.FC<ApprovalWorkflowProps> = ({
  quotes = [],
  registerStartManualApproval,
  registerApprovalDashboardReset,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { createWorkflow } = useApprovalWorkflows();
  const { user: authUser } = useAuth();
  const userIsAdmin = Boolean((authUser as any)?.isApprovalAdmin);
  const [activeTab, setActiveTab] = useState('dashboard');

  useLayoutEffect(() => {
    registerStartManualApproval?.(() => setActiveTab('start'));
    return () => registerStartManualApproval?.(null);
  }, [registerStartManualApproval]);

  useLayoutEffect(() => {
    registerApprovalDashboardReset?.(() => setActiveTab('dashboard'));
    return () => registerApprovalDashboardReset?.(null);
  }, [registerApprovalDashboardReset]);

  // Sidebar "Start Manual Approval" from another tab: land on /approval with this flag.
  useEffect(() => {
    const st = location.state as { openManualApproval?: boolean } | null;
    if (!st?.openManualApproval) return;
    setActiveTab('start');
    navigate('/approval', { replace: true, state: {} });
  }, [location.state, navigate]);
  const [formData, setFormData] = useState({
    documentType: 'PDF Agreement',
    documentId: '',
    role1Email: 'cpq.zenop.ai.technical@cloudfuze.com',
    role2Email: 'cpq.zenop.ai.legal@cloudfuze.com',
    role4Email: 'salesops@cloudfuze.com'
  });

  // Contact Information for manual approval workflow (saved contact / from navigation)
  const [contactInfo, setContactInfo] = useState<{ clientName: string; clientEmail: string; company: string }>({
    clientName: '',
    clientEmail: '',
    company: ''
  });

  // Team Approval settings - loaded from MongoDB API
  const [teamApprovalSettings, setTeamApprovalSettings] = useState<{
    teamLeads: Record<string, string>;
    additionalRecipients: Record<string, string[]>; // Keep for backward compatibility
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
        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
        const result = await response.json();
        
        if (result.success && result.data) {
          const teamIds = Object.keys(result.data.teamLeads || {});
          if (!result.data.additionalRecipients) result.data.additionalRecipients = {};
          teamIds.forEach((k) => {
            if (!Array.isArray(result.data.additionalRecipients[k])) result.data.additionalRecipients[k] = [];
          });
          delete result.data.authorizedSenders;
          setTeamApprovalSettings(result.data);

          try {
            localStorage.setItem('cpq_team_approval_settings', JSON.stringify(result.data));
          } catch {}
        } else {
          try {
            const saved = localStorage.getItem('cpq_team_approval_settings');
            if (saved) {
              const parsed = JSON.parse(saved);
              const teamIds = Object.keys(parsed.teamLeads || {});
              if (!parsed.additionalRecipients) parsed.additionalRecipients = {};
              teamIds.forEach((k) => {
                if (!Array.isArray(parsed.additionalRecipients[k])) parsed.additionalRecipients[k] = [];
              });
              delete parsed.authorizedSenders;
              setTeamApprovalSettings(parsed);
            }
          } catch {}
        }
      } catch (error) {
        console.error('Error loading team approval settings:', error);
        setSettingsError('Failed to load settings. Using defaults.');

        try {
          const saved = localStorage.getItem('cpq_team_approval_settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            const teamIds = Object.keys(parsed.teamLeads || {});
            if (!parsed.additionalRecipients) parsed.additionalRecipients = {};
            teamIds.forEach((k) => {
              if (!Array.isArray(parsed.additionalRecipients[k])) parsed.additionalRecipients[k] = [];
            });
            delete parsed.authorizedSenders;
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

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }
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

  // Get team approval email
  const getTeamApprovalEmail = (team: string): string => {
    const key = (team || '').toUpperCase();
    return teamApprovalSettings.teamLeads?.[key] ?? '';
  };

  const teamIds = Object.keys(teamApprovalSettings.teamLeads || {});

  const handleAddTeam = () => {
    const code = newTeamCode.trim().toUpperCase();
    if (!code) {
      alert('Please enter a team code (e.g. DEV3).');
      return;
    }
    if (!/^[A-Za-z0-9_]+$/.test(code)) {
      alert('Team code can only contain letters, numbers, and underscores.');
      return;
    }
    if (teamApprovalSettings.teamLeads?.[code] !== undefined) {
      alert(`Team "${code}" already exists.`);
      return;
    }
    setTeamApprovalSettings((prev) => ({
      ...prev,
      teamLeads: { ...prev.teamLeads, [code]: '' },
      additionalRecipients: { ...prev.additionalRecipients, [code]: [] },
    }));
    setEditingTeam(code);
    setNewTeamCode('');
    setShowAddTeamInput(false);
  };

  const handleRemoveTeam = () => {
    const ids = Object.keys(teamApprovalSettings.teamLeads || {});
    if (ids.length <= 1) {
      alert('Cannot remove the last team. At least one team is required.');
      return;
    }
    if (!window.confirm(`Remove team "${editingTeam}"? This cannot be undone.`)) return;
    const next = ids.find((t) => t !== editingTeam) || ids[0];
    setTeamApprovalSettings((prev) => {
      const { [editingTeam]: _lead, ...teamLeads } = prev.teamLeads || {};
      const { [editingTeam]: _recips, ...additionalRecipients } = prev.additionalRecipients || {};
      return { ...prev, teamLeads, additionalRecipients };
    });
    setEditingTeam(next);
    setManualTeamSelection((current) => (current === editingTeam ? next : current));
  };

  // State for settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string>('SMB');
  const [newRecipientEmail, setNewRecipientEmail] = useState<string>('');
  const [newTeamCode, setNewTeamCode] = useState<string>('');
  const [showAddTeamInput, setShowAddTeamInput] = useState(false);

  // Team picked by the user in the Send for Approval modal
  const [manualTeamSelection, setManualTeamSelection] = useState<string>('SMB');

  // Approval Admins modal — manages who can edit Team Approval Settings
  const [showApprovalAdminsModal, setShowApprovalAdminsModal] = useState(false);
  const [approvalAdminEmails, setApprovalAdminEmails] = useState<string[]>([]);
  const [approvalAdminLoading, setApprovalAdminLoading] = useState(false);
  const [approvalAdminError, setApprovalAdminError] = useState<string | null>(null);
  const [newApprovalAdminEmail, setNewApprovalAdminEmail] = useState('');
  const [addingApprovalAdmin, setAddingApprovalAdmin] = useState(false);
  const [removingApprovalAdmin, setRemovingApprovalAdmin] = useState<string | null>(null);

  const getApprovalAdminAuthHeaders = (): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpq_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchApprovalAdmins = async () => {
    try {
      setApprovalAdminLoading(true);
      setApprovalAdminError(null);
      const res = await fetch(`${BACKEND_URL}/api/settings/approval-admins`, { headers: getApprovalAdminAuthHeaders() });
      const data = await res.json();
      if (!res.ok) {
        setApprovalAdminError(data.error || 'Failed to load admins');
        setApprovalAdminEmails([]);
        return;
      }
      setApprovalAdminEmails(data.emails || []);
    } catch {
      setApprovalAdminError('Failed to load approval admins');
      setApprovalAdminEmails([]);
    } finally {
      setApprovalAdminLoading(false);
    }
  };

  const handleAddApprovalAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newApprovalAdminEmail.trim();
    if (!email || !email.includes('@')) {
      setApprovalAdminError('Please enter a valid email');
      return;
    }
    setAddingApprovalAdmin(true);
    setApprovalAdminError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/approval-admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getApprovalAdminAuthHeaders() },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApprovalAdminError(data.error || 'Failed to add');
        return;
      }
      setApprovalAdminEmails(data.emails || []);
      setNewApprovalAdminEmail('');
    } catch {
      setApprovalAdminError('Failed to add email');
    } finally {
      setAddingApprovalAdmin(false);
    }
  };

  const handleRemoveApprovalAdmin = async (email: string) => {
    setRemovingApprovalAdmin(email);
    setApprovalAdminError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/approval-admins/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: getApprovalAdminAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setApprovalAdminError(data.error || 'Failed to remove');
        return;
      }
      setApprovalAdminEmails(data.emails || []);
    } catch {
      setApprovalAdminError('Failed to remove email');
    } finally {
      setRemovingApprovalAdmin(null);
    }
  };

  useEffect(() => {
    if (showApprovalAdminsModal && userIsAdmin) {
      fetchApprovalAdmins();
    }
  }, [showApprovalAdminsModal, loggedInUserEmail]);

  // Keep editingTeam and manualTeamSelection valid when team list changes (e.g. load from API)
  useEffect(() => {
    const ids = Object.keys(teamApprovalSettings.teamLeads || {});
    if (ids.length === 0) return;
    const first = ids[0];
    if (!ids.includes(editingTeam)) setEditingTeam(first);
    if (!ids.includes(manualTeamSelection)) setManualTeamSelection(first);
  }, [teamApprovalSettings]);

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

    // If contact information is passed via navigation state, pre-fill it
    const stateContact = state as { contactInfo?: { clientName?: string; clientEmail?: string; company?: string }; clientName?: string; clientEmail?: string; company?: string } | null;
    if (stateContact?.contactInfo) {
      setContactInfo(prev => ({
        clientName: stateContact.contactInfo?.clientName ?? prev.clientName,
        clientEmail: stateContact.contactInfo?.clientEmail ?? prev.clientEmail,
        company: stateContact.contactInfo?.company ?? prev.company
      }));
    } else if (stateContact?.clientName || stateContact?.clientEmail || stateContact?.company) {
      setContactInfo(prev => ({
        clientName: stateContact.clientName ?? prev.clientName,
        clientEmail: stateContact.clientEmail ?? prev.clientEmail,
        company: stateContact.company ?? prev.company
      }));
    }
  }, [location.state]);

  // Load saved contact info from localStorage/sessionStorage when opening Start tab
  useEffect(() => {
    if (activeTab !== 'start') return;
    try {
      const saved = localStorage.getItem('cpq_contact_info') || sessionStorage.getItem('cpq_configure_contact_info');
      if (saved) {
        const parsed = JSON.parse(saved);
        const name = parsed.clientName ?? parsed.contactName ?? '';
        const email = parsed.clientEmail ?? parsed.contactEmail ?? '';
        const company = parsed.company ?? parsed.companyName ?? '';
        if (name || email || company) {
          setContactInfo(prev => ({
            clientName: name || prev.clientName,
            clientEmail: email || prev.clientEmail,
            company: company || prev.company
          }));
        }
      }
    } catch (_) {}
  }, [activeTab]);

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
        clientName: contactInfo.clientName?.trim() || 'Manual Approval',
        company: contactInfo.company?.trim() || 'Manual Approval',
        clientEmail: contactInfo.clientEmail?.trim() || undefined,
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
        contactInfo.clientName?.trim() ||
        matchingQuote?.clientName ||
        selectedDoc?.clientName ||
        'Unknown Client';
      const companyName = contactInfo.company?.trim() || matchingQuote?.company || selectedDoc?.company || clientName;
      const clientEmail = contactInfo.clientEmail?.trim() || matchingQuote?.clientEmail || selectedDoc?.clientEmail || undefined;

      const amount =
        matchingQuote?.calculation?.totalCost ??
        matchingQuote?.totalCost ??
        selectedDoc?.amount ??
        0;

      // User picks the team in the Send for Approval modal — use that selection
      const autoSelectedTeam = manualTeamSelection;
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
        ...(companyName && { companyName }),
        ...(clientEmail && { clientEmail }),
        creatorEmail: loggedInUserEmail || undefined,
        creatorName: currentUser?.name || (loggedInUserEmail ? loggedInUserEmail.split('@')[0] : undefined),
        lastReminderSentAt: null,
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
                teamGroup: autoSelectedTeam,
                ...(companyName && { companyName }),
                ...(clientEmail && { clientEmail })
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
              <div className="flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 bg-gray-100 text-gray-800 shadow-sm hover:bg-gray-200"
                >
                  ← Back to Approval Dashboard
                </button>
              </div>
              {/* Document Information */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Document Information
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    {/* Upload document for this workflow */}
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">
                        Upload Document (All file types)
                      </label>
                      <div className="flex flex-col gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
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
                        Upload a file to send for approval. It will be saved and used for this workflow.
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
                Upload a document using the file selector above to send it for approval.
              </p>

              {/* Approval Emails - Simple email input */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-600" />
                  Send Approval To
                </h3>
                <p className="text-xs text-gray-600 mb-4">
                  Add email addresses to send this approval. Documents will be sent in the order listed.
                </p>
                <div className="space-y-3">
                  {formData.approvalEmails?.map((email, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded min-w-fit">
                        #{idx + 1}
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          const updated = [...(formData.approvalEmails || [])];
                          updated[idx] = e.target.value;
                          setFormData(prev => ({ ...prev, approvalEmails: updated }));
                        }}
                        placeholder="user@company.com"
                        className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = (formData.approvalEmails || []).filter((_, i) => i !== idx);
                          setFormData(prev => ({ ...prev, approvalEmails: updated }));
                        }}
                        className="text-red-600 hover:text-red-700 text-sm font-semibold px-3 py-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, approvalEmails: [...(prev.approvalEmails || []), ''] }))}
                  className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-2 px-3 py-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Email
                </button>

                {/* Sequential vs Parallel Toggle */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.sendSequentially !== false}
                      onChange={(e) => setFormData(prev => ({ ...prev, sendSequentially: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Send Sequentially <span className="text-gray-500">(#1 approves first, then #2, etc.)</span>
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-2 ml-7">
                    {formData.sendSequentially !== false
                      ? '✓ Approvers will receive documents one at a time in order'
                      : '✓ All approvers will receive documents at the same time'}
                  </p>
                </div>
              </div>

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
            <ApprovalDashboard />
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
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-200">
                  {teamIds.map((team) => (
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
                  {showAddTeamInput ? (
                    <div className="flex items-center gap-2 pb-2">
                      <input
                        type="text"
                        value={newTeamCode}
                        onChange={(e) => setNewTeamCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTeam())}
                        placeholder="e.g. DEV3"
                        className="px-2 py-1 text-sm border border-gray-300 rounded w-24"
                        autoFocus
                      />
                      <button type="button" onClick={handleAddTeam} className="px-2 py-1 text-sm font-semibold text-white bg-purple-600 rounded hover:bg-purple-700">
                        Add
                      </button>
                      <button type="button" onClick={() => { setShowAddTeamInput(false); setNewTeamCode(''); }} className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddTeamInput(true)}
                      className="px-3 py-2 text-sm font-semibold text-purple-600 border border-purple-300 rounded hover:bg-purple-50 transition-colors"
                    >
                      + Add team
                    </button>
                  )}
                </div>

                {/* Current Team Settings */}
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
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
                    {teamIds.length > 1 && (
                      <button
                        type="button"
                        onClick={handleRemoveTeam}
                        className="mt-6 px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                        aria-label={`Remove team ${editingTeam}`}
                      >
                        Remove team
                      </button>
                    )}
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

      {/* Approval Admins Modal */}
      {showApprovalAdminsModal && userIsAdmin && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowApprovalAdminsModal(false)}
        >
          <div
            className="bg-white rounded-xl border border-gray-200 shadow-lg max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Approval Admins
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  Users with these emails can edit Team Approval Settings and manage this list. You can also set APPROVAL_ADMIN_EMAILS in .env.
                </p>
              </div>
              <button
                onClick={() => setShowApprovalAdminsModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <form onSubmit={handleAddApprovalAdmin} className="flex gap-2">
                <input
                  type="email"
                  value={newApprovalAdminEmail}
                  onChange={(e) => setNewApprovalAdminEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  disabled={addingApprovalAdmin}
                />
                <button
                  type="submit"
                  disabled={addingApprovalAdmin || !newApprovalAdminEmail.trim()}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {addingApprovalAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Add
                </button>
              </form>
              {approvalAdminError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  {approvalAdminError}
                </div>
              )}
              {approvalAdminLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : approvalAdminEmails.length === 0 ? (
                <p className="text-gray-500 text-xs">No approval admins in the list yet. Add an email above or use .env / DEFAULT_APPROVAL_ADMINS.</p>
              ) : (
                <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
                  {approvalAdminEmails.map((email) => (
                    <li key={email} className="py-2 flex items-center justify-between gap-2">
                      <span className="text-gray-900 text-sm truncate">{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveApprovalAdmin(email)}
                        disabled={removingApprovalAdmin === email}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 text-sm"
                        title="Remove"
                      >
                        {removingApprovalAdmin === email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ApprovalWorkflow;
