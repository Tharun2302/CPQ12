import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Loader2, PenTool, CheckCircle, X, Globe, ChevronDown,
  FileText, Calendar, Square, Circle, User, Building, Mail, Image, Type
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';

// Force immediate render to debug routing
console.log('🔓 PublicSigningPage module loaded');

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
  value?: string;
  wrapperWidth?: number;  // Actual wrapper pixel width when field was placed
  wrapperHeight?: number; // Actual wrapper pixel height when field was placed
  // Percentage-based coordinates (0-1) = finalX / wrapperWidth, finalY / wrapperHeight
  xPercent?: number;
  yPercent?: number;
  widthPercent?: number;
  heightPercent?: number;
}

const PublicSigningPage: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workflowId = searchParams.get('workflow');
  
  // Log immediately when component function is called (before any hooks)
  console.log('🔓 ========================================');
  console.log('🔓 PublicSigningPage component function called');
  console.log('🔓 React Router location.pathname:', location.pathname);
  console.log('🔓 React Router location.search:', location.search);
  console.log('🔓 Window location.pathname:', window.location.pathname);
  console.log('🔓 Window location.search:', window.location.search);
  console.log('🔓 Workflow ID from URL:', workflowId);
  console.log('🔓 Full URL:', window.location.href);
  console.log('🔓 ========================================');
  
  // Debug logging - log immediately on mount
  useEffect(() => {
    console.log('🔓 PublicSigningPage useEffect - component mounted');
    console.log('🔓 React Router location:', location);
    
    // Check if we're on the correct route
    if (location.pathname !== '/sign') {
      console.error('❌ Route mismatch! Expected /sign but got:', location.pathname);
    } else {
      console.log('✅ Route is correct: /sign');
    }
  }, [location, workflowId]);
  
  const [workflow, setWorkflow] = useState<any>(null);
  const [documentPreviewUrl, setDocumentPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentFields, setDocumentFields] = useState<DocumentField[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [requiredFieldsLeft, setRequiredFieldsLeft] = useState(0);
  const [isSigning, setIsSigning] = useState(false);
  const [signingComplete, setSigningComplete] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureData, setSignatureData] = useState<string>('');
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [language, setLanguage] = useState('EN');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signingStarted, setSigningStarted] = useState(false); // true after user clicks "Continue"
  const [coordinateScale, setCoordinateScale] = React.useState(1);
  
  // Debug: Log button state whenever it changes
  useEffect(() => {
    const isDisabled = isSigning || !agreementAccepted;
    console.log('🔘 Continue button state:');
    console.log('  - isSigning:', isSigning);
    console.log('  - agreementAccepted:', agreementAccepted);
    console.log('  - Button DISABLED:', isDisabled);
    console.log('  - Button ENABLED:', !isDisabled);
    if (!agreementAccepted) {
      console.log('  ❌ Reason: Agreement checkbox not checked');
    } else if (!isDisabled) {
      console.log('  ✅ Button should be ENABLED!');
    }
  }, [isSigning, agreementAccepted]);
  
  const documentContainerRef = useRef<HTMLDivElement>(null);
  const documentWrapperRef = useRef<HTMLDivElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Fetch workflow and document
  useEffect(() => {
    if (!workflowId) {
      setError('No workflow ID provided in URL');
      setIsLoading(false);
      return;
    }

    const fetchWorkflow = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}`);
        
        if (!response.ok) {
          throw new Error('Workflow not found');
        }

        const result = await response.json();
        console.log('📦 Workflow fetch response:', {
          success: result.success,
          hasWorkflow: !!result.workflow,
          hasDocumentFields: !!(result.workflow?.documentFields),
          documentFieldsCount: result.workflow?.documentFields?.length || 0,
          workflowKeys: result.workflow ? Object.keys(result.workflow) : []
        });
        
        if (result.success && result.workflow) {
          setWorkflow(result.workflow);
          
          // Load document fields if configured
          if (result.workflow.documentFields && result.workflow.documentFields.length > 0) {
            console.log('📋 Loading document fields:', result.workflow.documentFields.length, 'fields');
            setDocumentFields(result.workflow.documentFields);
          }
          
          // Load document and get REAL page count from the PDF
          const docId = result.workflow.documentId;
          if (docId) {
            await loadDocument(docId, result.workflow.documentFields || []);
          } else {
            setError('No document found for this workflow');
          }
        } else {
          throw new Error('Workflow not found');
        }
      } catch (err: any) {
        console.error('Error fetching workflow:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    fetchWorkflow();
  }, [workflowId]);

  const loadDocument = async (docId: string, fields: any[] = []) => {
    try {
      // Try preview endpoint first — this returns the real totalPages from the PDF
      const previewResp = await fetch(`${BACKEND_URL}/api/documents/${docId}/preview`);
      if (previewResp.ok) {
        const result = await previewResp.json();
        if (result?.success && result?.dataUrl) {
          setDocumentPreviewUrl(result.dataUrl);
          // Use actual page count from PDF metadata
          const realPages = result.totalPages || 1;
          // Also check max page from fields as a safety floor
          const maxFieldPage = fields.length > 0
            ? Math.max(...fields.map((f: any) => f.page || 1))
            : 1;
          const pages = Math.max(realPages, maxFieldPage);
          console.log(`📄 Total pages: PDF=${realPages}, maxFieldPage=${maxFieldPage}, using=${pages}`);
          setTotalPages(pages);
          return;
        }
      }

      // Fallback to direct file (no page count metadata)
      const directResp = await fetch(`${BACKEND_URL}/api/documents/${docId}`);
      if (directResp.ok) {
        const blob = await directResp.blob();
        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setDocumentPreviewUrl(objectUrl);
        // Use max field page as fallback for totalPages
        const maxFieldPage = fields.length > 0
          ? Math.max(...fields.map((f: any) => f.page || 1))
          : 1;
        setTotalPages(Math.max(maxFieldPage, 1));
      } else {
        throw new Error('Document not found');
      }
    } catch (err: any) {
      console.error('Error loading document:', err);
      setError('Failed to load document');
    }
  };

  // Calculate required fields
  useEffect(() => {
    // If no document fields are configured, don't require any fields
    if (!documentFields || documentFields.length === 0) {
      console.log('📝 No document fields configured, setting requiredFieldsLeft to 0');
      setRequiredFieldsLeft(0);
      return;
    }
    
    // Only count fields that are actually marked as required or are signature/name/date fields
    const required = documentFields.filter(f => 
      f.type === 'signature' || f.type === 'name' || f.type === 'date'
    );
    
    // If no required fields are configured, allow proceeding
    if (required.length === 0) {
      console.log('📝 No required fields (signature/name/date) configured, setting requiredFieldsLeft to 0');
      setRequiredFieldsLeft(0);
      return;
    }
    
    const filled = required.filter(f => {
      const value = fieldValues[f.id];
      // Check if field has a value (for signature, check if it's an image data URL)
      if (f.type === 'signature') {
        return value && (value.startsWith('data:image') || value.trim().length > 0);
      }
      return value && value.trim().length > 0;
    });
    const remaining = required.length - filled.length;
    setRequiredFieldsLeft(remaining);
    // Log each property separately for better visibility in console
    console.log('📝 Required fields calculation:');
    console.log('  - Total document fields:', documentFields.length);
    console.log('  - Required fields (signature/name/date):', required.length);
    console.log('  - Filled required fields:', filled.length);
    console.log('  - Remaining required fields:', remaining);
    if (required.length > 0) {
      console.log('  - Required fields details:');
      required.forEach(f => {
        const hasValue = !!fieldValues[f.id];
        const value = fieldValues[f.id];
        console.log(`    • ${f.type} (${f.label || f.type}) - Page ${f.page}: ${hasValue ? 'FILLED ✓' : 'EMPTY ✗'}`);
        if (hasValue && f.type === 'signature') {
          console.log(`      Value: ${value.startsWith('data:image') ? 'Signature image' : value.substring(0, 30) + '...'}`);
        } else if (hasValue) {
          console.log(`      Value: ${value.substring(0, 30)}${value.length > 30 ? '...' : ''}`);
        }
      });
    }
    console.log('  - All field values keys:', Object.keys(fieldValues).length > 0 ? Object.keys(fieldValues) : 'none');
    
    // Also log which specific fields need to be filled
    if (remaining > 0) {
      const unfilledFields = required.filter(f => {
        const value = fieldValues[f.id];
        if (f.type === 'signature') {
          return !value || (!value.startsWith('data:image') && value.trim().length === 0);
        }
        return !value || value.trim().length === 0;
      });
      console.log('⚠️ Unfilled required fields:', unfilledFields.length);
      unfilledFields.forEach(f => {
        console.log(`  - ${f.type} (${f.label || f.type}) on page ${f.page}`);
      });
    } else if (required.length === 0) {
      console.log('✅ No required fields configured - button should enable when agreement is checked');
    } else {
      console.log('✅ All required fields are filled');
    }
  }, [documentFields, fieldValues]);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  // Calculate fields for current page (useMemo to avoid recalculating)
  const fieldsForCurrentPage = React.useMemo(() => {
    const filtered = documentFields.filter(f => f.page === currentPage);
    console.log(`🔍 Filtering fields for page ${currentPage}:`, {
      totalFields: documentFields.length,
      fieldsOnThisPage: filtered.length,
      allFields: documentFields.map(f => ({ id: f.id, type: f.type, page: f.page, x: f.x, y: f.y }))
    });
    return filtered;
  }, [documentFields, currentPage]);

  // Calculate coordinate scaling based on wrapper width difference
  React.useEffect(() => {
    if (documentWrapperRef.current && documentFields.length > 0) {
      const wrapperRect = documentWrapperRef.current.getBoundingClientRect();
      const containerRect = documentContainerRef.current?.getBoundingClientRect();
      
      // Get the wrapper width from the first field (all fields should have same wrapperWidth)
      const savedWrapperWidth = documentFields[0]?.wrapperWidth;
      const currentWrapperWidth = wrapperRect.width;
      
      // Calculate scale factor
      let scale = 1;
      if (savedWrapperWidth && savedWrapperWidth > 0 && currentWrapperWidth > 0) {
        scale = currentWrapperWidth / savedWrapperWidth;
      }
      
      setCoordinateScale(scale);
      
      console.log('📐 Document wrapper dimensions and scaling:', {
        savedWrapperWidth,
        currentWrapperWidth,
        scale,
        wrapper: {
          width: wrapperRect.width,
          height: wrapperRect.height,
          left: wrapperRect.left,
          top: wrapperRect.top
        },
        container: containerRect ? {
          width: containerRect.width,
          height: containerRect.height,
          left: containerRect.left,
          top: containerRect.top
        } : null,
        firstField: documentFields[0] ? {
          originalX: documentFields[0].x,
          originalY: documentFields[0].y,
          scaledX: documentFields[0].x * scale,
          scaledY: documentFields[0].y * scale,
          page: documentFields[0].page
        } : null
      });
    }
  }, [documentFields, documentPreviewUrl]);
  
  // Debug: Log fields rendering - MUST be before any early returns
  useEffect(() => {
    console.log('📋 Fields rendering info:');
    console.log('  - Total document fields:', documentFields.length);
    console.log('  - Current page:', currentPage);
    console.log('  - Fields for current page:', fieldsForCurrentPage.length);
    console.log('  - Total pages:', totalPages);
    console.log('  - Document preview URL:', documentPreviewUrl ? 'Set' : 'Not set');
    if (documentFields.length > 0) {
      console.log('  - All fields:', documentFields.map(f => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        label: f.label
      })));
      console.log('  - Fields for current page:', fieldsForCurrentPage.map(f => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y
      })));
    } else {
      console.log('  ⚠️ NO FIELDS IN documentFields STATE!');
    }
  }, [documentFields, currentPage, fieldsForCurrentPage, totalPages, documentPreviewUrl]);

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const openSignaturePad = () => {
    setShowSignaturePad(true);
  };

  const clearSignature = () => {
    if (signatureCanvasRef.current) {
      const ctx = signatureCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, signatureCanvasRef.current.width, signatureCanvasRef.current.height);
      }
    }
    setSignatureData('');
  };

  const saveSignature = () => {
    if (signatureCanvasRef.current) {
      const dataUrl = signatureCanvasRef.current.toDataURL();
      setSignatureData(dataUrl);
      setShowSignaturePad(false);
      
      // Auto-fill signature fields
      documentFields.forEach(field => {
        if (field.type === 'signature' && !fieldValues[field.id]) {
          handleFieldChange(field.id, dataUrl);
        }
      });
    }
  };

  const initSignatureCanvas = () => {
    if (!signatureCanvasRef.current) return;
    
    const canvas = signatureCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 200;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      lastX = clientX - rect.left;
      lastY = clientY - rect.top;
    };

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      
      const currentX = clientX - rect.left;
      const currentY = clientY - rect.top;

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();

      lastX = currentX;
      lastY = currentY;
    };

    const stopDrawing = () => {
      isDrawing = false;
    };

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('touchstart', startDrawing);
    canvas.addEventListener('touchmove', draw);
    canvas.addEventListener('touchend', stopDrawing);
  };

  useEffect(() => {
    if (showSignaturePad) {
      initSignatureCanvas();
    }
  }, [showSignaturePad]);

  const handleStartSigning = async () => {
    console.log('🚀 handleStartSigning called');
    console.log('  - agreementAccepted:', agreementAccepted);
    console.log('  - isSigning:', isSigning);
    console.log('  - documentFields.length:', documentFields.length);
    console.log('  - fieldValues:', Object.keys(fieldValues).length, 'keys');
    
    setIsSigning(true);
    setError(null);

    try {
      // Collect signature from signature pad OR from fieldValues
      let finalSignatureImage = signatureData;
      if (!finalSignatureImage && fieldValues) {
        // Look for signature in fieldValues (signature fields have data:image URLs)
        const signatureField = documentFields.find(f => f.type === 'signature');
        if (signatureField && fieldValues[signatureField.id]) {
          const sigValue = fieldValues[signatureField.id];
          if (typeof sigValue === 'string' && sigValue.startsWith('data:image')) {
            finalSignatureImage = sigValue;
          }
        }
        // Also check all fieldValues for any data:image
        if (!finalSignatureImage) {
          const sigFromValues = Object.values(fieldValues).find(v => 
            typeof v === 'string' && v.startsWith('data:image')
          );
          if (sigFromValues) {
            finalSignatureImage = sigFromValues as string;
          }
        }
      }
      
      // Collect signer name from fields or use a default
      let finalSignerName = signerName;
      if (!finalSignerName && fieldValues) {
        // Look for name field in documentFields
        const nameField = documentFields.find(f => f.type === 'name');
        if (nameField && fieldValues[nameField.id]) {
          finalSignerName = fieldValues[nameField.id] as string;
        }
        // If still no name, try to find any non-image value
        if (!finalSignerName) {
          const nameFromValues = Object.values(fieldValues).find(v => 
            typeof v === 'string' && v && !v.startsWith('data:image') && v.trim().length > 0
          );
          if (nameFromValues) {
            finalSignerName = nameFromValues as string;
          }
        }
      }
      
      // If still no name, use a default
      if (!finalSignerName || finalSignerName.trim().length === 0) {
        finalSignerName = 'Signer';
      }
      
      // Collect email from fields
      const finalSignerEmail = signerEmail || (() => {
        const emailField = documentFields.find(f => f.type === 'email');
        if (emailField && fieldValues[emailField.id]) {
          return fieldValues[emailField.id] as string;
        }
        return '';
      })();

      // If no signature image found, create a default one from the signer's name
      if (!finalSignatureImage) {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 300, 100);
          ctx.fillStyle = '#1a1a2e';
          ctx.font = 'italic 28px Georgia, serif';
          ctx.fillText(finalSignerName, 10, 55);
          ctx.strokeStyle = '#1a1a2e';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(10, 70);
          ctx.lineTo(290, 70);
          ctx.stroke();
          finalSignatureImage = canvas.toDataURL('image/png');
          console.log('📝 Created default signature from name:', finalSignerName);
        }
      }

      console.log('📝 Submitting signature:', {
        hasSignature: !!finalSignatureImage,
        signatureLength: finalSignatureImage?.substring(0, 50) + '...',
        signerName: finalSignerName,
        signerEmail: finalSignerEmail,
        fieldValuesCount: Object.keys(fieldValues).length,
        documentFieldsCount: documentFields.length
      });

      // Submit signature
      const response = await fetch(`${BACKEND_URL}/api/approval-workflows/${workflowId}/signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signatureImage: finalSignatureImage,
          signedBy: finalSignerName,
          signerEmail: finalSignerEmail,
          fieldValues: fieldValues
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit signature');
      }

      // Success - show confirmation
      setSigningComplete(true);
      console.log('✅ Document signed successfully!');
    } catch (err: any) {
      console.error('Error submitting signature:', err);
      setError(err.message || 'Failed to submit signature');
    } finally {
      setIsSigning(false);
    }
  };

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'signature': return PenTool;
      case 'name': return User;
      case 'email': return Mail;
      case 'date': return Calendar;
      case 'textbox': return Type;
      case 'checkbox': return Square;
      case 'radio': return Circle;
      case 'company': return Building;
      case 'title': return FileText;
      default: return FileText;
    }
  };

  const renderFieldInput = (field: DocumentField) => {
    const value = fieldValues[field.id] || '';
    
    switch (field.type) {
      case 'signature':
        return (
          <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-gray-300 rounded bg-white cursor-pointer hover:border-indigo-500"
               onClick={openSignaturePad}>
            {value ? (
              <img src={value} alt="Signature" className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="text-center text-gray-400">
                <PenTool className="h-6 w-6 mx-auto mb-1" />
                <span className="text-xs">Click to sign</span>
              </div>
            )}
          </div>
        );
      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            className="w-full h-full border border-gray-300 rounded px-2 text-sm"
          />
        );
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => handleFieldChange(field.id, e.target.checked ? 'true' : '')}
            className="w-5 h-5"
          />
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(field.id, e.target.value)}
            placeholder={field.label || field.type}
            className="w-full h-full border border-gray-300 rounded px-2 text-sm"
          />
        );
    }
  };

  // Show loading state but keep the page structure visible
  if (isLoading && !workflow) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header - always visible */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <h1 className="text-lg font-semibold text-gray-900">Sign</h1>
                <span className="text-sm text-gray-600">{workflowId || 'Document'}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Loading content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading document...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show success screen after signing
  if (signingComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Document Signed!</h2>
          <p className="text-gray-600 mb-2">
            You have successfully signed <strong>{workflow?.documentId || 'the document'}</strong>.
          </p>
          <p className="text-sm text-gray-500">
            A confirmation will be sent to your email. You may close this window.
          </p>
        </div>
      </div>
    );
  }

  // Always render the page structure, even if loading or error
  return (
    <div className="min-h-screen bg-gray-100" style={{ paddingBottom: signingStarted ? 0 : '80px' }}>
      {/* Header - BoldSign style */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900 p-1">
                <X className="h-5 w-5" />
              </button>
              <div>
                <span className="text-sm font-semibold text-gray-900">Sign</span>
                <span className="text-sm text-gray-500 ml-2">{workflow?.documentId || 'Document'}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {signingStarted && requiredFieldsLeft > 0 && (
                <span className="text-sm text-orange-600 font-semibold">
                  Required fields left {requiredFieldsLeft}
                </span>
              )}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value="EN">EN</option>
                <option value="ES">ES</option>
                <option value="FR">FR</option>
              </select>
              <button className="text-gray-500 hover:text-gray-900">
                <ChevronDown className="h-4 w-4" />
              </button>
              {/* Start signing button — only enabled after agreement accepted */}
              <button
                onClick={handleStartSigning}
                disabled={isSigning || !signingStarted}
                className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  signingStarted
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isSigning ? 'Signing...' : 'Start signing'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Document Viewer - col-span-9 to give more space like BoldSign */}
          <div className="col-span-9">
            {error && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-3 border-b border-gray-100">
                <p className="text-xs text-gray-500">
                  {workflow?.documentId ? `Document ID: ${workflow.documentId}` : ''}
                </p>
              </div>

              <div
                ref={documentContainerRef}
                className="relative overflow-auto"
                style={{ maxHeight: 'calc(100vh - 140px)' }}
              >
                {isLoading && (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                  </div>
                )}
                {documentPreviewUrl && (
                  <div
                    ref={documentWrapperRef}
                    className="document-wrapper relative bg-white"
                    style={{ 
                      minHeight: `${totalPages * 1100}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    <iframe
                      src={`${documentPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                      title="Document"
                      className="w-full border-0 pointer-events-none"
                      style={{
                        height: `${totalPages * 1100}px`,
                        minHeight: `${totalPages * 1100}px`,
                        display: 'block',
                      }}
                    />
                    
                    {/* Render fields using correct coordinate system:
                        X: scaled by wrapper width ratio (containers differ in width)
                        Y: absolute pixels as-is (both components use 1100px/page — same scale) */}
                    {documentFields.map((field, index) => {
                      const currentWrapperWidth = documentWrapperRef.current?.getBoundingClientRect().width || 800;

                      let displayX: number;
                      let displayWidth: number;

                      if (field.xPercent !== undefined && field.wrapperWidth && field.wrapperWidth > 0) {
                        // Best: use stored xPercent × current width
                        displayX = field.xPercent * currentWrapperWidth;
                        displayWidth = (field.widthPercent ?? 0.15) * currentWrapperWidth;
                        
                        // Debug first field
                        if (index === 0) {
                          console.log('🎯 Field positioning (xPercent method):', {
                            fieldId: field.id,
                            originalX: field.x,
                            originalWrapperWidth: field.wrapperWidth,
                            xPercent: field.xPercent,
                            currentWrapperWidth,
                            displayX,
                            scale: currentWrapperWidth / field.wrapperWidth
                          });
                        }
                      } else if (field.wrapperWidth && field.wrapperWidth > 0) {
                        // Fallback: scale X by width ratio
                        const xScale = currentWrapperWidth / field.wrapperWidth;
                        displayX = field.x * xScale;
                        displayWidth = field.width * xScale;
                        
                        // Debug first field
                        if (index === 0) {
                          console.log('🎯 Field positioning (scale method):', {
                            fieldId: field.id,
                            originalX: field.x,
                            originalWrapperWidth: field.wrapperWidth,
                            currentWrapperWidth,
                            xScale,
                            displayX
                          });
                        }
                      } else {
                        // Last resort: use raw X
                        displayX = field.x;
                        displayWidth = field.width;
                        
                        if (index === 0) {
                          console.log('⚠️ Field positioning (raw method - no scaling):', {
                            fieldId: field.id,
                            displayX: field.x,
                            displayY: field.y
                          });
                        }
                      }

                      // Y is ALWAYS absolute — no scaling needed
                      const displayY = field.y;
                      const displayHeight = field.height;
                      
                      return (
                        <div
                          key={field.id}
                          className={`absolute z-10 rounded ${
                            signingStarted
                              ? 'border-2 border-blue-500 bg-blue-50/80 cursor-pointer hover:bg-blue-100/80'
                              : 'border-2 border-dashed border-blue-400 bg-blue-50/50'
                          }`}
                          style={{
                            left: `${displayX}px`,
                            top: `${displayY}px`,
                            width: `${displayWidth}px`,
                            height: `${displayHeight}px`,
                          }}
                        >
                          {signingStarted
                            ? renderFieldInput(field)
                            : (
                              <div className="flex items-center justify-center h-full text-xs text-blue-600 font-medium pointer-events-none">
                                {field.label || field.type}
                              </div>
                            )
                          }
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - Thumbnails */}
          <div className="col-span-3">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sticky top-20">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Thumbnails</h3>
              <p className="text-xs text-gray-500 mb-3 truncate">
                {workflow?.documentId || 'Document'} ({totalPages} pages)
              </p>
              <div className="space-y-2">
                {Array.from({ length: totalPages }).map((_, idx) => (
                  <div
                    key={idx + 1}
                    onClick={() => {
                      setCurrentPage(idx + 1);
                      // Scroll to the page
                      if (documentContainerRef.current) {
                        documentContainerRef.current.scrollTo({ top: idx * 1100, behavior: 'smooth' });
                      }
                    }}
                    className={`p-2 border-2 rounded cursor-pointer ${
                      currentPage === idx + 1
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xs text-gray-600 mb-1 font-medium">Page {idx + 1}</div>
                    <div className="bg-gray-100 rounded h-16 flex items-center justify-center text-xs text-gray-400">
                      Preview {idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom bar — Agreement checkbox (BoldSign style) */}
      {!signingStarted && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-5 h-5 rounded accent-blue-600 cursor-pointer"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                I have read and agreed to the{' '}
                <a href="#" className="text-blue-600 underline hover:text-blue-800" onClick={(e) => e.preventDefault()}>
                  Electronic Signature Disclosure Terms
                </a>
              </span>
            </label>
            <div className="flex items-center gap-3 flex-shrink-0">
              {!agreementAccepted && (
                <span className="text-xs text-orange-600 font-medium">
                  ⚠️ Please accept the terms to continue
                </span>
              )}
              <button
                onClick={() => {
                  if (agreementAccepted) setSigningStarted(true);
                }}
                disabled={!agreementAccepted}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  agreementAccepted
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Draw Your Signature</h3>
            <canvas
              ref={signatureCanvasRef}
              className="w-full border-2 border-gray-300 rounded mb-4"
              style={{ height: '200px', touchAction: 'none' }}
            />
            <div className="flex gap-3">
              <button onClick={clearSignature} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Clear
              </button>
              <button onClick={saveSignature} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Save Signature
              </button>
              <button onClick={() => setShowSignaturePad(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicSigningPage;

