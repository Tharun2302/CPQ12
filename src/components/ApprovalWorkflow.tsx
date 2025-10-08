import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Plus, CheckCircle, Rocket, Users, Mail, FileCheck, BarChart3 } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import EmailService from '../utils/emailService';

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
  const emailService = EmailService.getInstance();
  const [formData, setFormData] = useState({
    documentType: 'PDF Quote',
    documentId: '',
    managerEmail: 'manager@company.com',
    ceoEmail: 'ceo@company.com',
    clientEmail: 'client@gmail.com'
  });

  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);

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
    // Simulate API call
    setTimeout(() => {
      setIsLoadingDocuments(false);
    }, 1000);
  };

  const handleCreateTestDocument = () => {
    const testDocument = {
      id: `TEST-${Date.now()}`,
      name: `Test Quote #${Date.now()}`,
      type: 'PDF Quote',
      clientName: 'Test Client',
      amount: 5000,
      status: 'Draft',
      createdAt: new Date().toISOString()
    };
    
    setAvailableDocuments(prev => [testDocument, ...prev]);
    
    // Auto-populate form with test document
    setFormData(prev => ({
      ...prev,
      documentId: testDocument.id
    }));
  };

  const handleDocumentSelect = (document: any) => {
    setFormData(prev => ({
      ...prev,
      documentId: document.id,
      documentType: document.type
    }));
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
    const newWorkflow = createWorkflow(workflowData);

    if (onStartWorkflow) {
      onStartWorkflow(newWorkflow);
    }

    // Send approval emails via backend API
    try {
      console.log('📧 Sending approval emails via backend...');
      
      const response = await fetch('http://localhost:3001/api/send-approval-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          managerEmail: formData.managerEmail,
          ceoEmail: formData.ceoEmail,
          clientEmail: formData.clientEmail,
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
        const successCount = result.results.filter((r: any) => r.success).length;
        const totalCount = result.results.length;
        
        if (successCount === totalCount) {
          alert('✅ Approval workflow started successfully!\n📧 All emails sent automatically to Manager, CEO, and Client.');
        } else {
          alert(`⚠️ Workflow started but only ${successCount}/${totalCount} emails sent successfully.\nCheck console for details.`);
        }
        
        console.log('📧 Email sending results:', result.results);
      } else {
        alert('⚠️ Workflow started but email sending failed: ' + result.message);
        console.error('Email sending error:', result);
      }
    } catch (error) {
      console.error('Error sending approval emails:', error);
      alert('⚠️ Workflow started but email sending failed. Please check the console for details.');
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
              Create Test Document
            </button>
          </div>

          {/* Available Documents List */}
          {availableDocuments.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="font-semibold text-gray-700">Available Documents:</h3>
              {availableDocuments.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleDocumentSelect(doc)}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    formData.documentId === doc.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{doc.name}</div>
                      <div className="text-sm text-gray-500">
                        {doc.clientName} • ${doc.amount?.toLocaleString()} • {doc.status}
                      </div>
                    </div>
                    {formData.documentId === doc.id && (
                      <CheckCircle className="w-5 h-5 text-blue-600" />
                    )}
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
    </div>
  );
};

export default ApprovalWorkflow;
