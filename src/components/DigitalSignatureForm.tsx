import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Eye, Download, Send } from 'lucide-react';

interface SignatureFormProps {
  formId: string;
  quoteData: any;
  clientName: string;
  clientEmail: string;
  onComplete: (signatureData: any, approvalStatus: string, comments: string) => void;
}

interface InteractionData {
  timestamp: Date;
  type: string;
  data?: any;
}

const DigitalSignatureForm: React.FC<SignatureFormProps> = ({
  formId,
  quoteData,
  clientName,
  clientEmail,
  onComplete
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [approvalStatus, setApprovalStatus] = useState<'approved' | 'rejected' | 'pending'>('pending');
  const [clientComments, setClientComments] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [interactions, setInteractions] = useState<InteractionData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);

  // Track time spent on form
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Track form interactions
  const trackInteraction = async (type: string, data?: any) => {
    const interaction: InteractionData = {
      timestamp: new Date(),
      type,
      data
    };

    setInteractions(prev => [...prev, interaction]);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      await fetch(`${backendUrl}/api/signature/track-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          interactionType: type,
          data
        })
      });
    } catch (error) {
      console.error('Failed to track interaction:', error);
    }
  };

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 200;

    // Set drawing styles
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Track form opened
    trackInteraction('form_opened', { timeSpent: 0 });
  }, []);

  // Handle mouse/touch events for signature
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);

    trackInteraction('signature_started');
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    trackInteraction('signature_completed');
  };

  // Clear signature
  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData('');
    trackInteraction('signature_cleared');
  };

  // Save signature as data URL
  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataURL = canvas.toDataURL('image/png');
    setSignatureData(dataURL);
    trackInteraction('signature_saved');
  };

  // Submit form
  const handleSubmit = async () => {
    if (!signatureData) {
      alert('Please provide your signature before submitting.');
      return;
    }

    setIsSubmitting(true);
    trackInteraction('form_submitted', { 
      approvalStatus, 
      hasComments: !!clientComments,
      timeSpent 
    });

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const response = await fetch(`${backendUrl}/api/signature/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formId,
          signatureData,
          approvalStatus,
          clientComments
        })
      });

      if (response.ok) {
        onComplete(signatureData, approvalStatus, clientComments);
      } else {
        throw new Error('Failed to submit form');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Digital Quote Approval</h1>
        <p className="text-gray-600">Please review and sign the quote below</p>
        <div className="flex items-center justify-center gap-4 mt-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>Time: {formatTime(timeSpent)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="w-4 h-4" />
            <span>Form ID: {formId}</span>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            1
          </div>
          <div className={`w-16 h-1 ${currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            2
          </div>
          <div className={`w-16 h-1 ${currentStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            currentStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            3
          </div>
        </div>
      </div>

      {/* Step 1: Quote Review */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-xl">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quote Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Client Name</p>
                <p className="font-medium">{clientName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Client Email</p>
                <p className="font-medium">{clientEmail}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Cost</p>
                <p className="font-medium text-green-600">${quoteData.totalCost?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Plan</p>
                <p className="font-medium">{quoteData.plan}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => trackInteraction('quote_reviewed')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Review Complete
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Digital Signature */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-xl">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Digital Signature</h2>
            <p className="text-gray-600 mb-4">Please sign below to approve this quote</p>
            
            <div className="border-2 border-gray-300 rounded-lg p-4 bg-white">
              <canvas
                ref={canvasRef}
                className="border border-gray-300 rounded cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={clearSignature}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Clear Signature
              </button>
              <button
                onClick={saveSignature}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Save Signature
              </button>
            </div>

            {signatureData && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 text-sm">✅ Signature saved successfully</p>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!signatureData}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Approval Decision */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-xl">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Approval Decision</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Approval Status
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="approvalStatus"
                      value="approved"
                      checked={approvalStatus === 'approved'}
                      onChange={(e) => setApprovalStatus(e.target.value as 'approved' | 'rejected')}
                      className="mr-2"
                    />
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Approve Quote
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="approvalStatus"
                      value="rejected"
                      checked={approvalStatus === 'rejected'}
                      onChange={(e) => setApprovalStatus(e.target.value as 'approved' | 'rejected')}
                      className="mr-2"
                    />
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="w-4 h-4" />
                      Reject Quote
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comments (Optional)
                </label>
                <textarea
                  value={clientComments}
                  onChange={(e) => setClientComments(e.target.value)}
                  rows={4}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add any comments or feedback..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || approvalStatus === 'pending'}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Approval
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      {currentStep < 3 && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex justify-center">
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next Step
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DigitalSignatureForm;
