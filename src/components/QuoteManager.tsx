import React, { useState, useEffect } from 'react';
import { Quote } from '../types/pricing';
import { formatCurrency } from '../utils/pricing';
import { getEffectiveDurationMonths } from '../utils/configDuration';
import { 
  FileText, 
  Download, 
  Eye, 
  Trash2, 
  User,
  Building,
  Mail,
  DollarSign,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  Palette,
  PenTool,
  ThumbsUp,
  ThumbsDown,
  FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { mergeQuoteIntoTemplate, mergeQuoteWithSowTemplate, downloadMergedPDF, createTemplatePreviewHTML } from '../utils/pdfMerger';
import { createTemplateFromPdf } from '../utils/pdfToTemplate';
import { sanitizeEmailInput } from '../utils/emojiSanitizer';
import { documentServiceMongoDB, SavedDocument } from '../services/documentServiceMongoDB';
import { convertPdfToWord, downloadWordFile } from '../utils/pdfToWordConverter';


interface QuoteManagerProps {
  quotes: Quote[];
  onDeleteQuote?: (quoteId: string) => void;
  onUpdateQuoteStatus?: (quoteId: string, status: Quote['status']) => void;
  onUpdateQuote?: (quoteId: string, updates: Partial<Quote>) => void;
  templates?: any[];
  onEditInTemplateBuilder?: (template: any) => void;
}

// Helper function to convert number to word
const numberToWord = (num: number): string => {
  const words = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'
  ];
  
  if (num <= 20) {
    return words[num];
  } else if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    const tensWords = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    return ones === 0 ? tensWords[tens] : `${tensWords[tens]}-${words[ones]}`;
  } else {
    return num.toString();
  }
};

const QuoteManager: React.FC<QuoteManagerProps> = ({ 
  quotes, 
  onDeleteQuote, 
  onUpdateQuoteStatus,
  onUpdateQuote,
  templates = [],
  onEditInTemplateBuilder
}) => {
  // Debug template data on component mount and handle template updates
  useEffect(() => {
    console.log('🔍 QuoteManager mounted with templates:', {
      templatesCount: templates.length,
      templates: templates,
      quotesCount: quotes.length
    });
    
    // Update the last updated timestamp when templates change
    setTemplatesLastUpdated(new Date());
    console.log('📋 Templates updated in QuoteManager:', templates.length, 'templates available');
    
    // Show sync notification briefly
    setShowTemplateSyncNotification(true);
    setTimeout(() => setShowTemplateSyncNotification(false), 3000);
    
    // Load saved documents
    loadSavedDocuments();
  }, [templates, quotes]);
  
  // Load saved documents from MongoDB
  const loadSavedDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const docs = await documentServiceMongoDB.getAllDocuments();
      setSavedDocuments(docs);
      console.log('✅ Loaded saved documents from MongoDB:', docs.length);
    } catch (error) {
      console.error('❌ Error loading documents from MongoDB:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };
  
  // View a saved document
  const handleViewDocument = async (doc: SavedDocument) => {
    try {
      // Fetch full document with fileData if not already present
      let documentToView = doc;
      if (!doc.fileData) {
        const fullDoc = await documentServiceMongoDB.getDocument(doc.id);
        if (!fullDoc || !fullDoc.fileData) {
          alert('Unable to load document. File data not available.');
          return;
        }
        documentToView = fullDoc;
      }
      
      const blob = documentServiceMongoDB.base64ToBlob(documentToView.fileData);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error('❌ Error viewing document:', error);
      alert('Error loading document. Please try again.');
    }
  };
  
  // Download a saved document
  const handleDownloadDocument = async (doc: SavedDocument) => {
    try {
      // Fetch full document with fileData if not already present
      let documentToDownload = doc;
      if (!doc.fileData) {
        const fullDoc = await documentServiceMongoDB.getDocument(doc.id);
        if (!fullDoc || !fullDoc.fileData) {
          alert('Unable to download document. File data not available.');
          return;
        }
        documentToDownload = fullDoc;
      }
      
      const blob = documentServiceMongoDB.base64ToBlob(documentToDownload.fileData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentToDownload.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('❌ Error downloading document:', error);
      alert('Error downloading document. Please try again.');
    }
  };
  
  // Download a saved document as Word format
  const handleDownloadWordDocument = async (doc: SavedDocument) => {
    try {
      // Fetch full document with fileData if not already present
      let documentToDownload = doc;
      if (!doc.fileData) {
        const fullDoc = await documentServiceMongoDB.getDocument(doc.id);
        if (!fullDoc || !fullDoc.fileData) {
          alert('Unable to download document. File data not available.');
          return;
        }
        documentToDownload = fullDoc;
      }
      
      // Check if we have stored DOCX file (preferred - original quality)
      if (documentToDownload.docxFileData && documentToDownload.docxFileName) {
        console.log('📥 Using stored DOCX file for download...');
        const docxBlob = documentServiceMongoDB.base64ToBlob(
          documentToDownload.docxFileData,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
        
        // Create download link for DOCX
        const url = URL.createObjectURL(docxBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = documentToDownload.docxFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('✅ Word document downloaded successfully (original DOCX)');
        return;
      }
      
      // Fallback: Convert PDF to Word format (for older documents without DOCX)
      console.log('⚠️ No stored DOCX found, converting PDF to Word format...');
      
      try {
        const pdfBlob = documentServiceMongoDB.base64ToBlob(documentToDownload.fileData);
        
        // Create a File object from the blob for conversion
        const pdfFile = new File([pdfBlob], documentToDownload.fileName || 'document.pdf', {
          type: 'application/pdf'
        });
        
        // Convert PDF to Word format
        console.log('🔄 Converting PDF to Word format...');
        const wordFile = await convertPdfToWord(pdfFile);
        
        // Check if conversion produced a meaningful file (not just error message)
        if (wordFile.size < 1000) {
          // File is too small, likely just error message
          throw new Error('PDF to Word conversion produced an empty file. The PDF may contain only images or the conversion service is unavailable.');
        }
        
        // Generate filename with .docx extension
        const clientName = (documentToDownload.clientName || 'client').replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr = new Date(documentToDownload.generatedDate).toISOString().split('T')[0];
        const wordFileName = documentToDownload.fileName 
          ? documentToDownload.fileName.replace(/\.pdf$/i, '.docx').replace(/\.(rtf|doc)$/i, '.docx')
          : `${clientName}_${dateStr}.docx`;
        
        // Download the Word file
        downloadWordFile(wordFile, wordFileName);
        console.log('✅ Word document downloaded successfully (converted from PDF)');
      } catch (conversionError: any) {
        console.error('❌ PDF to Word conversion failed:', conversionError);
        alert(
          'Unable to convert PDF to Word format.\n\n' +
          'This document was saved before Word format support was added.\n\n' +
          'Options:\n' +
          '1. Download the PDF version instead\n' +
          '2. Generate a new document from the Quote page (new documents include Word format)\n\n' +
          'Error: ' + (conversionError?.message || 'Unknown error')
        );
        throw conversionError;
      }
    } catch (error) {
      console.error('❌ Error downloading Word document:', error);
      alert('Error downloading Word document. Please try again.');
    }
  };
  
  // Delete a saved document from MongoDB
  const handleDeleteDocument = async (docId: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      try {
        await documentServiceMongoDB.deleteDocument(docId);
        await loadSavedDocuments();
        alert('Document deleted successfully from MongoDB');
      } catch (error) {
        console.error('❌ Error deleting document from MongoDB:', error);
        alert('Error deleting document');
      }
    }
  };
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [templatesLastUpdated, setTemplatesLastUpdated] = useState<Date>(new Date());
  const [showTemplateSyncNotification, setShowTemplateSyncNotification] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    message: ''
  });
  const [signatureData, setSignatureData] = useState<{[key: string]: any}>({});
  const [loadingSignatures, setLoadingSignatures] = useState<{[key: string]: boolean}>({});
  const [templatePreviewHTML, setTemplatePreviewHTML] = useState<string>('');
  const [isLoadingTemplatePreview, setIsLoadingTemplatePreview] = useState<boolean>(false);
  const [mergingQuote, setMergingQuote] = useState<string | null>(null);

  const [showMergePreviewModal, setShowMergePreviewModal] = useState<string | null>(null);
  const [mergePreviewPdfBlob, setMergePreviewPdfBlob] = useState<Blob | null>(null);
  const [mergePreviewFileName, setMergePreviewFileName] = useState<string>('');
  const [showPdfViewer, setShowPdfViewer] = useState<boolean>(false);
  
  // Saved documents state
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const getStatusColor = (status: Quote['status']) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'sent':
        return 'bg-blue-100 text-blue-700';
      case 'viewed':
        return 'bg-yellow-100 text-yellow-700';
      case 'accepted':
        return 'bg-green-100 text-green-700';
      case 'rejected':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: Quote['status']) => {
    switch (status) {
      case 'draft':
        return <Clock className="w-4 h-4" />;
      case 'sent':
        return <Send className="w-4 h-4" />;
      case 'viewed':
        return <Eye className="w-4 h-4" />;
      case 'accepted':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const fetchSignatureData = async (quoteId: string) => {
    if (signatureData[quoteId] || loadingSignatures[quoteId]) return;
    
    setLoadingSignatures(prev => ({ ...prev, [quoteId]: true }));
    
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/signature/forms-by-quote/${quoteId}`);
      if (response.ok) {
        const data = await response.json();
        setSignatureData(prev => ({ ...prev, [quoteId]: data.forms }));
      } else {
        setSignatureData(prev => ({ ...prev, [quoteId]: [] }));
      }
    } catch (error) {
      console.error('Error fetching signature data:', error);
      setSignatureData(prev => ({ ...prev, [quoteId]: [] }));
    } finally {
      setLoadingSignatures(prev => ({ ...prev, [quoteId]: false }));
    }
  };

  const getSignatureStatus = (quoteId: string) => {
    const forms = signatureData[quoteId] || [];
    if (forms.length === 0) return { signed: false, approved: false, status: 'No signature form' };
    
    const latestForm = forms[forms.length - 1];
    return {
      signed: !!latestForm.signature_data,
      approved: latestForm.approval_status === 'approved',
      status: latestForm.approval_status || 'pending',
      formId: latestForm.form_id
    };
  };





  const handleDownloadMergedPDF = () => {
    if (mergePreviewPdfBlob && mergePreviewFileName) {
      try {
        console.log('📥 Downloading merged PDF:', mergePreviewFileName);
        downloadMergedPDF(mergePreviewPdfBlob, mergePreviewFileName);
        
        // Show success message
        console.log('✅ Merged PDF downloaded successfully');
        
        // Show success notification
        setTimeout(() => {
          alert(`✅ Merged PDF downloaded successfully!\n\n📄 File: ${mergePreviewFileName}\n📏 Size: ${(mergePreviewPdfBlob.size / 1024).toFixed(1)} KB\n\nThe quote has been merged with your template and downloaded.`);
        }, 100);
        
        // Don't clear the PDF data - keep it available for future use
        // Don't close the modal - let user continue working with the preview
        
      } catch (error) {
        console.error('❌ Error downloading merged PDF:', error);
        alert('Error downloading PDF. Please try again.');
      }
    } else {
      console.error('❌ No merged PDF available for download');
      alert('No merged PDF available. Please try the merge process again.');
    }
  };

  const handleOpenPdfViewer = () => {
    if (mergePreviewPdfBlob) {
      console.log('🔍 Opening PDF viewer within application');
      setShowPdfViewer(true);
    } else {
      console.error('❌ No PDF blob available for viewing');
      alert('No PDF available to view. Please try the merge process again.');
    }
  };

  const handleEditInTemplateBuilder = async () => {
    console.log('🔄 Edit in Template Builder button clicked');
    console.log('📄 mergePreviewPdfBlob:', mergePreviewPdfBlob);
    console.log('📄 mergePreviewPdfBlob size:', mergePreviewPdfBlob?.size);
    console.log('📄 mergePreviewPdfBlob type:', mergePreviewPdfBlob?.type);
    console.log('📋 selectedQuote:', selectedQuote);
    console.log('📋 selectedQuote id:', selectedQuote?.id);
    console.log('📋 selectedQuote clientName:', selectedQuote?.clientName);
    
    if (!mergePreviewPdfBlob) {
      console.error('❌ No PDF blob available');
      alert('No PDF available to convert. Please try the merge process again.');
      return;
    }

    if (!selectedQuote) {
      console.error('❌ No selected quote available');
      alert('No quote selected. Please try the merge process again.');
      return;
    }

    try {
      console.log('🔄 Converting PDF to editable template...');
      
      // Create template from PDF
      const templateName = `Template from Quote - ${selectedQuote.clientName}`;
      console.log('📝 Template name:', templateName);
      
      const template = await createTemplateFromPdf(mergePreviewPdfBlob, templateName);
      
      console.log('✅ Template created:', template);
      console.log('✅ Template blocks count:', template.blocks?.length);
      
      // Call the callback to navigate to template builder
      if (onEditInTemplateBuilder) {
        console.log('🔄 Calling onEditInTemplateBuilder callback');
        onEditInTemplateBuilder(template);
      } else {
        console.error('❌ onEditInTemplateBuilder callback not provided');
        alert('Template Builder navigation not available. Please contact support.');
      }
      
      // Close the merge preview modal
      setShowMergePreviewModal(null);
      
    } catch (error) {
      console.error('❌ Error converting PDF to template:', error);
      alert('Error converting PDF to template. Please try again.');
    }
  };



  const handleMergeSubmit = async (quote: Quote, templateFile: File) => {
    console.log('🔄 Starting merge process...');
    setMergingQuote(quote.id);
    
    try {
      const quoteNumber = `CPQ-${quote.id.split('-')[1]}`;
      
      console.log('📄 Merging quote with template:', {
        quoteId: quote.id,
        quoteNumber: quoteNumber,
        templateName: templateFile.name,
        templateSize: templateFile.size
      });

      // Check if this is an SOW template (multi-page PDF) and use appropriate merge function
      let mergedPdfBlob;
      
      if (templateFile.name.toLowerCase().includes('sow') || templateFile.name.toLowerCase().includes('slacktoteams')) {
        // Use SOW template merge - replace specific page with quote content
        console.log('📄 Detected SOW template, using SOW merge function...');
        mergedPdfBlob = await mergeQuoteWithSowTemplate(templateFile, quote, quoteNumber, 0); // Replace first page
      } else {
        // Use regular template merge - preserve template structure
        console.log('📄 Using regular template merge function...');
        mergedPdfBlob = await mergeQuoteIntoTemplate(templateFile, quote, quoteNumber);
      }
      
      console.log('✅ Merge completed successfully');
      console.log('📄 Merged PDF size:', mergedPdfBlob.size, 'bytes');

      // Store the merged PDF for preview
      const fileName = `Quote-${quoteNumber}-${quote.clientName.replace(/\s+/g, '-')}.pdf`;
      setMergePreviewPdfBlob(mergedPdfBlob);
      setMergePreviewFileName(fileName);
      
      // Close merge modal and show preview modal
      // setShowMergeModal(null); // This variable doesn't exist, commenting out
      setMergingQuote(null);
      setShowMergePreviewModal(quote.id);
      
      console.log('📋 Showing merge preview modal');
      
    } catch (error) {
      console.error('❌ Error merging quote with template:', error);
      setMergingQuote(null);
      
      alert(`❌ Failed to merge quote with template:\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or contact support.`);
    }
  };

  const handleDeleteQuote = (quoteId: string) => {
    if (onDeleteQuote) {
      onDeleteQuote(quoteId);
    }
    setShowDeleteConfirm(null);
  };

  const handleUpdateStatus = (quoteId: string, newStatus: Quote['status']) => {
    if (onUpdateQuoteStatus) {
      onUpdateQuoteStatus(quoteId, newStatus);
    }
  };



  const getDefaultQuoteContent = (quote: Quote, quoteNumber: string) => {
    try {
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
      
      // Helper function to safely escape HTML characters
      const escapeHtml = (text: string) => {
        if (typeof text !== 'string') return String(text);
        return text.replace(/[<>&"']/g, function(match) {
          const escapeMap: { [key: string]: string } = {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;'};
          return escapeMap[match] || match;
        });
      };
      
      // Safely get values with fallbacks
      const clientName = escapeHtml(quote.clientName || 'N/A');
      const company = escapeHtml(quote.company || 'N/A');
      const clientEmail = escapeHtml(quote.clientEmail || 'N/A');
      const migrationType = escapeHtml(quote.configuration?.migrationType || 'N/A');
      const planName = escapeHtml(quote.selectedTier?.name || 'N/A');
      const numberOfUsers = Number(quote.configuration?.numberOfUsers) || 0;
      const dataSizeGB = Number(quote.configuration?.dataSizeGB) || 0;
      const instanceType = escapeHtml(quote.configuration?.instanceType || 'N/A');
      const numberOfInstances = Number(quote.configuration?.numberOfInstances) || 0;
      const duration = Number(quote.configuration?.duration) || 0;
    
    return `
      
      
      <!-- Agreement Title -->
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #1e40af; font-size: 24px; font-weight: bold; margin: 0;">CloudFuze Purchase Agreement for ${clientName}</h2>
      </div>
      
      <!-- Quote number and date -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Quote #${quoteNumber}</p>
        <p style="color: #6b7280; font-size: 14px; margin: 0;">Date: ${currentDate}</p>
      </div>

      <!-- Bill To and From sections -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div style="flex: 1;">
          <h3 style="color: #1e40af; margin-bottom: 10px;">Bill To:</h3>
          <p style="font-weight: bold; margin: 5px 0;">${clientName}</p>
          <p style="margin: 5px 0;">${company}</p>
          <p style="margin: 5px 0;">${clientEmail}</p>
        </div>
        <div style="flex: 1; text-align: right;">
          <h3 style="color: #1e40af; margin-bottom: 10px;">From:</h3>
          <p style="font-weight: bold; margin: 5px 0;">ZENOP Pro Solutions</p>
          <p style="margin: 5px 0;">123 Business Street</p>
          <p style="margin: 5px 0;">contact@cpqsolutions.com</p>
        </div>
      </div>

      <!-- Project Summary -->
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Project Summary</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <p style="margin: 5px 0;"><strong>Migration Type:</strong> ${migrationType}</p>
            <p style="margin: 5px 0;"><strong>Data Size:</strong> ${dataSizeGB} GB</p>
          </div>
          <div>
            <p style="margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
            <p style="margin: 5px 0;"><strong>Duration:</strong> ${duration} months</p>
            <p style="margin: 5px 0;"><strong>Users:</strong> ${numberOfUsers}</p>
            <p style="margin: 5px 0;"><strong>Total Cost:</strong> <span style="color: #1e40af; font-weight: bold;">${formatCurrency(quote.calculation.totalCost)}</span></p>
          </div>
        </div>
      </div>

      <!-- Services and Pricing Table -->
      <div style="background-color: #ffffff; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 20px;">
        <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Services and Pricing</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #6b7280; color: black;">
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Job Requirement</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Description</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280; font-weight: bold;">Migration Type</th>
              <th style="padding: 12px; text-align: right; border: 1px solid #6b7280; font-weight: bold;">Price(USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 500;">CloudFuze X-Change<br>Data Migration</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">
                ${migrationType} to Teams<br><br>
                Up to ${numberOfUsers} Users | All Channels and DMs
              </td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Managed Migration<br>One-Time</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${formatCurrency(quote.calculation.migrationCost)}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 500;">Managed Migration<br>Service</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">
                Fully Managed Migration | Dedicated Project Manager | Pre-Migration Analysis | During Migration Consulting | Post-Migration Support and Data Reconciliation Support | End-to End Migration Assistance with 24*7 Premium Support
              </td>
              <td style="padding: 12px; border: 1px solid #e5e7eb;">Managed Migration<br>One-Time</td>
              <td style="padding: 12px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${formatCurrency(quote.calculation.userCost + quote.calculation.dataCost + quote.calculation.instanceCost)}</td>
            </tr>
          </tbody>
        </table>
        <div style="text-align: right; margin-top: 15px;">
          <p style="margin: 5px 0; font-size: 12px; color: #6b7280;">Valid for ${(() => {
            const d = getEffectiveDurationMonths(quote.configuration) || 1;
            return `${numberToWord(d)} Month${d > 1 ? 's' : ''}`;
          })()}</p>
          <p style="margin: 5px 0; font-size: 16px; font-weight: bold; color: #1e40af;">
            Total Price: ${formatCurrency(quote.calculation.totalCost)}
          </p>
        </div>
      </div>

      <!-- Included Features -->
      <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
        <h3 style="color: #1e40af; font-weight: bold; margin-bottom: 15px;">Included Features</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          ${quote.selectedTier.features && Array.isArray(quote.selectedTier.features) ? 
            quote.selectedTier.features.map(feature => `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <span style="color: #10b981; font-weight: bold; margin-right: 8px;">✓</span>
                <span>${String(feature).replace(/[<>&"']/g, function(match) {
                  const escapeMap: { [key: string]: string } = {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;'};
                  return escapeMap[match] || match;
                })}</span>
            </div>
            `).join('') : '<p>No features available</p>'
          }
        </div>
      </div>

      <!-- Footer with CloudFuze Contact Information -->
      <div style="text-align: center; padding: 20px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
                        <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">CloudFuze, Inc.</p>
                <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">2500 Regency Parkway, Cary, NC 27518</p>
                <p style="color: #1e40af; font-size: 12px; margin: 5px 0;">https://www.cloudfuze.com/</p>
                <p style="color: #6b7280; font-size: 12px; margin: 5px 0;">Phone: +1 252-558-9019</p>
                <p style="color: #1e40af; font-size: 12px; margin: 5px 0;">Email: sales@cloudfuze.com</p>
                <p style="color: #1e40af; font-size: 12px; margin: 5px 0;">support@cloudfuze.com</p>
        <p style="color: #9ca3af; font-size: 12px; font-weight: 500; margin: 5px 0;">Classification: Confidential</p>
        <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">Page 1 of 1</p>
      </div>
    `;
    } catch (error) {
      console.error('❌ Error generating default quote content:', error);
      return `
        <div style="padding: 40px; text-align: center;">
          <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 20px;">Error Generating Quote</h1>
          <p style="color: #6b7280;">Unable to generate quote content. Please try again.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      `;
    }
  };

  // Generate professional quote preview HTML matching the QuoteGenerator format
  const generateProfessionalQuotePreview = async (quote: Quote): Promise<string> => {
    try {
      console.log('🎨 Generating professional quote preview for quote:', quote.id);
      
      // Helper function to format currency
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(amount);
      };

      // Get current date
      const currentDate = new Date().toLocaleDateString();
      const quoteNumber = quote.id || `Q-001`;

      // Generate the professional quote HTML matching the QuoteGenerator format
      const professionalQuoteHTML = `
        <div class="bg-gradient-to-br from-white via-slate-50/30 to-blue-50/20 p-10 border-2 border-blue-100 rounded-2xl shadow-2xl max-w-5xl mx-auto backdrop-blur-sm" style="min-height: 1000px; position: relative; font-size: 16px; line-height: 1.6;">
          <!-- Header -->
          <div class="flex justify-between items-start mb-10 pb-6 border-b-2 border-gradient-to-r from-blue-200 to-indigo-200">
            <div>
              <h1 class="text-5xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">
                PROFESSIONAL QUOTE
              </h1>
              <p class="text-gray-700 font-semibold text-lg">Quote #Q-${quoteNumber.split('-')[1]}</p>
              <p class="text-gray-600 font-medium">${currentDate}</p>
            </div>
            <div class="text-right">
              <div class="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-6 rounded-2xl shadow-lg">
                <h2 class="text-2xl font-bold mb-2">ZENOP Pro Solutions</h2>
                <p class="opacity-90">123 Business St.</p>
                <p class="opacity-90">City, State 12345</p>
                <p class="opacity-90">contact@cpqsolutions.com</p>
              </div>
            </div>
          </div>

          <!-- Client Info -->
          <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl mb-10 border border-blue-200">
            <h3 class="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
              Bill To:
            </h3>
            <div class="space-y-2">
              <p class="font-bold text-lg text-gray-900">${quote.clientName || 'Not specified'}</p>
              <p class="text-gray-700 font-semibold">${quote.company || 'Not specified'}</p>
              <p class="text-gray-600 font-medium">${quote.clientEmail || 'Not specified'}</p>
            </div>
          </div>

          <!-- Deal Information -->
          ${quote.dealData && (quote.dealData.dealId || quote.dealData.dealName) ? `
          <div class="bg-gradient-to-br from-purple-50 to-indigo-50 p-8 rounded-2xl mb-10 border border-purple-200">
            <h3 class="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
              </svg>
              Deal Information:
            </h3>
            <div class="grid grid-cols-2 gap-6">
              ${quote.dealData.dealId ? `
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Deal ID:</span>
                <span class="font-bold text-gray-900">${quote.dealData.dealId}</span>
              </div>
              ` : ''}
              ${quote.dealData.dealName ? `
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Deal Name:</span>
                <span class="font-bold text-gray-900">${quote.dealData.dealName}</span>
              </div>
              ` : ''}
            </div>
          </div>
          ` : ''}

          <!-- Project Details -->
          <div class="mb-10">
            <h3 class="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              Project Configuration:
            </h3>
            <div class="grid grid-cols-2 gap-6">
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Number of Users:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.numberOfUsers || 'Not specified'}</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Instance Type:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.instanceType || 'Not specified'}</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Number of Instances:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.numberOfInstances || 'Not specified'}</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Duration:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.duration || 'Not specified'} months</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Migration Type:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.migrationType || 'Not specified'}</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Data Size:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.dataSizeGB || 'Not specified'} GB</span>
              </div>
              <div class="flex justify-between items-center bg-white/60 p-4 rounded-xl">
                <span class="text-gray-700 font-semibold">Messages:</span>
                <span class="font-bold text-gray-900">${quote.configuration?.messages || '0'}</span>
              </div>
            </div>
          </div>

          <!-- Pricing Breakdown -->
          <div class="mb-10">
            <h3 class="font-bold text-gray-900 mb-6 text-xl flex items-center gap-2">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>
              </svg>
              Pricing Breakdown - ${quote.selectedTier?.name || 'Standard'} Plan:
            </h3>
            <div class="bg-white/80 rounded-2xl p-6 shadow-lg">
              <table class="w-full">
                <thead>
                  <tr class="border-b-2 border-blue-200">
                    <th class="text-left py-4 text-gray-800 font-bold text-lg">Description</th>
                    <th class="text-right py-4 text-gray-800 font-bold text-lg">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-gray-200">
                    <td class="py-4 text-gray-700 font-medium">
                      User costs (${quote.configuration?.numberOfUsers || 0} users × ${quote.configuration?.duration || 0} months)
                      <br />
                      <span class="text-sm text-gray-500 font-normal">
                        @ ${formatCurrency((quote.calculation?.userCost || 0) / ((quote.configuration?.numberOfUsers || 1) * (quote.configuration?.duration || 1)))}/user/month
                      </span>
                    </td>
                    <td class="text-right py-4 font-bold text-gray-900">${formatCurrency(quote.calculation?.userCost || 0)}</td>
                  </tr>
                  <tr class="border-b border-gray-200">
                    <td class="py-4 text-gray-700 font-medium">Data costs (${quote.configuration?.dataSizeGB || 0} GB)</td>
                    <td class="text-right py-4 font-bold text-gray-900">${formatCurrency(quote.calculation?.dataCost || 0)}</td>
                  </tr>
                  <tr class="border-b border-gray-200">
                    <td class="py-4 text-gray-700 font-medium">Migration services</td>
                    <td class="text-right py-4 font-bold text-gray-900">${formatCurrency(quote.calculation?.migrationCost || 0)}</td>
                  </tr>
                  <tr class="border-b border-gray-200">
                    <td class="py-4 text-gray-700 font-medium">Instance costs (${quote.configuration?.numberOfInstances || 0} instances)</td>
                    <td class="text-right py-4 font-bold text-gray-900">${formatCurrency(quote.calculation?.instanceCost || 0)}</td>
                  </tr>
                  <tr class="border-t-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <td class="py-6 font-bold text-xl text-gray-900">Total Project Cost</td>
                    <td class="text-right py-6 font-bold text-2xl text-blue-600">${formatCurrency(quote.calculation?.totalCost || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      `;

      console.log('✅ Professional quote preview HTML generated successfully');
      return professionalQuoteHTML;
    } catch (error) {
      console.error('❌ Error generating professional quote preview:', error);
      return `
        <div class="bg-white p-8 rounded-xl shadow-lg text-center">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error Generating Preview</h2>
          <p class="text-gray-600">Unable to generate quote preview. Please try again.</p>
        </div>
      `;
    }
  };

  const handlePreviewQuote = async (quote: Quote) => {
    console.log('🔍 Preview button clicked for quote:', quote.id);
    console.log('📋 Quote data:', quote);
    console.log('🔍 Quote dealData:', quote.dealData);
    
    setSelectedQuote(quote);
    setIsLoadingTemplatePreview(true);
    setTemplatePreviewHTML(''); // Clear previous preview
    
    try {
      // Find the template used for this quote
      let template = null;
      console.log('🔍 Looking for template for quote:', quote.id);
      console.log('🔍 Quote templateUsed:', quote.templateUsed);
      console.log('🔍 Available templates:', templates);
      
      if (quote.templateUsed && quote.templateUsed.id !== 'default') {
        template = templates.find(t => t.id === quote.templateUsed?.id);
        console.log('📄 Found template:', template);
        if (template) {
          console.log('📄 Template content preview:', template.content?.substring(0, 200) + '...');
        }
      } else {
        console.log('📄 Using default template (no templateUsed or default template)');
        // Try to find any available template
        if (templates.length > 0) {
          template = templates[0];
          console.log('📄 Using first available template:', template.name);
        }
      }
      
      console.log('🔄 Generating template preview HTML...');
      console.log('🔄 Template being used:', template);
      
      // Generate professional quote preview HTML using the same format as QuoteGenerator
      const previewHTML = await generateProfessionalQuotePreview(quote);
      console.log('✅ Professional quote preview HTML generated successfully');
      console.log('📏 HTML length:', previewHTML.length);
      console.log('📄 Preview HTML preview:', previewHTML.substring(0, 300) + '...');
      
      setTemplatePreviewHTML(previewHTML);
    } catch (error) {
      console.error('❌ Error generating template preview:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : 'Unknown error');
      
      // Enhanced fallback preview with better styling
      const fallbackHTML = `
        <div class="template-preview bg-white border-2 border-gray-200 rounded-xl p-8 shadow-lg" style="min-height: 600px;">
          <div class="text-center mb-8">
            <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
            </div>
            <h2 class="text-3xl font-bold text-gray-800 mb-2">Quote Preview</h2>
            <p class="text-gray-600 text-lg">Quote #CPQ-${quote.id.split('-')[1]}</p>
            <p class="text-gray-500">Generated on ${new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-200">
              <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                Client Information
              </h3>
              <div class="space-y-2">
                <p><strong>Name:</strong> ${quote.clientName || 'Not specified'}</p>
                <p><strong>Company:</strong> ${quote.company || 'Not specified'}</p>
                <p><strong>Email:</strong> ${quote.clientEmail || 'Not specified'}</p>
              </div>
            </div>
            
                         ${quote.dealData ? `
            <div class="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
              <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
                Deal Information
              </h3>
              <div class="space-y-2">
               ${quote.dealData.dealId ? `<p><strong>Deal ID:</strong> ${quote.dealData.dealId}</p>` : ''}
               ${quote.dealData.dealName ? `<p><strong>Deal Name:</strong> ${quote.dealData.dealName}</p>` : ''}
                ${quote.dealData.amount ? `<p><strong>Deal Amount:</strong> ${quote.dealData.amount}</p>` : ''}
                ${quote.dealData.stage ? `<p><strong>Stage:</strong> ${quote.dealData.stage}</p>` : ''}
              </div>
             </div>
             ` : ''}
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-200">
              <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                Project Details
              </h3>
              <div class="space-y-2">
                <p><strong>Plan:</strong> ${quote.selectedTier?.name || 'Not specified'}</p>
                <p><strong>Users:</strong> ${quote.configuration?.numberOfUsers || 'Not specified'}</p>
                <p><strong>Data Size:</strong> ${quote.configuration?.dataSizeGB || 'Not specified'} GB</p>
                <p><strong>Duration:</strong> ${quote.configuration?.duration || 'Not specified'} months</p>
                <p><strong>Migration Type:</strong> ${quote.configuration?.migrationType || 'Not specified'}</p>
              </div>
            </div>
            
            <div class="bg-gradient-to-br from-orange-50 to-red-50 p-6 rounded-xl border border-orange-200">
              <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg">
                <svg class="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                Cost Summary
              </h3>
              <div class="space-y-2">
                <p><strong>User Cost:</strong> $${quote.calculation?.userCost || 0}</p>
                <p><strong>Data Cost:</strong> $${quote.calculation?.dataCost || 0}</p>
                <p><strong>Migration Cost:</strong> $${quote.calculation?.migrationCost || 0}</p>
                <p><strong>Instance Cost:</strong> $${quote.calculation?.instanceCost || 0}</p>
                <hr class="my-3 border-orange-200">
                <p class="text-xl font-bold text-orange-700"><strong>Total Cost:</strong> $${quote.calculation?.totalCost || 0}</p>
              </div>
            </div>
          </div>
          
          <div class="mt-8 p-6 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border border-yellow-200">
            <div class="flex items-center gap-3 mb-3">
              <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h4 class="font-bold text-gray-800">Preview Information</h4>
            </div>
            <p class="text-sm text-gray-600">
              <strong>Note:</strong> This is a basic preview. The full template preview could not be generated.
              This may be due to template loading issues or missing template data. 
              Please ensure templates are properly loaded in the Templates section.
            </p>
          </div>
        </div>
      `;
      
      setTemplatePreviewHTML(fallbackHTML);
    } finally {
      setIsLoadingTemplatePreview(false);
      console.log('✅ Preview loading completed');
    }
  };





  const handleSendEmail = (quote: Quote) => {
    // Pre-fill email form with quote details
    const quoteNumber = `CPQ-${quote.id.split('-')[1]}`;
    setEmailForm({
      to: quote.clientEmail || '',
      subject: `Quote #${quoteNumber} - ${quote.clientName}`,
      message: `Dear ${quote.clientName},

Thank you for your interest in our services. Please find attached your quote #${quoteNumber} for ${quote.company}.

Quote Summary:
- Total Cost: ${formatCurrency(quote.calculation.totalCost)}
- Plan: ${quote.selectedTier.name}
- Duration: ${(getEffectiveDurationMonths(quote.configuration) || 1)} months

Please review the attached quote and let us know if you have any questions or would like to proceed.

Best regards,
ZENOP Pro Solutions Team`
    });
    setShowEmailModal(quote.id);
  };

  const handleEmailSubmit = async (quote: Quote) => {
    setSendingEmail(quote.id);
    
    try {
      // Step 1: Create Digital Signature Form
      console.log('📝 Creating digital signature form...');
      const quoteNumber = `CPQ-${quote.id.split('-')[1]}`;
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const formResponse = await fetch(`${backendUrl}/api/signature/create-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.id,
          clientEmail: emailForm.to,
          clientName: quote.clientName,
          quoteData: {
            totalCost: quote.calculation.totalCost,
            plan: quote.selectedTier.name,
            clientName: quote.clientName,
            company: quote.company,
            quoteNumber: quoteNumber
          }
        })
      });

      if (!formResponse.ok) {
        throw new Error('Failed to create signature form');
      }

      const formResult = await formResponse.json();
      const formId = formResult.formId;
      console.log('✅ Signature form created:', formId);

      // Step 2: Generate merged template PDF
      console.log('📧 Generating merged template PDF...');
      let pdfBlob: Blob;
      
      // Check if there's a selected template and try to use merged template
      if (quote.templateUsed && quote.templateUsed.id !== 'default') {
        console.log('📄 Attempting to use merged template approach...');
        
        try {
          // Prefer in-memory templates passed from App/TemplateManager
          let template: any | undefined;
          if (templates && templates.length > 0) {
            template = templates.find(t => t.id === quote.templateUsed?.id);
            console.log('📄 Using in-memory templates for email merge. Found:', !!template);
          }

          // Fallback 1: cpq_templates_cache_v2 (new cache format)
          if (!template) {
            try {
              const cachedRaw = localStorage.getItem('cpq_templates_cache_v2');
              if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (Array.isArray(cached.templates)) {
                  template = cached.templates.find((t: any) => t.id === quote.templateUsed?.id);
                  console.log('📄 Fallback to cpq_templates_cache_v2. Found:', !!template);
                }
              }
            } catch (cacheError) {
              console.warn('⚠️ Error reading cpq_templates_cache_v2 for email merge:', cacheError);
            }
          }

          // Fallback 2: legacy localStorage "templates" key
          if (!template) {
            try {
              const legacyTemplates = JSON.parse(localStorage.getItem('templates') || '[]');
              template = legacyTemplates.find((t: any) => t.id === quote.templateUsed?.id);
              console.log('📄 Fallback to legacy templates key. Found:', !!template);
            } catch (legacyError) {
              console.warn('⚠️ Error reading legacy templates cache for email merge:', legacyError);
            }
          }

          // At this point we expect template.file to be a base64 PDF or we have a loadFile function
          if (template && template.file) {
            console.log('📄 Template file found in cache, using merged template...');
            
            // Convert base64 to file
            const templateFile = new File(
              [Uint8Array.from(atob(template.file.split(',')[1]), c => c.charCodeAt(0))],
              template.name || 'template.pdf',
              { type: 'application/pdf' }
            );
            
            // Use the mergeQuoteIntoTemplate function
            const { mergeQuoteIntoTemplate } = await import('../utils/pdfMerger');
            pdfBlob = await mergeQuoteIntoTemplate(templateFile, quote, quoteNumber);
            
            console.log('📧 Merged template PDF generated successfully, size:', pdfBlob.size);
          } else if (template && typeof template.loadFile === 'function') {
            console.log('📄 No cached base64 file, using loadFile() from templateService for email merge...');
            const fileFromBackend = await template.loadFile();
            if (!fileFromBackend) {
              throw new Error('Template file could not be loaded from backend');
            }
            const { mergeQuoteIntoTemplate } = await import('../utils/pdfMerger');
            pdfBlob = await mergeQuoteIntoTemplate(fileFromBackend, quote, quoteNumber);
            console.log('📧 Merged template PDF generated successfully from backend file, size:', pdfBlob.size);
          } else {
            throw new Error('Template file not available');
          }
        } catch (error) {
          console.warn(
            '⚠️ Could not use merged template for email, falling back to default:',
            error instanceof Error ? error.message : 'Unknown error'
          );
          
          // Fall back to default quote generation
          const pdfContainer = document.createElement('div');
          pdfContainer.style.position = 'absolute';
          pdfContainer.style.left = '-9999px';
          pdfContainer.style.top = '0';
          pdfContainer.style.width = '600px';
          pdfContainer.style.backgroundColor = 'white';
          pdfContainer.style.padding = '20px';
          pdfContainer.style.fontFamily = 'Arial, sans-serif';
          pdfContainer.style.fontSize = '10px';
          pdfContainer.style.lineHeight = '1.2';
          
          const defaultContent = getDefaultQuoteContent(quote, quoteNumber);
          pdfContainer.innerHTML = defaultContent;
          document.body.appendChild(pdfContainer);
          
          const canvas = await html2canvas(pdfContainer, { 
            scale: 1.0,
            useCORS: true, 
            allowTaint: true, 
            backgroundColor: '#ffffff',
            logging: false,
            removeContainer: true
          });
          
          document.body.removeChild(pdfContainer);
          const imgData = canvas.toDataURL('image/png', 0.6);
          const pdf = new jsPDF('p', 'mm', 'a4');
          const imgWidth = 210;
          const pageHeight = 295;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          let heightLeft = imgHeight;
          let position = 0;
          
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
          
          while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
          }
          
          pdfBlob = pdf.output('blob');
          console.log('📧 Default PDF generated successfully, size:', pdfBlob.size);
        }
      } else {
        // Use the default quote generation
        console.log('📄 Using default quote generation...');
        
        const pdfContainer = document.createElement('div');
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.top = '0';
        pdfContainer.style.width = '600px';
        pdfContainer.style.backgroundColor = 'white';
        pdfContainer.style.padding = '20px';
        pdfContainer.style.fontFamily = 'Arial, sans-serif';
        pdfContainer.style.fontSize = '10px';
        pdfContainer.style.lineHeight = '1.2';
        
        const defaultContent = getDefaultQuoteContent(quote, quoteNumber);
        pdfContainer.innerHTML = defaultContent;
        document.body.appendChild(pdfContainer);
        
        const canvas = await html2canvas(pdfContainer, { 
          scale: 1.0,
          useCORS: true, 
          allowTaint: true, 
          backgroundColor: '#ffffff',
          logging: false,
          removeContainer: true
        });
        
        document.body.removeChild(pdfContainer);
        const imgData = canvas.toDataURL('image/png', 0.6);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const pageHeight = 295;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        pdfBlob = pdf.output('blob');
        console.log('📧 PDF generated successfully, size:', pdfBlob.size);
      }
      
      // Step 3: Create FormData for email with PDF and signature form link
      const formData = new FormData();
      formData.append('to', emailForm.to);
      formData.append('subject', emailForm.subject);
      
      // Enhanced email message with signature form link
              const signatureFormLink = `${window.location.origin}/client-signature-form.html?formId=${formId}`;
      const enhancedMessage = `${emailForm.message}

📝 DIGITAL SIGNATURE REQUIRED
To approve this quote, please click the link below to access our secure digital signature form:
${signatureFormLink}

The signature form will allow you to:
• Review the complete quote details
• Provide your digital signature
• Approve or reject the quote
• Add any comments or feedback

This form will expire in 7 days for security purposes.

Best regards,
ZENOP Pro Solutions Team`;

      formData.append('message', enhancedMessage);
      
      const pdfFile = new File([pdfBlob], `Quote_${quoteNumber}.pdf`, { type: 'application/pdf' });
      formData.append('attachment', pdfFile);
      
      console.log('📧 Sending email with PDF and signature form link...');
      
      // Send email with PDF and signature form link
      const response = await fetch(`${backendUrl}/api/email/send`, {
        method: 'POST',
        body: formData
      });
      
      console.log('📧 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error response:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('📧 Server response:', result);
      
      if (result.success) {
        // Update quote status to 'sent'
        if (onUpdateQuoteStatus) {
          onUpdateQuoteStatus(quote.id, 'sent');
        }
        
        setShowEmailModal(null);
        setEmailForm({ to: '', subject: '', message: '' });
        
        // Show success message with signature form info
        alert(`✅ Email sent successfully with PDF attachment and digital signature form!

📧 Message ID: ${result.messageId}
📝 Signature Form ID: ${formId}
🔗 Form Link: ${signatureFormLink}

The client will receive an email with the PDF quote and a link to complete the digital signature process.`);
        
    } else {
        throw new Error(result.message || 'Failed to send email');
      }
      
    } catch (error) {
      console.error('❌ Error sending email:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Failed to fetch')) {
        alert('❌ Cannot connect to email server. Please check if the backend is running.');
      } else if (errorMessage.includes('Server error:')) {
        alert(`❌ Server error: ${errorMessage}`);
    } else {
        alert(`❌ Error sending email: ${errorMessage}`);
      }
    } finally {
      setSendingEmail(null);
    }
  };





  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDownloadQuotePreview = async () => {
    if (!selectedQuote) {
      alert('No quote selected for download.');
      return;
    }

    try {
      console.log('📥 Generating quote preview PDF for download...');
      
      // Find the template used for this quote
      let template = null;
      if (selectedQuote.templateUsed && selectedQuote.templateUsed.id !== 'default') {
        template = templates.find(t => t.id === selectedQuote.templateUsed?.id);
        console.log('📄 Found template for download:', template);
      } else {
        console.log('📄 Using default template for download');
      }
      
      // Generate the same HTML that's used in the preview
      const previewHTML = await createTemplatePreviewHTML(selectedQuote, template);
      
      // Convert HTML to PDF using html2canvas and jsPDF
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = previewHTML;
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '800px'; // Set a fixed width for consistent rendering
      document.body.appendChild(tempDiv);
      
      // Wait for any images or fonts to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Convert to canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2, // Higher quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 800,
        height: tempDiv.scrollHeight
      });
      
      // Remove the temporary div
      document.body.removeChild(tempDiv);
      
      // Convert canvas to PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 295; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      // Add additional pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      // Generate filename
      const quoteNumber = `CPQ-${selectedQuote.id.split('-')[1]}`;
      const fileName = `Quote-Preview-${quoteNumber}-${selectedQuote.clientName.replace(/\s+/g, '-')}.pdf`;
      
      // Download the PDF
      pdf.save(fileName);
      
      console.log('✅ Quote preview PDF downloaded successfully:', fileName);
      
      // Show success notification
      setTimeout(() => {
        alert(`✅ Quote preview downloaded successfully!\n\n📄 File: ${fileName}\n📏 The PDF matches exactly what you see in the preview.`);
      }, 100);
      
    } catch (error) {
      console.error('❌ Error generating quote preview PDF:', error);
      alert('Error generating quote preview PDF. Please try again.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Deal Documents Manager</h1>
        </div>
        <p className="text-gray-600">Here you can see all your created Deal Documents</p>
      </div>

      {/* Saved Documents Section */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <FileText className="w-7 h-7 text-blue-600" />
          Saved Documents ({savedDocuments.length})
        </h2>
        
          {loadingDocuments ? (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading documents...</p>
          </div>
        ) : savedDocuments.length === 0 ? (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              You don&apos;t have any saved deal documents yet. Generate an agreement from the Quote flow and it will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedDocuments.map((doc) => (
              <div key={doc.id} className="bg-white rounded-xl shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{doc.company}</h3>
                      <p className="text-xs text-gray-500">{new Date(doc.generatedDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{doc.clientName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 truncate">{doc.clientEmail}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">{doc.templateName}</span>
                  </div>
                  {doc.metadata?.totalCost && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700 font-semibold">{formatCurrency(doc.metadata.totalCost)}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex flex-wrap gap-2 items-stretch">
                  <button
                    onClick={() => handleViewDocument(doc)}
                    className="flex-1 min-w-[80px] px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4 flex-shrink-0" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={() => handleDownloadDocument(doc)}
                    className="flex-1 min-w-[80px] px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4 flex-shrink-0" />
                    <span>PDF</span>
                  </button>
                  {/* Only show Word download button if DOCX data is available */}
                  {(doc.docxFileData || doc.docxFileName) && (
                    <button
                      onClick={() => handleDownloadWordDocument(doc)}
                      className="flex-1 min-w-[80px] px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                      title="Download as Word document (.docx)"
                    >
                      <FileDown className="w-4 h-4 flex-shrink-0" />
                      <span>Word</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteDocument(doc.id)}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center flex-shrink-0"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quotes Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
          <FileText className="w-7 h-7 text-green-600" />
          Quotes ({quotes.length})
        </h2>
      </div>

      {/* Documents List */}
      <div className="space-y-6">
        {quotes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-12 h-12 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No quotes yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first quote to see it listed on this page.
            </p>
          </div>
        ) : (
          quotes.map((quote) => (
            <div
              key={quote.id}
              className="bg-white rounded-xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {/* Quote Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg">
                      Quote #{quote.id.split('-')[1]}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {quote.createdAt.toLocaleDateString()} at {quote.createdAt.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(quote.status)}`}>
                    {getStatusIcon(quote.status)}
                    {quote.status.charAt(0).toUpperCase() + quote.status.slice(1)}
                  </span>
                  <button
                    onClick={() => setShowDeleteConfirm(quote.id)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Quote Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{quote.clientName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{quote.clientEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{quote.company}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-800">
                    {formatCurrency(quote.calculation.totalCost)}
                  </span>
                </div>
              </div>

              {/* Project Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">Project Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Users:</span>
                    <span className="font-medium ml-1">{quote.configuration.numberOfUsers}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Data:</span>
                    <span className="font-medium ml-1">{quote.configuration.dataSizeGB} GB</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Plan:</span>
                    <span className="font-medium ml-1">{quote.selectedTier.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium ml-1">{(getEffectiveDurationMonths(quote.configuration) || 1)} months</span>
                  </div>
                </div>
                
                {/* Template Information */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-purple-500" />
                    <span className="text-sm text-gray-600">Template:</span>
                    {quote.templateUsed ? (
                      <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                        quote.templateUsed.isDefault 
                          ? 'bg-gray-100 text-gray-700' 
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {quote.templateUsed.name}
                      </span>
                    ) : (
                      <span className="text-sm font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                        Default Template
                      </span>
                    )}
                  </div>
                  {/* Template debug info removed for cleaner UI */}
                </div>

                {/* Signature and Approval Status */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PenTool className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-600">Client Status:</span>
                    </div>
                    <button
                      onClick={() => fetchSignatureData(quote.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {loadingSignatures[quote.id] ? 'Loading...' : 'Check Status'}
                    </button>
                  </div>
                  
                  {(() => {
                    const signatureStatus = getSignatureStatus(quote.id);
                    return (
                      <div className="mt-2 flex items-center gap-3">
                        {/* Signature Status */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Signed:</span>
                          {signatureStatus.signed ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="w-3 h-3" />
                              <span className="text-xs font-medium">Yes</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-400">
                              <Clock className="w-3 h-3" />
                              <span className="text-xs">No</span>
                            </div>
                          )}
                        </div>

                        {/* Approval Status */}
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Approved:</span>
                          {signatureStatus.approved ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <ThumbsUp className="w-3 h-3" />
                              <span className="text-xs font-medium">Yes</span>
                            </div>
                          ) : signatureStatus.status === 'rejected' ? (
                            <div className="flex items-center gap-1 text-red-600">
                              <ThumbsDown className="w-3 h-3" />
                              <span className="text-xs font-medium">No</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Clock className="w-3 h-3" />
                              <span className="text-xs font-medium capitalize">{signatureStatus.status}</span>
                            </div>
                          )}
                        </div>

                        {/* Form Link */}
                        {signatureStatus.formId && (
                          <a
                            href={`/client-signature-form.html?formId=${signatureStatus.formId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors underline"
                          >
                            View Form
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Quote Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handlePreviewQuote(quote)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>
                

                
                <button
                  onClick={() => handleSendEmail(quote)}
                  disabled={sendingEmail === quote.id}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {sendingEmail === quote.id ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Email
                    </>
                  )}
                </button>

              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Delete Quote</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this quote? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteQuote(showDeleteConfirm)}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Preview Modal */}
      {selectedQuote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
              <div>
              <h2 className="text-2xl font-bold text-gray-800">Quote Preview</h2>
                <p className="text-gray-600 mt-1">Quote #CPQ-{selectedQuote.id.split('-')[1]} - {selectedQuote.clientName}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadQuotePreview}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 font-semibold flex items-center gap-2 shadow-lg"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    setSelectedQuote(null);
                    setTemplatePreviewHTML('');
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close Preview"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoadingTemplatePreview ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Generating Preview</h3>
                    <p className="text-gray-600">Please wait while we generate your quote preview...</p>
                  </div>
                  </div>
              ) : templatePreviewHTML ? (
                <div 
                  className="template-preview-container bg-white border-2 border-gray-200 rounded-xl shadow-lg overflow-hidden"
                  style={{ 
                    minHeight: '600px',
                    maxHeight: 'none'
                  }}
                >
                  <div 
                    className="p-8"
                    dangerouslySetInnerHTML={{ __html: templatePreviewHTML }}
                  />
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Not Available</h3>
                  <p className="text-gray-600 mb-4">Unable to generate template preview for this quote.</p>
                  <button
                    onClick={() => handlePreviewQuote(selectedQuote)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Try Again
                  </button>
                </div>
              )}
              </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Send Quote Email</h2>
              <button
                onClick={() => setShowEmailModal(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
                  </div>
            
            <div className="space-y-6">
                  <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Email Address
                </label>
                <input
                  type="email"
                  value={emailForm.to}
                  onChange={(e) => {
                    const sanitized = sanitizeEmailInput(e.target.value);
                    setEmailForm({ ...emailForm, to: sanitized });
                  }}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="customer@example.com"
                />
                  </div>

                  <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Quote Subject"
                />
                  </div>
              
                  <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={emailForm.message}
                  onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                  rows={8}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                  placeholder="Email message..."
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Send className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-blue-800 mb-1">Direct Email Sending</h4>
                    <p className="text-sm text-blue-700">
                      This will send the email directly from your application with the quote attached as a PDF. 
                      The quote will be automatically generated using the selected template (if any) 
                      or the default template. No external email client needed!
                    </p>
                    {sendingEmail === showEmailModal && (
                      <div className="mt-3 p-3 bg-blue-100 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-800">
                          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm font-medium">Processing: Generating PDF and sending email...</span>
                  </div>
                        <p className="text-xs text-blue-600 mt-1">Please wait, this may take a few moments.</p>
                  </div>
                        )}
                  </div>
                  </div>
                </div>
              </div>

            <div className="flex gap-3 mt-8 pt-6 border-t border-gray-200">
                <button
                onClick={() => setShowEmailModal(null)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                onClick={() => {
                  const quote = quotes.find(q => q.id === showEmailModal);
                  if (quote) {
                    handleEmailSubmit(quote);
                  }
                }}
                disabled={sendingEmail === showEmailModal}
                className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                {sendingEmail === showEmailModal ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Generating PDF & Sending Email...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Email
                  </>
                )}
                </button>
            </div>
          </div>
        </div>
      )}





      {/* Merge Preview Modal */}
      {showMergePreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Merged Quote Preview</h2>
              <button
                onClick={() => {
                  setShowMergePreviewModal(null);
                  // Don't clear the PDF data - keep it available for future use
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              {mergingQuote === showMergePreviewModal ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Generating merged PDF...</p>
                    <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
                  </div>
                </div>
              ) : mergePreviewPdfBlob ? (
                <div className="template-preview-container">
                  {/* Success Message */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-3 h-3 text-white" />
                      </div>
                      <div>
                        <h4 className="font-medium text-green-800">Merged Quote Preview Generated Successfully!</h4>
                        <p className="text-sm text-green-700">Your quote has been merged with the template and is ready for download.</p>
                      </div>
                    </div>
                  </div>

                  {/* Quote Info */}
                  {(() => {
                    const quote = quotes.find(q => q.id === showMergePreviewModal);
                    if (quote) {
                      const quoteNumber = `CPQ-${quote.id.split('-')[1]}`;
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                          <h4 className="font-semibold text-blue-800 mb-2">Quote Information</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-blue-700">Quote Number:</span>
                              <span className="ml-2 text-blue-600">{quoteNumber}</span>
                            </div>
                            <div>
                              <span className="font-medium text-blue-700">Client:</span>
                              <span className="ml-2 text-blue-600">{quote.clientName}</span>
                            </div>
                            <div>
                              <span className="font-medium text-blue-700">Company:</span>
                              <span className="ml-2 text-blue-600">{quote.company}</span>
                            </div>
                            <div>
                              <span className="font-medium text-blue-700">Total Cost:</span>
                              <span className="ml-2 text-blue-600">{formatCurrency(quote.calculation.totalCost)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Download Section */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Download className="w-8 h-8 text-blue-600" />
                      </div>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">Download Merged PDF</h3>
                      <p className="text-gray-600">Click the button below to download the merged PDF with your quote merged into the template.</p>
                    </div>
                    
                    {/* PDF Preview Information */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                      <h4 className="font-semibold text-gray-800 mb-3">PDF Preview Contents:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="text-gray-700">Professional header with company branding</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-gray-700">Quote number and date</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <span className="text-gray-700">Client and company information</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                          <span className="text-gray-700">Project details and specifications</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span className="text-gray-700">Cost breakdown and total pricing</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                          <span className="text-gray-700">Professional footer</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-center gap-4 flex-wrap">
                      <button
                        onClick={handleDownloadMergedPDF}
                        className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-300 font-semibold flex items-center gap-2 shadow-lg"
                      >
                        <Download className="w-5 h-5" />
                        Download Merged PDF
                      </button>
                      
                      <button
                        onClick={handleOpenPdfViewer}
                        className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-300 font-semibold flex items-center gap-2"
                      >
                        <Eye className="w-5 h-5" />
                        Preview PDF
                      </button>

                      <button
                        onClick={handleEditInTemplateBuilder}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-300 font-semibold flex items-center gap-2"
                      >
                        <Palette className="w-5 h-5" />
                        Edit in Template Builder
                      </button>
                    </div>
                    
                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-500">
                        File size: {(mergePreviewPdfBlob.size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        This is a professional quote PDF ready for client review
                      </p>
                      <p className="text-xs text-blue-600 mt-1 font-medium">
                        💾 PDF data is preserved - you can preview and download multiple times
                      </p>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-800 mb-2">What's Next?</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Download the merged PDF to review the final quote</li>
                      <li>• Check that all information is correct</li>
                      <li>• Use "Merge with Template" to create the final version</li>
                      <li>• Send the quote to your client via email</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Not Available</h3>
                  <p className="text-gray-600">Unable to generate merged PDF for this quote. Please try again.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {showPdfViewer && mergePreviewPdfBlob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-6xl w-full mx-4 shadow-2xl max-h-[95vh] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">PDF Preview</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleDownloadMergedPDF()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-300 font-semibold flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={() => setShowPdfViewer(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="bg-gray-100 rounded-lg p-4 h-[80vh] overflow-hidden">
              <iframe
                src={URL.createObjectURL(mergePreviewPdfBlob)}
                className="w-full h-full rounded-lg border border-gray-300"
                title="PDF Preview"
              />
            </div>
            
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-600">
                File: {mergePreviewFileName} | Size: {(mergePreviewPdfBlob.size / 1024).toFixed(1)} KB
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Use the browser's built-in PDF controls to zoom, scroll, and navigate
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteManager;
