import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Send } from 'lucide-react';

interface DenySignatureProps {}

const DenySignature: React.FC<DenySignatureProps> = () => {
  const [workflowId, setWorkflowId] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Get parameters from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const wfId = urlParams.get('workflow');
    const email = urlParams.get('email');
    const name = urlParams.get('name');
    const docId = urlParams.get('document');
    
    if (wfId) setWorkflowId(wfId);
    if (email) setSignerEmail(email);
    if (name) setSignerName(name);
    if (docId) setDocumentId(docId);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!reason.trim()) {
      setError('Please provide a reason for declining the signature request.');
      return;
    }

    if (!workflowId || !signerEmail) {
      setError('Missing required information. Please use the link provided in the email.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('http://localhost:3001/api/boldsign/deny-signature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId,
          signerEmail,
          signerName,
          documentId,
          reason: reason.trim()
        })
      });

      const result = await response.json();

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.message || 'Failed to submit denial. Please try again.');
      }
    } catch (err: any) {
      console.error('Error denying signature:', err);
      setError('Failed to submit denial. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Signature Request Declined</h1>
          <p className="text-lg text-gray-600 mb-6">
            Your response has been recorded and all relevant parties have been notified.
          </p>
          <p className="text-sm text-gray-500">
            The workflow has been stopped and marked as signature denied.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 px-6 py-8 text-white">
          <div className="flex items-center justify-center gap-3 mb-2">
            <AlertCircle className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Decline Signature Request</h1>
          </div>
          <p className="text-center text-red-100">
            Please provide a reason for declining this signature request
          </p>
        </div>

        {/* Form */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <X className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Signer Information */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Signer Information</h3>
              <div className="space-y-1 text-sm text-gray-600">
                {signerName && <p><strong>Name:</strong> {signerName}</p>}
                {signerEmail && <p><strong>Email:</strong> {signerEmail}</p>}
                {workflowId && <p><strong>Workflow ID:</strong> {workflowId}</p>}
              </div>
            </div>

            {/* Reason Field */}
            <div className="mb-6">
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Declining <span className="text-red-600">*</span>
              </label>
              <textarea
                id="reason"
                name="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please explain why you are declining to sign this document..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                rows={6}
                required
                disabled={isSubmitting}
              />
              <p className="mt-2 text-sm text-gray-500">
                Your reason will be shared with all workflow participants.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit Decline Request
                  </>
                )}
              </button>
            </div>

            {/* Information Box */}
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">What happens next?</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• The workflow will be stopped immediately</li>
                <li>• All participants will be notified of your decision</li>
                <li>• Your reason will be included in the notification</li>
                <li>• The BoldSign document will be cancelled</li>
              </ul>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DenySignature;

