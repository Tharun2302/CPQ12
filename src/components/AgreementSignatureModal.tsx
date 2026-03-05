import React, { useState, useRef, useEffect } from 'react';
import { 
  X, CheckCircle, Loader2, ArrowLeft, PenTool, Mail, Settings, Plus, Info,
  Type, Calendar, Square, Circle, User, Building, Image, Link, ChevronDown,
  FileText, Eye, Send
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';

interface AgreementSignatureModalProps {
  workflow: any;
  onClose: () => void;
  onSignatureComplete: () => void;
}

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: 'signer' | 'viewer';
  language: string;
}

interface DocumentField {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  recipientId: string;
  page: number;
  label?: string;
  wrapperWidth?: number;  // Actual wrapper pixel width when field was placed
  wrapperHeight?: number; // Actual wrapper pixel height when field was placed
  // Percentage-based coordinates (0-1) = finalX / wrapperWidth, finalY / wrapperHeight
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  heightPercent?: number;
}

const AgreementSignatureModal: React.FC<AgreementSignatureModalProps> = ({
  workflow,
  onClose,
  onSignatureComplete
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(true);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: '1', name: '', email: '', role: 'signer', language: 'EN' }
  ]);
  const [ccEmails, setCcEmails] = useState<string>('');
  const [addMe, setAddMe] = useState(false);
  const [signingOrder, setSigningOrder] = useState(false);
  
  // Step 2 states - Field Configuration
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [documentFields, setDocumentFields] = useState<DocumentField[]>([]);
  const [draggedFieldType, setDraggedFieldType] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const documentContainerRef = useRef<HTMLDivElement>(null);
  const documentWrapperRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);
  const [uniqueFieldsCount, setUniqueFieldsCount] = useState(0);
  const objectUrlRef = useRef<string | null>(null);

  // Field types configuration
  const fieldTypes = [
    { type: 'signature', icon: PenTool, label: 'Signature' },
    { type: 'initials', icon: Type, label: 'Initials' },
    { type: 'textbox', icon: Type, label: 'Textbox' },
    { type: 'date', icon: Calendar, label: 'Date signed' },
    { type: 'checkbox', icon: Square, label: 'Checkbox' },
    { type: 'radio', icon: Circle, label: 'Radio' },
    { type: 'name', icon: User, label: 'Name' },
    { type: 'email', icon: Mail, label: 'Email' },
    { type: 'title', icon: FileText, label: 'Title' },
    { type: 'company', icon: Building, label: 'Company' },
    { type: 'editableDate', icon: Calendar, label: 'Editable Date' },
    { type: 'image', icon: Image, label: 'Image' },
    { type: 'formula', icon: Type, label: 'Formula' },
    { type: 'dropdown', icon: ChevronDown, label: 'Dropdown' },
    { type: 'attachment', icon: FileText, label: 'Attachment' },
  ];

  // Fetch document automatically when modal opens
  useEffect(() => {
    if (!workflow?.documentId) {
      setDocumentError('No document ID found for this workflow.');
      setIsLoadingDocument(false);
      return;
    }

    const fetchDocument = async () => {
      setIsLoadingDocument(true);
      setDocumentError(null);
      setDocumentPreviewUrl(null);
      revokeObjectUrlIfAny();

      const docId = workflow.documentId;

      try {
        // Try preview endpoint first
        const previewResp = await fetch(`${BACKEND_URL}/api/documents/${docId}/preview`);
        if (previewResp.ok) {
          const result = await previewResp.json();
          if (result?.success && result?.dataUrl) {
            setDocumentPreviewUrl(result.dataUrl);
            setIsLoadingDocument(false);
            // Estimate pages (could be improved with actual PDF parsing)
            setTotalPages(result.totalPages || 14);
            return;
          }
        }

        // Fallback: fetch document directly
        const directResp = await fetch(`${BACKEND_URL}/api/documents/${docId}`);
        if (!directResp.ok) {
          throw new Error(`Document not found (HTTP ${directResp.status})`);
        }
        const blob = await directResp.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setDocumentPreviewUrl(objectUrl);
        setTotalPages(14); // Default estimate
      } catch (e: any) {
        console.error('Failed to load document:', e);
        setDocumentError(e.message || 'Failed to load the document. Please try again.');
      } finally {
        setIsLoadingDocument(false);
      }
    };

    fetchDocument();

    // Cleanup on unmount
    return () => {
      revokeObjectUrlIfAny();
    };
  }, [workflow?.documentId]);

  // Set selected recipient when step 2 opens
  useEffect(() => {
    if (currentStep === 2 && recipients.length > 0) {
      setSelectedRecipient(recipients[0].id);
    }
  }, [currentStep, recipients]);

  // Debug: Log field changes
  useEffect(() => {
    console.log('Document fields updated:', documentFields.length, documentFields);
  }, [documentFields]);

  const revokeObjectUrlIfAny = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  // Add recipient
  const addRecipient = () => {
    const newId = String(recipients.length + 1);
    setRecipients([...recipients, { id: newId, name: '', email: '', role: 'signer', language: 'EN' }]);
  };

  // Update recipient
  const updateRecipient = (id: string, field: keyof Recipient, value: string) => {
    setRecipients(recipients.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // Remove recipient
  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id));
    }
  };

  // Handle field drag start
  const handleFieldDragStart = (fieldType: string) => {
    setDraggedFieldType(fieldType);
  };

  // Handle field drop on document
  const handleDocumentDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedFieldType || !selectedRecipient) {
      setDraggedFieldType(null);
      return;
    }

    const container = documentContainerRef.current;
    if (!container) {
      setDraggedFieldType(null);
      return;
    }

    // Find the document wrapper div (parent of iframe)
    // Try ref first, then fallback to querySelector
    const documentWrapper = documentWrapperRef.current || container.querySelector('.document-wrapper') as HTMLElement;
    if (!documentWrapper) {
      console.error('Document wrapper not found');
      setDraggedFieldType(null);
      return;
    }

    // Get the bounding rect of the document wrapper
    const wrapperRect = documentWrapper.getBoundingClientRect();
    
    // Calculate position relative to the document wrapper
    // Account for scroll position and padding
    const scrollLeft = container.scrollLeft;
    const scrollTop = container.scrollTop;
    const padding = 0; // No padding to avoid space
    
    // Calculate drop position relative to document wrapper
    // The correct calculation: position relative to wrapper's (0,0) corner
    // wrapperRect.top is the wrapper's position in the viewport
    // When scrolled, wrapperRect.top becomes negative (wrapper is above viewport)
    // Position in wrapper = clientY - wrapperRect.top (this gives us position from wrapper's top)
    // We DON'T add scrollTop because wrapperRect already accounts for the scroll position
    
    // Calculate position relative to document wrapper
    // getBoundingClientRect() gives viewport coordinates
    // e.clientX/Y are viewport coordinates
    // wrapperRect.left/top are viewport coordinates
    // So (e.clientX - wrapperRect.left) gives position relative to wrapper, accounting for scroll automatically
    
    // IMPORTANT: The iframe might have internal padding/margins from the PDF viewer
    // We need to account for this. The PDF content typically starts at (0,0) within the iframe,
    // but the iframe itself might have borders or the PDF viewer adds margins.
    // Since we can't access iframe internals (cross-origin), we assume the iframe content
    // starts at the wrapper's (0,0) position.
    const x = (e.clientX - wrapperRect.left) - padding;
    const y = (e.clientY - wrapperRect.top) - padding;
    
    console.log('📍 Drop coordinates calculation:', {
      clientX: e.clientX,
      clientY: e.clientY,
      wrapperLeft: wrapperRect.left,
      wrapperTop: wrapperRect.top,
      wrapperWidth: wrapperRect.width,
      wrapperHeight: wrapperRect.height,
      calculatedX: x,
      calculatedY: y,
      note: 'These are relative to wrapper (0,0)'
    });
    
    // Clamp coordinates to reasonable bounds (within document dimensions)
    const maxX = Math.max(800, wrapperRect.width || 800);
    const maxY = totalPages * 1100;
    
    const clampedX = Math.max(0, Math.min(x, maxX - 120)); // Updated for smaller field width
    const clampedY = Math.max(0, Math.min(y, maxY - 32)); // Updated for smaller field height
    
    console.log('Drop coordinates:', { 
      clientX: e.clientX, 
      clientY: e.clientY,
      wrapperLeft: wrapperRect.left,
      wrapperTop: wrapperRect.top,
      wrapperWidth: wrapperRect.width,
      scrollLeft,
      scrollTop,
      calculatedX: x,
      calculatedY: y,
      clampedX,
      clampedY
    });

    const fieldLabel = fieldTypes.find(ft => ft.type === draggedFieldType)?.label || draggedFieldType;
    const fieldWidth = 120; // Reduced from 150
    const fieldHeight = 32; // Reduced from 40

    // Use clamped coordinates and center the field on drop point
    const finalX = Math.max(0, clampedX - fieldWidth / 2);
    const finalY = Math.max(0, clampedY - fieldHeight / 2);

    // Calculate which page this field is actually on based on Y coordinate
    // Each page is approximately 1100px tall
    const pageHeight = 1100;
    const calculatedPage = Math.max(1, Math.min(totalPages, Math.floor(finalY / pageHeight) + 1));
    
    console.log('📄 Page calculation:', {
      finalY,
      pageHeight,
      calculatedPage,
      currentPage,
      totalPages,
      usingPage: calculatedPage
    });

    // KEY INSIGHT: Both the modal and signing page render each PDF page at exactly 1100px.
    // Therefore, Y coordinates (absolute pixels from document top) are IDENTICAL in both.
    // Only X needs scaling because the container widths differ between components.
    const wrapperWidth = wrapperRect.width;

    // Store X as percentage of wrapper width (for responsive horizontal positioning)
    // Store Y as absolute pixels (no scaling needed — same 1100px/page in both components)
    const xPercent = wrapperWidth > 0 ? finalX / wrapperWidth : 0;
    const widthPercent = wrapperWidth > 0 ? fieldWidth / wrapperWidth : 0;

    console.log('📐 Storing field:', {
      finalX, finalY, wrapperWidth,
      xPercent, widthPercent,
      note: 'Y is stored as absolute pixels - no scaling needed'
    });
    
    const newField: DocumentField = {
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: draggedFieldType,
      x: finalX,
      y: finalY,          // absolute pixels from document top — same in both components
      width: fieldWidth,
      height: fieldHeight,
      recipientId: selectedRecipient,
      page: calculatedPage,
      label: fieldLabel,
      wrapperWidth: wrapperWidth, // used to scale X on signing page
      xPercent,                    // X as fraction of wrapperWidth
      widthPercent,                // width as fraction of wrapperWidth
      // yPercent / heightPercent intentionally NOT stored — Y is absolute
    };

    console.log('Adding new field:', {
      ...newField,
      wrapperWidth: wrapperWidth,
      wrapperRect: {
        width: wrapperRect.width,
        height: wrapperRect.height,
        left: wrapperRect.left,
        top: wrapperRect.top
      }
    });
    console.log('Current documentFields count:', documentFields.length);
    
    // Add field to the list - use functional update to ensure we have latest state
    // Guard against duplicate IDs (can happen in React StrictMode)
    setDocumentFields(prevFields => {
      if (prevFields.some(f => f.id === newField.id)) {
        console.warn('⚠️ Duplicate field ID detected, skipping:', newField.id);
        return prevFields;
      }
      const updated = [...prevFields, newField];
      console.log('Updated documentFields count:', updated.length);
      return updated;
    });
    setDraggedFieldType(null);
  };

  // Handle field click
  const handleFieldClick = (fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedField(fieldId);
  };

  // Delete field
  const handleDeleteField = (fieldId: string) => {
    setDocumentFields(prevFields => {
      const updated = prevFields.filter(f => f.id !== fieldId);
      console.log('Deleted field, remaining fields:', updated.length);
      return updated;
    });
    if (selectedField === fieldId) {
      setSelectedField(null);
    }
  };

  // Handle field drag (for repositioning)
  const handleFieldMouseDown = (fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const field = documentFields.find(f => f.id === fieldId);
    if (!field) return;

    const container = documentContainerRef.current;
    if (!container) return;

      const documentWrapper = documentWrapperRef.current || container.querySelector('.document-wrapper') as HTMLElement;
      if (!documentWrapper) return;

      const wrapperRect = documentWrapper.getBoundingClientRect();
      const offsetX = e.clientX - wrapperRect.left - field.x;
      const offsetY = e.clientY - wrapperRect.top - field.y;

    setDraggedFieldId(fieldId);
    setDragOffset({ x: offsetX, y: offsetY });
    setSelectedField(fieldId);
  };

  // Handle mouse move for field dragging
  useEffect(() => {
    if (!draggedFieldId || !dragOffset) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = documentContainerRef.current;
      if (!container) return;

      const documentWrapper = documentWrapperRef.current || container.querySelector('.document-wrapper') as HTMLElement;
      if (!documentWrapper) return;

      const wrapperRect = documentWrapper.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      const padding = 0;

      const newX = e.clientX - wrapperRect.left + scrollLeft - padding - dragOffset.x;
      const newY = e.clientY - wrapperRect.top + scrollTop - padding - dragOffset.y;

      setDocumentFields(prevFields =>
        prevFields.map(f =>
          f.id === draggedFieldId
            ? { ...f, x: Math.max(0, newX), y: Math.max(0, newY) }
            : f
        )
      );
    };

    const handleMouseUp = () => {
      setDraggedFieldId(null);
      setDragOffset(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedFieldId, dragOffset, documentFields]);

  // Validate step 1 before proceeding
  const handleNext = () => {
    // Validate recipients
    const invalidRecipients = recipients.filter(r => !r.name.trim() || !r.email.trim());
    if (invalidRecipients.length > 0) {
      setError('Please fill in all recipient name and email fields.');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter(r => !emailRegex.test(r.email));
    if (invalidEmails.length > 0) {
      setError('Please enter valid email addresses for all recipients.');
      return;
    }

    setError(null);
    setCurrentStep(2);
  };

  // Handle preview
  const handlePreview = () => {
    // Open document in new tab/window for preview
    if (documentPreviewUrl) {
      window.open(documentPreviewUrl, '_blank');
    }
  };

  // Handle send
  const handleSend = () => {
    // Validate recipients
    const validRecipients = recipients.filter(r => r.name.trim() && r.email.trim());
    if (validRecipients.length === 0) {
      setError('Please add at least one recipient with name and email before sending.');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validRecipients.filter(r => !emailRegex.test(r.email));
    if (invalidEmails.length > 0) {
      setError('Please enter valid email addresses for all recipients.');
      return;
    }

    if (documentFields.length === 0) {
      setError('Please add at least one field to the document before sending.');
      return;
    }

    // Filter out duplicate fields by ID
    const uniqueFields = documentFields.filter((f, index, self) => 
      index === self.findIndex(field => field.id === f.id)
    );
    
    console.log('📊 Field count check:', {
      totalFields: documentFields.length,
      uniqueFields: uniqueFields.length,
      duplicateCount: documentFields.length - uniqueFields.length,
      allFieldIds: documentFields.map(f => f.id),
      duplicateIds: documentFields.filter((f, index, self) => 
        self.findIndex(field => field.id === f.id) !== index
      ).map(f => f.id)
    });

    // Store unique fields count for the modal
    setUniqueFieldsCount(uniqueFields.length);

    // Show confirmation modal
    setShowSendConfirmation(true);
  };

  const handleConfirmSend = async () => {
    const validRecipients = recipients.filter(r => r.name.trim() && r.email.trim());
    
    // Deduplicate fields by ID before sending to backend
    const uniqueDocumentFields = documentFields.filter((f, index, self) => 
      index === self.findIndex(field => field.id === f.id)
    );
    console.log(`📤 Sending ${uniqueDocumentFields.length} unique fields (was ${documentFields.length} total)`);
    
    setIsSubmitting(true);
    setError(null);
    setShowSendConfirmation(false);

    try {
      const response = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflow.id}/send-for-signing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: validRecipients,
          ccEmails: ccEmails.split(',').map(e => e.trim()).filter(Boolean),
          documentFields: uniqueDocumentFields,
          signingOrder: signingOrder,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send document for signing');
      }

      const result = await response.json();
      console.log('✅ Document sent for signing:', result);
      
      onSignatureComplete();
      onClose();
    } catch (err: any) {
      console.error('Error sending document:', err);
      setError(err.message || 'Failed to send document. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full ${currentStep === 2 ? 'max-w-[95vw]' : 'max-w-5xl'} bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden ${currentStep === 2 ? 'h-[95vh]' : 'max-h-[90vh]'} flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4">
            {currentStep === 2 && (
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-gray-900">
                {currentStep === 1 ? 'Prepare document for signing' : 'Configure fields'}
              </h3>
              <div className="text-xs text-gray-600 mt-1">
                {currentStep === 1 ? 'Step 1/2' : 'Step 2/2'} • {workflow.documentId || 'Document'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentStep === 2 && (
              <>
                <button
                  type="button"
                  onClick={handlePreview}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 transition-colors text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  Send
                  <ChevronDown className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {currentStep === 1 ? (
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-rose-800 font-semibold text-sm">{error}</div>
              </div>
            )}

            <div className="space-y-6">
              {/* Document Preview Section */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Document Preview</h4>
                {isLoadingDocument ? (
                  <div className="h-96 flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Loading document...</p>
                    </div>
                  </div>
                ) : documentError ? (
                  <div className="h-96 flex items-center justify-center border-2 border-dashed border-red-300 rounded-lg bg-red-50">
                    <div className="text-center">
                      <p className="text-sm text-red-600 font-semibold">{documentError}</p>
                    </div>
                  </div>
                ) : documentPreviewUrl ? (
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <iframe
                      src={documentPreviewUrl}
                      title="Document Preview"
                      className="w-full h-96"
                    />
                  </div>
                ) : null}
              </div>

              {/* Add Recipients Section */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-4">Add Recipients</h4>
                <div className="space-y-4">
                  {recipients.map((recipient, index) => (
                    <div key={recipient.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm font-medium text-gray-700">{index + 1}</span>
                        <div className="flex-1 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Recipient name<span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={recipient.name}
                              onChange={(e) => updateRecipient(recipient.id, 'name', e.target.value)}
                              placeholder="Enter recipient name"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Recipient email<span className="text-red-500">*</span>
                            </label>
                            <input
                              type="email"
                              value={recipient.email}
                              onChange={(e) => updateRecipient(recipient.id, 'email', e.target.value)}
                              placeholder="Enter recipient email"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium flex items-center gap-2"
                        >
                          <Mail className="h-3 w-3" />
                          Email
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-xs font-medium flex items-center gap-2"
                        >
                          <Settings className="h-3 w-3" />
                          Settings
                        </button>
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded">
                            <PenTool className="h-3 w-3 text-gray-600" />
                            <select
                              value={recipient.role}
                              onChange={(e) => updateRecipient(recipient.id, 'role', e.target.value)}
                              className="text-xs border-0 bg-transparent focus:ring-0 outline-none"
                            >
                              <option value="signer">Signer</option>
                              <option value="viewer">Viewer</option>
                            </select>
                          </div>
                          <select
                            value={recipient.language}
                            onChange={(e) => updateRecipient(recipient.id, 'language', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="EN">EN</option>
                            <option value="ES">ES</option>
                            <option value="FR">FR</option>
                            <option value="DE">DE</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addRecipient}
                  className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Recipient
                </button>
                <div className="mt-4 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={addMe}
                      onChange={(e) => setAddMe(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Add me
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={signingOrder}
                      onChange={(e) => setSigningOrder(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Signing order
                    <Info className="h-4 w-4 text-gray-400" title="Selected language will be used in signer pages and emails." />
                  </label>
                </div>
              </div>

              {/* Add CC Section */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-sm font-semibold text-gray-900">Add CC</h4>
                  <Info className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                  placeholder="Enter one or more email addresses separated by a comma"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Configure Fields */
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar - Fields */}
            <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Fields</h4>
                <select
                  value={selectedRecipient}
                  onChange={(e) => setSelectedRecipient(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  {recipients.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name || r.email || `Recipient ${r.id}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-1.5">
                  {fieldTypes.map((fieldType) => {
                    const Icon = fieldType.icon;
                    return (
                      <button
                        key={fieldType.type}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          handleFieldDragStart(fieldType.type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        className="flex flex-col items-center justify-center p-2 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors cursor-move"
                        title={fieldType.label}
                      >
                        <Icon className="h-4 w-4 text-gray-600 mb-0.5" />
                        <span className="text-[10px] text-gray-600 text-center leading-tight">{fieldType.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <button
                    type="button"
                    className="flex items-center justify-center p-2 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    title="Text/Font"
                  >
                    <Type className="h-4 w-4 text-gray-600" />
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center p-2 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                    title="Link"
                  >
                    <Link className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Center - Document Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-100">
              {error && (
                <div className="mx-2 mt-2 rounded-xl border border-rose-200 bg-rose-50 p-2">
                  <div className="text-rose-800 font-semibold text-sm">{error}</div>
                </div>
              )}
              <div
                ref={documentContainerRef}
                onDrop={handleDocumentDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onClick={() => setSelectedField(null)}
                className="flex-1 overflow-auto p-0 relative"
                style={{ height: '100%' }}
              >
                {isLoadingDocument ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                  </div>
                ) : documentPreviewUrl ? (
                  <div 
                    ref={documentWrapperRef}
                    className="document-wrapper relative bg-white shadow-lg" 
                    style={{ 
                      width: '100%', 
                      maxWidth: '100%', 
                      position: 'relative',
                      minHeight: `${totalPages * 1100}px`, // Ensure enough height for all pages
                      margin: 0 // Remove margin to avoid space
                    }}
                  >
                    <iframe
                      src={`${documentPreviewUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                      title="Document"
                      className="w-full border-0 pointer-events-none"
                      style={{ 
                        display: 'block', 
                        height: `${totalPages * 1100}px`, // Height based on page count
                        minHeight: `${totalPages * 1100}px`,
                        width: '100%'
                      }}
                    />
                    {/* Render placed fields using percentage-based coordinates */}
                    {documentFields.map((field) => {
                      const fieldType = fieldTypes.find(ft => ft.type === field.type);
                      const isSelected = selectedField === field.id;

                      // X: scale by current wrapper width (containers differ in width)
                      // Y: use absolute pixels as-is (same 1100px/page in both components)
                      const wrapperW = documentWrapperRef.current?.getBoundingClientRect().width || field.wrapperWidth || 800;
                      const displayX = field.xPercent !== undefined ? field.xPercent * wrapperW : field.x;
                      const displayY = field.y; // absolute pixels — no scaling
                      const displayW = field.widthPercent !== undefined ? field.widthPercent * wrapperW : field.width;
                      const displayH = field.height; // absolute pixels — no scaling
                      
                      return (
                        <div
                          key={field.id}
                          onClick={(e) => handleFieldClick(field.id, e)}
                          onMouseDown={(e) => handleFieldMouseDown(field.id, e)}
                          className={`absolute border-2 ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-400 bg-white/90'} rounded p-1 cursor-move hover:border-indigo-400 z-10 shadow-sm ${draggedFieldId === field.id ? 'opacity-80' : ''}`}
                          style={{
                            left: `${displayX}px`,
                            top: `${displayY}px`,
                            width: `${displayW}px`,
                            height: `${displayH}px`,
                            pointerEvents: 'auto',
                          }}
                        >
                          <div className="flex items-center justify-between h-full">
                            <span className="text-[10px] font-medium text-gray-700 truncate">{field.label || field.type}</span>
                            {isSelected && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteField(field.id);
                                }}
                                className="ml-1 text-red-600 hover:text-red-800 flex-shrink-0"
                                title="Delete field"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : documentError ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-red-600 font-semibold">{documentError}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Right Sidebar - Thumbnails */}
            <div className="w-48 border-l border-gray-200 bg-gray-50 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-900">Thumbnails</h4>
                <p className="text-xs text-gray-600 mt-1 truncate">
                  {workflow.documentId || 'document'} ({totalPages} pages)
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {Array.from({ length: totalPages }).map((_, index) => (
                  <div
                    key={index}
                    onClick={() => setCurrentPage(index + 1)}
                    className={`cursor-pointer border-2 rounded p-1 ${
                      currentPage === index + 1 ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {currentStep === 1 && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={isLoadingDocument || !!documentError}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Send Confirmation Modal */}
      {showSendConfirmation && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              The following document(s) will be sent to the recipient(s)
            </h3>
            
            {/* Document Details */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-700">
                <span className="font-medium">{workflow.documentId || 'Document'}</span>
                <span className="text-gray-500"> {totalPages} page(s) | {uniqueFieldsCount || (() => {
                  // Fallback: filter duplicates if uniqueFieldsCount not set
                  const uniqueFields = documentFields.filter((f, index, self) => 
                    index === self.findIndex(field => field.id === f.id)
                  );
                  return uniqueFields.length;
                })()} field(s)</span>
              </div>
            </div>

            {/* Recipients List */}
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-700 mb-2">Recipients:</div>
              <div className="space-y-2">
                {recipients
                  .filter(r => r.name.trim() && r.email.trim())
                  .map((recipient) => {
                    // Count unique fields for this recipient (filter duplicates by ID)
                    const recipientFields = documentFields.filter(f => f.recipientId === recipient.id);
                    const uniqueRecipientFields = recipientFields.filter((f, index, self) => 
                      index === self.findIndex(field => field.id === f.id)
                    );
                    const recipientFieldCount = uniqueRecipientFields.length;
                    return (
                      <div key={recipient.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">{recipient.name || recipient.email.split('@')[0]}</span>
                          {recipient.name && (
                            <span className="text-gray-500 ml-1">({recipient.email})</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {recipientFieldCount} field(s)
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSendConfirmation(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgreementSignatureModal;
