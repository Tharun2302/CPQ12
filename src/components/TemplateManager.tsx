import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload, 
  FileText, 
  Eye, 
  Download, 
  Plus, 
  CheckCircle,
  AlertCircle,
  X,
  FileText as WordIcon,
  Send
} from 'lucide-react';
import { convertPdfToWord, downloadWordFile, isPdfFile, testDocxLibrary } from '../utils/pdfToWordConverter';
import { extractTemplateContent } from '../utils/pdfMerger';
import { formatCurrency } from '../utils/pricing';
import { templateService } from '../utils/templateService';
import { sanitizeNameInput, sanitizeEmailInput } from '../utils/emojiSanitizer';
import { track } from '../analytics/clarity';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';

// Helper function to limit consecutive spaces to maximum 5
function limitConsecutiveSpaces(value: string, maxSpaces: number = 5): string {
  // Replace any sequence of more than maxSpaces spaces with exactly maxSpaces spaces
  const spaceRegex = new RegExp(`\\s{${maxSpaces + 1},}`, 'g');
  return value.replace(spaceRegex, ' '.repeat(maxSpaces));
}

// Helper function to sanitize Contact Name input (remove special characters and emojis)
function sanitizeContactName(value: string): string {
  // Remove special characters, emojis, and keep only letters, spaces, hyphens, apostrophes, and periods
  return value.replace(/[^a-zA-Z\s\-'\.]/g, '');
}

// Helper function to sanitize Contact Email input (remove emojis and special characters)
function sanitizeContactEmail(value: string): string {
  // Remove emojis and special characters, keep only valid email characters
  return value.replace(/[^\w@\.\-]/g, '');
}

// Helper function to sanitize Template Name input (remove numbers, emojis, and special characters)
function sanitizeTemplateName(value: string): string {
  // Remove numbers, emojis, and special characters, keep only letters, spaces, hyphens, apostrophes, and periods
  return value.replace(/[^a-zA-Z\s\-'\.]/g, '');
}

interface Template {
  id: string;
  name: string;
  description: string;
  file: File | null; // Original PDF file (can be null if lazy-loaded)
  wordFile?: File; // Converted Word file
  size: string;
  uploadDate: Date;
  isDefault: boolean;
  content?: string; // Extracted template content
  loadFile?: () => Promise<File | null>; // Lazy file loader from backend
  fileName?: string; // Backend filename
  fileType?: string; // Backend file type
  fileSize?: number; // Backend file size
}

interface TemplateManagerProps {
  onTemplateSelect?: (template: Template) => void;
  selectedTemplate?: Template | null;
  onTemplatesUpdate?: () => void;
  currentQuoteData?: any; // Current quote data for template processing
  templates?: Template[]; // Templates from App.tsx cache
  setTemplates?: (templates: Template[]) => void; // Update templates in App.tsx
}

const TemplateManager: React.FC<TemplateManagerProps> = ({ 
  onTemplateSelect, 
  selectedTemplate,
  onTemplatesUpdate,
  currentQuoteData,
  templates: externalTemplates,
  setTemplates: setExternalTemplates
}) => {
  // Use external templates from App.tsx if available, otherwise use local state
  const [localTemplates, setLocalTemplates] = useState<Template[]>([]);
  const templates = externalTemplates || localTemplates;
  const setTemplates = setExternalTemplates || setLocalTemplates;
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [selectionSuccess, setSelectionSuccess] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    template: Template;
    originalUrl: string;
    processedUrl: string;
    sampleQuote: any;
  } | null>(null);
  const [iframeLoadError, setIframeLoadError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [processedTemplates, setProcessedTemplates] = useState<{[key: string]: File}>({});
  const [convertedPdfCache, setConvertedPdfCache] = useState<{[key: string]: File}>({});  // Cache for DOCX→PDF conversions
  const [isPreConvertingTemplates, setIsPreConvertingTemplates] = useState(false);  // Background conversion status
  const [fileCache, setFileCache] = useState<{[key: string]: File}>({});  // Cache for loaded template files - INSTANT ACCESS! ⚡
  const [activeTab, setActiveTab] = useState<'templates' | 'upload'>('templates'); // UI tab state
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    file: null as File | null,
    wordFile: undefined as File | undefined
  });
  const navigate = useNavigate();
  const { createWorkflow } = useApprovalWorkflows();
  
  // Email functionality state
  const [showEmailModal, setShowEmailModal] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    message: '',
    clientName: ''
  });
  
  // Signature fields state
  const [signatureForm, setSignatureForm] = useState({
    eSignature: '',
    name: '',
    title: '',
    date: new Date().toISOString().split('T')[0] // Today's date as default
  });
  
  // Selected signature font style
  const [selectedFontStyle, setSelectedFontStyle] = useState(0); // Default to first font style
  
  // Template verification state
  const [isVerifyingTemplate, setIsVerifyingTemplate] = useState(false);
  
  // Signature font styles
  const signatureFonts = [
    { 
      name: 'Cursive', 
      fontFamily: '"Brush Script MT", cursive',
      fontSize: '18px',
      fontStyle: 'normal',
      fontWeight: 'normal'
    },
    { 
      name: 'Elegant', 
      fontFamily: '"Palatino", "Times New Roman", serif',
      fontSize: '16px',
      fontStyle: 'italic',
      fontWeight: 'normal'
    },
    { 
      name: 'Modern', 
      fontFamily: '"Arial", sans-serif',
      fontSize: '16px',
      fontStyle: 'normal',
      fontWeight: 'bold'
    },
    { 
      name: 'Classic', 
      fontFamily: '"Georgia", serif',
      fontSize: '16px',
      fontStyle: 'normal',
      fontWeight: 'normal'
    },
    { 
      name: 'Handwriting', 
      fontFamily: '"Comic Sans MS", cursive',
      fontSize: '16px',
      fontStyle: 'normal',
      fontWeight: 'normal'
    }
  ];

  // Load templates - use external cache if available, otherwise load from database
  useEffect(() => {
    const loadTemplates = async () => {
      // OPTIMIZATION: If templates are provided from App.tsx cache, use them!
      if (externalTemplates && externalTemplates.length > 0) {
        console.log('⚡ TemplateManager: Using cached templates from App.tsx:', externalTemplates.length);
        setIsLoading(false);
        return; // Skip database loading!
      }

      // Give App.tsx a moment to load from localStorage cache (only on initial mount)
      // After that, load from database if templates aren't available
      if (externalTemplates === undefined) {
        console.log('⏳ TemplateManager: Waiting briefly for App.tsx cache...');
        await new Promise(resolve => setTimeout(resolve, 150));
        // Check one more time - if App.tsx loaded, useEffect will re-run due to dependency
        // But for now, continue to load from DB to ensure templates show up
      }

      // Try localStorage cache v2 first (same format App.tsx uses) - FAST PATH!
      let templatesLoadedFromCache = false;
      try {
        const cacheStart = performance.now();
        const cachedRaw = localStorage.getItem('cpq_templates_cache_v2');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.timestamp && Array.isArray(cached?.templates) && cached.templates.length > 0) {
            const parseTime = performance.now() - cacheStart;
            console.log(`⚡ TemplateManager: Found templates in localStorage cache: ${cached.templates.length} (${parseTime.toFixed(2)}ms)`);
            
            // Recreate loadFile functions (same as App.tsx does)
            const createLoadFile = (templateId: string, fileName: string, fileType: string) => {
              return async () => {
                try {
                  const fr = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/templates/${templateId}/file`);
                  if (!fr.ok) return null;
                  const blob = await fr.blob();
                  return new File([blob], fileName || 'template.docx', {
                    type: fileType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  });
                } catch (err) {
                  console.error('❌ Error fetching template file:', err);
                  return null;
                }
              };
            };
            
            const restoredTemplates = cached.templates.map((t: any) => ({
              ...t,
              uploadDate: t.uploadDate ? new Date(t.uploadDate) : new Date(t.createdAt || Date.now()),
              content: null,
              file: null,
              loadFile: createLoadFile(t.id, t.fileName, t.fileType)
            }));
            
            const restoreTime = performance.now() - cacheStart;
            console.log(`✅ TemplateManager: Templates restored from localStorage: ${restoredTemplates.length} (${restoreTime.toFixed(2)}ms)`);
            setTemplates(restoredTemplates);
            templatesLoadedFromCache = true;
            setIsLoading(false);
            return; // Success! No need to hit API
          }
        }
      } catch (cacheError) {
        console.warn('⚠️ TemplateManager: Failed to load from localStorage cache:', cacheError);
      }

      // Load from database if no cache available
      console.log('🔄 TemplateManager: Loading templates from database...');
      const loadStartTime = performance.now();
      try {
        // Try to load from database first
        const dbTemplates = await templateService.getTemplates();
        const loadTime = performance.now() - loadStartTime;
        console.log(`📋 TemplateManager: Found templates in database: ${dbTemplates.length} (${loadTime.toFixed(2)}ms)`);
        
        if (dbTemplates.length > 0) {
          // Convert database templates to frontend format
          const convertStartTime = performance.now();
          const frontendTemplates = await templateService.convertToFrontendTemplates(dbTemplates);
          const convertTime = performance.now() - convertStartTime;
          console.log(`✅ TemplateManager: Templates loaded from database: ${frontendTemplates.length} (convert: ${convertTime.toFixed(2)}ms, total: ${(performance.now() - loadStartTime).toFixed(2)}ms)`);
          setTemplates(frontendTemplates);
        } else {
          // No templates in database
          console.log('📋 TemplateManager: No templates found in database');
          setTemplates([]);
        }
      } catch (error: any) {
        const errorTime = performance.now() - loadStartTime;
        console.error(`❌ TemplateManager: Error loading templates from database (${errorTime.toFixed(2)}ms):`, error);
        
        // Show user-friendly error message
        if (error.message && error.message.includes('timeout')) {
          console.error('⏱️ Request timed out - using cached templates if available');
        } else if (error.message && error.message.includes('Failed to fetch')) {
          console.error('🌐 Network error - check if server is running');
        }
        
        // If API fails and we didn't load from cache, set empty array
        if (!templatesLoadedFromCache) {
          console.log('📋 TemplateManager: No templates available (cache or database failed)');
          setTemplates([]);
        } else {
          console.log('✅ TemplateManager: Templates already loaded from cache, ignoring API error');
        }
      }
      setIsLoading(false);
    };

    loadTemplates();
  }, [externalTemplates]); // Re-run when external templates change

  // Save templates to localStorage whenever templates change
  // BUT: Don't save if templates come from App.tsx (externalTemplates) - App.tsx handles that
  // AND: Don't dispatch event on every save - only on actual updates
  useEffect(() => {
    // Skip saving if templates are from external source (App.tsx)
    if (externalTemplates && templates === externalTemplates) {
      return; // App.tsx handles caching, don't interfere
    }
    
    const saveTemplates = async () => {
      try {
        if (templates.length > 0) {
          // Check localStorage size before saving
          const currentSize = new Blob([JSON.stringify(templates)]).size;
          const maxSize = 4 * 1024 * 1024; // 4MB limit
          
          if (currentSize > maxSize) {
            console.warn('⚠️ Template data is too large for localStorage');
            // Try to save without file data first
            const templatesForStorage = templates.map(template => ({
              ...template,
              fileData: null, // Don't store file data to save space
              fileName: template.file ? template.file.name : null,
              file: undefined
            }));
            
            try {
              localStorage.setItem('cpq_templates', JSON.stringify(templatesForStorage));
              console.log('✅ Templates saved without file data to save space');
            } catch (storageError) {
              console.error('❌ Failed to save templates even without file data:', storageError);
              // Try to save just the essential data
              const essentialTemplates = templates.map(template => ({
                id: template.id,
                name: template.name,
                isDefault: template.isDefault,
                uploadDate: template.uploadDate,
                fileName: template.file ? template.file.name : null
              }));
              localStorage.setItem('cpq_templates', JSON.stringify(essentialTemplates));
              console.log('✅ Saved essential template data only');
            }
          } else {
            try {
              // Convert File objects to base64 strings for storage
              const templatesForStorage = await Promise.all(templates.map(async (template) => ({
                ...template,
                fileData: template.file ? await fileToDataURL(template.file) : null,
                fileName: template.file ? template.file.name : null,
                file: undefined // Remove file object as it can't be serialized
              })));
              
              localStorage.setItem('cpq_templates', JSON.stringify(templatesForStorage));
              console.log('✅ Templates saved with file data');
            } catch (conversionError) {
              console.error('❌ Error converting files to base64:', conversionError);
              // Fallback: save without file data
              const templatesForStorage = templates.map(template => ({
                ...template,
                fileData: null,
                fileName: template.file ? template.file.name : null,
                file: undefined
              }));
              localStorage.setItem('cpq_templates', JSON.stringify(templatesForStorage));
              console.log('✅ Templates saved without file data as fallback');
            }
          }
        } else {
          // Clear templates from localStorage if array is empty
          localStorage.removeItem('cpq_templates');
        }
        
        // DON'T dispatch templatesUpdated on every save - it causes infinite loop!
        // Only dispatch when templates are actually updated (upload/delete/edit)
        // App.tsx will reload templates on mount, no need to trigger reload here
        
      } catch (error) {
        console.error('Error saving templates:', error);
        
        // Check if it's a quota exceeded error
        if (error instanceof DOMException && error.code === 22) {
          alert('Local storage is full. Please delete some templates or clear your browser data.');
        } else {
          alert('Unable to save template. Please try again or contact support.');
        }
      }
    };

    saveTemplates();
  }, [templates]);

  // Pre-convert all DOCX templates to PDF in background for INSTANT previews
  useEffect(() => {
    const preConvertTemplates = async () => {
      if (templates.length === 0 || isPreConvertingTemplates) return;
      
      console.log('⚡ Starting background pre-conversion of templates for instant previews...');
      setIsPreConvertingTemplates(true);
      
      let convertedCount = 0;
      
      for (const template of templates) {
        try {
          // Skip if already cached
          if (convertedPdfCache[template.id]) {
            continue;
          }
          
          // Fetch template file if not loaded
          let templateFile = template.file;
          if (!templateFile && template.loadFile) {
            console.log(`📥 Pre-loading ${template.name}...`);
            templateFile = await template.loadFile();
            
            // Cache the loaded file for instant access! ⚡
            if (templateFile) {
              setFileCache(prev => ({
                ...prev,
                [template.id]: templateFile
              }));
              console.log(`💾 Cached file for ${template.name}`);
            }
          }
          
          if (!templateFile) continue;
          
          // Check if it's a DOCX file that needs conversion
          if (templateFile.type.includes('wordprocessingml') || templateFile.name.endsWith('.docx')) {
            console.log(`🔄 Pre-converting ${template.name}...`);
            
            try {
              const pdfBlob = await templateService.convertDocxToPdf(templateFile);
              const pdfFile = new File([pdfBlob], template.name + '.pdf', { type: 'application/pdf' });
              
              // Cache the converted PDF
              setConvertedPdfCache(prev => ({
                ...prev,
                [template.id]: pdfFile
              }));
              
              convertedCount++;
              console.log(`✅ ${template.name} ready (${convertedCount})`);
              
            } catch (convError) {
              console.warn(`⚠️ Pre-conversion failed for ${template.name}`);
            }
          }
          
        } catch (error) {
          console.warn(`⚠️ Error pre-loading ${template.name}`);
        }
      }
      
      setIsPreConvertingTemplates(false);
      if (convertedCount > 0) {
        console.log(`🎉 ${convertedCount} templates pre-converted! All previews will be INSTANT! ⚡`);
      }
    };
    
    // Start pre-conversion immediately for INSTANT previews! ⚡
    const timeoutId = setTimeout(preConvertTemplates, 0);
    
    return () => clearTimeout(timeoutId);
  }, [templates.length]); // Run when templates load

  // Helper function to convert File to base64 data URL
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        if (!file || file.size === 0) {
          reject(new Error('Invalid file provided'));
          return;
        }
        
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          console.log('✅ File converted to dataURL:', file.name, 'Size:', file.size, 'bytes');
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('❌ Error reading file:', error);
          reject(error);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('❌ Error in fileToDataURL:', error);
        reject(error);
      }
    });
  };

  // Helper function to check localStorage usage
  const getStorageUsage = () => {
    let totalSize = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length;
      }
    }
    return totalSize;
  };

  // Helper function to clear all templates from storage
  const clearAllTemplates = () => {
    if (confirm('Are you sure you want to delete all templates? This action cannot be undone.')) {
      setTemplates([]);
      localStorage.removeItem('cpq_templates');
      alert('All templates have been deleted.');
    }
  };

  // Helper function to convert base64 data URL back to File
  const dataURLtoFile = (dataURL: string, fileName: string): File | null => {
    try {
      if (!dataURL || !fileName) {
        console.warn('⚠️ Invalid dataURL or fileName for file conversion');
        return null;
      }

      const arr = dataURL.split(',');
      if (arr.length !== 2) {
        console.warn('⚠️ Invalid dataURL format');
        return null;
      }

      const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/pdf';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }

      const file = new File([u8arr], fileName, { type: mime });
      console.log('✅ File converted successfully:', fileName, 'Size:', file.size, 'bytes');
      return file;
    } catch (error) {
      console.error('❌ Error converting dataURL to File:', error);
      return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - now accepts both PDF and DOCX
    if (!isPdfFile(file) && !file.type.includes('wordprocessingml.document')) {
      setUploadError('Please upload a PDF or DOCX file.');
      return;
    }

    // Enhanced validation for DOCX files
    if (file.type.includes('wordprocessingml.document')) {
      console.log('📄 DOCX file detected:', file.name);
      console.log('📊 File size:', file.size, 'bytes');
      console.log('📊 File type:', file.type);
      
      // Validate file extension
      if (!file.name.toLowerCase().endsWith('.docx')) {
        setUploadError('DOCX file must have .docx extension.');
        return;
      }
      
      console.log('✅ DOCX file validation passed');
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be less than 10MB.');
      return;
    }

    try {
      let wordFile: File;
      
      // Check file type and handle accordingly
      if (file.type.includes('wordprocessingml.document')) {
        // For DOCX files, use the file directly
        console.log('📄 DOCX file detected - using file directly');
        wordFile = file;
      } else if (isPdfFile(file)) {
        // For PDF files, convert to Word format
      console.log('🧪 Testing docx library before conversion...');
      const libraryWorks = await testDocxLibrary();
      
      if (!libraryWorks) {
        throw new Error('Docx library is not working properly');
      }
      
      console.log('🔄 Converting PDF to Word format...');
        wordFile = await convertPdfToWord(file);
      } else {
        throw new Error('Unsupported file type');
      }
      
      setNewTemplate(prev => ({
        ...prev,
        file: file,
        wordFile: wordFile
      }));
      setUploadError(null);
      setUploadSuccess('PDF converted to Word format successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('❌ Error converting PDF to Word:', error);
      
      // Fallback: Allow upload without Word conversion
      console.log('⚠️ Word conversion failed, allowing PDF upload only');
      setNewTemplate(prev => ({
        ...prev,
        file: file,
        wordFile: null
      }));
      setUploadError(null);
      setUploadSuccess('PDF uploaded successfully! (Word conversion failed, but PDF is available)');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(null);
      }, 3000);
    }
  };

  const handleUploadTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.file) {
      setUploadError('Please provide a template name and select a file.');
      return;
    }

    setIsUploading(true);

    try {
      console.log('📄 Uploading template to database...');
      
      // Upload template to database
      const uploadResult = await templateService.uploadTemplate(
        newTemplate.file,
        newTemplate.name.trim(),
        newTemplate.description.trim(),
        templates.length === 0 // First template becomes default
      );

      console.log('✅ Template uploaded to database:', uploadResult.template.id);

      // Extract content from the uploaded template for local processing
      console.log('📄 Extracting content from uploaded template...');
      const extractedContent = await extractTemplateContent(newTemplate.file);
      console.log('✅ Template content extracted:', extractedContent.substring(0, 100) + '...');

      // Create frontend template object
      const template: Template = {
        id: uploadResult.template.id,
        name: uploadResult.template.name,
        description: uploadResult.template.description || '',
        file: newTemplate.file,
        wordFile: newTemplate.wordFile,
        size: formatFileSize(newTemplate.file.size),
        uploadDate: new Date(uploadResult.template.createdAt),
        isDefault: uploadResult.template.isDefault,
        content: extractedContent // Store the extracted content
      };

      // Add template to state
      const updatedTemplates = [...templates, template];
      setTemplates(updatedTemplates);
      
      // Reset form
      setNewTemplate({ name: '', description: '', file: null, wordFile: undefined });
      setShowUploadModal(false);
      setActiveTab('templates');
      setUploadError(null);
      setUploadSuccess('Template uploaded successfully to database!');

      // Clear success message after 3 seconds
      setTimeout(() => {
        setUploadSuccess(null);
      }, 3000);

      // If this is the first template, select it automatically
      if (templates.length === 0 && onTemplateSelect) {
        onTemplateSelect(template);
      }

      // Dispatch event to notify App.tsx about template update (ONLY on actual upload)
      console.log('📢 Dispatching templatesUpdated event (template uploaded)...');
      window.dispatchEvent(new CustomEvent('templatesUpdated'));

      // Create a document entry for this template and start an approval workflow
      try {
        console.log('📄 Preparing uploaded template for approval workflow...');

        // Convert file to base64 (similar to ApprovalWorkflow)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const withoutPrefix = result.split(',')[1] || '';
            resolve(withoutPrefix);
          };
          reader.onerror = reject;
          reader.readAsDataURL(newTemplate.file!);
        });

        const documentData = {
          fileName: newTemplate.file!.name,
          fileData: base64,
          fileSize: newTemplate.file!.size,
          clientName: 'Template Library',
          company: 'Template Library',
          quoteId: null,
          metadata: {
            totalCost: 0
          },
          status: 'active',
          createdAt: new Date().toISOString(),
          generatedDate: new Date().toISOString()
        };

        const response = await fetch(`${BACKEND_URL}/api/documents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(documentData)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to save template document for approval');
        }

        const documentId = result.documentId as string;
        console.log('✅ Template saved as document for approval workflow:', documentId);

        // Start a simple Technical + Legal workflow for this template document
        try {
          const workflow = await createWorkflow({
            documentId,
            documentType: 'Template',
            clientName: newTemplate.name || 'Template',
            amount: 0,
            totalSteps: 2,
            workflowSteps: [
              {
                step: 1,
                role: 'Technical Team',
                email: 'saitharunreddy2302@gmail.com',
                status: 'pending'
              },
              {
                step: 2,
                role: 'Legal Team',
                email: 'saitharunreddy2302@gmail.com',
                status: 'pending'
              }
            ]
          });

          console.log('✅ Template approval workflow created:', workflow?.id);
        } catch (workflowError) {
          console.error('❌ Failed to start template approval workflow:', workflowError);
        }

        // Navigate to Approval page and open Start Approval Workflow tab
        navigate('/approval', {
          state: { openStartApprovalTab: true, source: 'template-upload', documentId }
        });
      } catch (docError) {
        console.error('❌ Failed to create document / workflow for uploaded template:', docError);
      }

      // Navigate to Approval page and open Start Approval Workflow tab
      navigate('/approval', {
        state: { openStartApprovalTab: true, source: 'template-upload', templateId: uploadResult.template.id }
      });

      // Also save to localStorage as backup
      try {
        const templatesForStorage = await Promise.all(updatedTemplates.map(async (t) => ({
          ...t,
          fileData: t.file ? await fileToDataURL(t.file) : null,
          fileName: t.file ? t.file.name : null,
          wordFileData: t.wordFile ? await fileToDataURL(t.wordFile) : null,
          wordFileName: t.wordFile ? t.wordFile.name : null,
          content: t.content,
          file: undefined,
          wordFile: undefined
        })));
        
        localStorage.setItem('cpq_templates', JSON.stringify(templatesForStorage));
        console.log('✅ Template also saved to localStorage as backup');
      } catch (storageError) {
        console.warn('⚠️ Could not save to localStorage backup:', storageError);
      }
      
    } catch (error) {
      console.error('❌ Error uploading template:', error);
      setUploadError(`Failed to upload template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Process template content for non-PDF templates
  const processTemplateContent = async (template: Template, quote: any): Promise<string> => {
    try {
      console.log('🔄 Processing template content for non-PDF template:', template.name);
      
      // Get the template content
      let templateContent = template.content || '';
      
      // If no content, try to read from file
      if (!templateContent && template.file) {
        if (template.file.type.includes('text') || template.file.type.includes('html')) {
          templateContent = await template.file.text();
        } else {
          // For other file types, create a default template
          templateContent = createDefaultTemplateContent(template.name);
        }
      }
      
      // Replace placeholders in the content
      const processedContent = replacePlaceholdersInContent(templateContent, quote);
      
      console.log('✅ Template content processed successfully');
      return processedContent;
      
    } catch (error) {
      console.error('❌ Error processing template content:', error);
      // Return a fallback template
      return createFallbackTemplateContent(quote);
    }
  };

  // Replace placeholders in template content
  const replacePlaceholdersInContent = (content: string, quote: any): string => {
    const placeholderMappings = {
      '{{Company Name}}': quote.company || 'Company Name',
      '{{Client Name}}': quote.clientName || 'Client Name',
      '{{Client Email}}': quote.clientEmail || 'client@example.com',
      '{{migration type}}': quote.configuration?.migrationType || 'Email',
      '{{userscount}}': quote.configuration?.numberOfUsers || '1',
      '{{price_migration}}': formatCurrency(quote.calculation?.migrationCost || 0),
      '{{price_data}}': formatCurrency(quote.calculation?.dataCost || 0),
      '{{total price}}': formatCurrency(quote.calculation?.totalCost || 0),
      '{{Duration of months}}': quote.configuration?.duration || '1',
      '{{instance_users}}': quote.configuration?.numberOfInstances || '1',
      '{{instance_type}}': quote.configuration?.instanceType || 'Standard',
      '{{instanceType}}': quote.configuration?.instanceType || 'Standard',
      '{{instance_type_cost}}': (() => {
        const { getInstanceTypeCost, formatCurrency } = require('../utils/pricing');
        return formatCurrency(getInstanceTypeCost(quote.configuration?.instanceType || 'Standard'));
      })(),
      '{{numberOfInstances}}': quote.configuration?.numberOfInstances || '1',
      '{{number_of_instances}}': quote.configuration?.numberOfInstances || '1',
      '{{instances}}': quote.configuration?.numberOfInstances || '1'
    };

    let processedContent = content;
    
    // Replace all placeholders
    Object.entries(placeholderMappings).forEach(([placeholder, value]) => {
      const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
      processedContent = processedContent.replace(regex, value);
    });
    
    return processedContent;
  };

  // Create default template content
  const createDefaultTemplateContent = (templateName: string): string => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af; text-align: center; margin-bottom: 30px;">CloudFuze Purchase Agreement</h1>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #374151;">
            This agreement provides {{Company Name}} with pricing for use of the CloudFuze's X-Change Enterprise Data Migration Solution.
          </p>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <strong>Cloud-Hosted SaaS Solution | Managed Migration | Dedicated Migration Manager</strong>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #6b7280; color: white;">
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Job Requirement</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Description</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Migration Type</th>
              <th style="padding: 12px; text-align: right; border: 1px solid #6b7280;">Price(USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: bold;">CloudFuze X-Change<br>Data Migration</td>
              <td style="padding: 12px;">{{migration type}} to Teams<br><br>Up to {{userscount}} Users | All Channels and DMs</td>
              <td style="padding: 12px;">Managed Migration<br>One-Time</td>
              <td style="padding: 12px; text-align: right; font-weight: bold;">{{price_migration}}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="text-align: right; margin-top: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">Total Price: {{total price}}</p>
        </div>
      </div>
    `;
  };

  // Create professional HTML preview
  const createProfessionalHTMLPreview = (quote: any, template: Template): string => {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Template Preview</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8fafc;
            line-height: 1.6;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #1e40af, #3b82f6);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
          }
          .header p {
            margin: 10px 0 0 0;
            opacity: 0.9;
          }
          .content {
            padding: 30px;
          }
          .info-section {
            background: #f0f9ff;
            border: 1px solid #bae6fd;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .info-section h3 {
            margin: 0 0 15px 0;
            color: #1e40af;
            font-size: 18px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
          }
          .info-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .info-item:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #374151;
          }
          .info-value {
            color: #1f2937;
            font-weight: 500;
          }
          .pricing-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          .pricing-table th {
            background: #6b7280;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
          }
          .pricing-table td {
            padding: 15px;
            border-bottom: 1px solid #e5e7eb;
          }
          .pricing-table tr:last-child td {
            border-bottom: none;
          }
          .total-row {
            background: #f0f9ff;
            font-weight: bold;
          }
          .total-row td {
            color: #1e40af;
            font-size: 18px;
          }
          .features {
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .features h3 {
            margin: 0 0 15px 0;
            color: #166534;
            font-size: 18px;
          }
          .features ul {
            margin: 0;
            padding-left: 20px;
          }
          .features li {
            margin: 8px 0;
            color: #374151;
          }
          .footer {
            background: #f9fafb;
            padding: 20px;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CloudFuze Purchase Agreement</h1>
            <p>Professional Cloud Migration Services</p>
          </div>
          
          <div class="content">
            <div class="info-section">
              <h3>Client Information</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Client Name:</span>
                  <span class="info-value">${quote.clientName}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Company:</span>
                  <span class="info-value">${quote.company}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Email:</span>
                  <span class="info-value">${quote.clientEmail}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Template:</span>
                  <span class="info-value">${template.name}</span>
                </div>
              </div>
            </div>

            <div class="info-section">
              <h3>Project Configuration</h3>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Number of Users:</span>
                  <span class="info-value">${quote.configuration.numberOfUsers}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Instance Type:</span>
                  <span class="info-value">${quote.configuration.instanceType}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Migration Type:</span>
                  <span class="info-value">${quote.configuration.migrationType}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Duration:</span>
                  <span class="info-value">${quote.configuration.duration} months</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Data Size:</span>
                  <span class="info-value">${quote.configuration.dataSizeGB} GB</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Number of Instances:</span>
                  <span class="info-value">${quote.configuration.numberOfInstances}</span>
                </div>
              </div>
            </div>

            <table class="pricing-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    User costs (${quote.configuration.numberOfUsers} users × ${quote.configuration.duration} months)
                    <br />
                    <small style="color: #666; font-weight: normal;">
                      @ ${formatCurrency(quote.calculation.userCost / (quote.configuration.numberOfUsers * quote.configuration.duration))}/user/month
                    </small>
                  </td>
                  <td>${formatCurrency(quote.calculation.userCost)}</td>
                </tr>
                <tr>
                  <td>Data costs (${quote.configuration.dataSizeGB} GB)</td>
                  <td>${formatCurrency(quote.calculation.dataCost)}</td>
                </tr>
                <tr>
                  <td>Migration services</td>
                  <td>${formatCurrency(quote.calculation.migrationCost)}</td>
                </tr>
                <tr>
                  <td>Instance costs (${quote.configuration.numberOfInstances} instances)</td>
                  <td>${formatCurrency(quote.calculation.instanceCost)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Project Cost</td>
                  <td>${formatCurrency(quote.calculation.totalCost)}</td>
                </tr>
              </tbody>
            </table>

          </div>
          
          <div class="footer">
            <p>This is a preview of how your template will look with the processed data.</p>
            <p>Template: ${template.name} | Generated: ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Create template-based fallback that mimics the actual template structure
  const createTemplateBasedFallback = (quote: any, template: Template): string => {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Template Preview - ${template.name}</title>
        <style>
          body {
            font-family: 'Times New Roman', serif;
            margin: 0;
            padding: 40px;
            background-color: white;
            line-height: 1.4;
            color: #333;
          }
          .document {
            max-width: 800px;
            margin: 0 auto;
            background: white;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            font-size: 24px;
            font-weight: bold;
            margin: 0 0 10px 0;
            color: #333;
          }
          .header p {
            font-size: 14px;
            margin: 5px 0;
            color: #666;
          }
          .content-section {
            margin-bottom: 30px;
          }
          .content-section h2 {
            font-size: 18px;
            font-weight: bold;
            margin: 0 0 15px 0;
            color: #333;
            border-bottom: 1px solid #ccc;
            padding-bottom: 5px;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .info-table td {
            padding: 8px 12px;
            border: 1px solid #ddd;
            vertical-align: top;
          }
          .info-table .label {
            background-color: #f5f5f5;
            font-weight: bold;
            width: 30%;
          }
          .pricing-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .pricing-table th,
          .pricing-table td {
            padding: 12px;
            border: 1px solid #333;
            text-align: left;
          }
          .pricing-table th {
            background-color: #f0f0f0;
            font-weight: bold;
          }
          .pricing-table .total-row {
            background-color: #f9f9f9;
            font-weight: bold;
          }
          .signature-section {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            width: 45%;
            border-top: 1px solid #333;
            padding-top: 10px;
            text-align: center;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ccc;
            padding-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="document">
          <div class="header">
            <h1>CloudFuze Purchase Agreement</h1>
            <p>Quote #: CPQ-001</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="content-section">
            <h2>Client Information</h2>
            <table class="info-table">
              <tr>
                <td class="label">Client Name:</td>
                <td>${quote.clientName}</td>
              </tr>
              <tr>
                <td class="label">Company:</td>
                <td>${quote.company}</td>
              </tr>
              <tr>
                <td class="label">Email:</td>
                <td>${quote.clientEmail}</td>
              </tr>
            </table>
          </div>

          <div class="content-section">
            <h2>Project Configuration</h2>
            <table class="info-table">
              <tr>
                <td class="label">Number of Users:</td>
                <td>${quote.configuration.numberOfUsers}</td>
              </tr>
              <tr>
                <td class="label">Instance Type:</td>
                <td>${quote.configuration.instanceType}</td>
              </tr>
              <tr>
                <td class="label">Migration Type:</td>
                <td>${quote.configuration.migrationType}</td>
              </tr>
              <tr>
                <td class="label">Duration:</td>
                <td>${quote.configuration.duration} months</td>
              </tr>
              <tr>
                <td class="label">Data Size:</td>
                <td>${quote.configuration.dataSizeGB} GB</td>
              </tr>
              <tr>
                <td class="label">Number of Instances:</td>
                <td>${quote.configuration.numberOfInstances}</td>
              </tr>
            </table>
          </div>

          <div class="content-section">
            <h2>Pricing Breakdown</h2>
            <table class="pricing-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    User costs (${quote.configuration.numberOfUsers} users × ${quote.configuration.duration} months)
                    <br />
                    <small style="color: #666; font-weight: normal;">
                      @ ${formatCurrency(quote.calculation.userCost / (quote.configuration.numberOfUsers * quote.configuration.duration))}/user/month
                    </small>
                  </td>
                  <td>${formatCurrency(quote.calculation.userCost)}</td>
                </tr>
                <tr>
                  <td>Data costs (${quote.configuration.dataSizeGB} GB)</td>
                  <td>${formatCurrency(quote.calculation.dataCost)}</td>
                </tr>
                <tr>
                  <td>Migration services</td>
                  <td>${formatCurrency(quote.calculation.migrationCost)}</td>
                </tr>
                <tr>
                  <td>Instance costs (${quote.configuration.numberOfInstances} instances)</td>
                  <td>${formatCurrency(quote.calculation.instanceCost)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Project Cost</td>
                  <td>${formatCurrency(quote.calculation.totalCost)}</td>
                </tr>
              </tbody>
            </table>
          </div>


          <div class="signature-section">
            <div class="signature-box">
              <p>Client Signature</p>
              <br><br>
              <p>_________________________</p>
              <p>Date: _______________</p>
            </div>
            <div class="signature-box">
              <p>CloudFuze Representative</p>
              <br><br>
              <p>_________________________</p>
              <p>Date: _______________</p>
            </div>
          </div>

          <div class="footer">
            <p>Template: ${template.name} | This is a preview of the processed template with sample data</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // Create fallback template content
  const createFallbackTemplateContent = (quote: any): string => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1e40af; text-align: center; margin-bottom: 30px;">CloudFuze Purchase Agreement for ${quote.company || 'Client'}</h1>
        
        <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #374151;">
            This agreement provides ${quote.company || 'Client'} with pricing for use of the CloudFuze's X-Change Enterprise Data Migration Solution.
          </p>
        </div>
        
        <div style="background-color: #e0f2fe; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <strong>Cloud-Hosted SaaS Solution | Managed Migration | Dedicated Migration Manager</strong>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #6b7280; color: white;">
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Job Requirement</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Description</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b7280;">Migration Type</th>
              <th style="padding: 12px; text-align: right; border: 1px solid #6b7280;">Price(USD)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: bold;">CloudFuze X-Change<br>Data Migration</td>
              <td style="padding: 12px;">${quote.configuration?.migrationType || 'Email'} to Teams<br><br>Up to ${quote.configuration?.numberOfUsers || 1} Users | All Channels and DMs</td>
              <td style="padding: 12px;">Managed Migration<br>One-Time</td>
              <td style="padding: 12px; text-align: right; font-weight: bold;">${formatCurrency(quote.calculation?.migrationCost || 0)}</td>
            </tr>
          </tbody>
        </table>
        
        <div style="text-align: right; margin-top: 20px;">
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">Total Price: ${formatCurrency(quote.calculation?.totalCost || 0)}</p>
        </div>
      </div>
    `;
  };


  // Simple preview function to show original template content
  const handleSimplePreview = async (template: Template) => {
    try {
      console.log('🔍 Simple preview of original template:', template.name);
      console.log('🔍 Template file details:', {
        hasFile: !!template.file,
        hasLoadFile: !!template.loadFile,
        fileType: template.file?.type,
        fileName: template.file?.name,
        fileSize: template.file?.size
      });
      
      // Show loading immediately
      setIframeLoading(true);
      setIframeLoadError(false);
      setShowPreviewModal(true);
      
      let templateFile = template.file;
      
      // CHECK CACHE FIRST for instant access! ⚡
      if (!templateFile && fileCache[template.id]) {
        console.log('⚡ Using cached file - INSTANT!');
        templateFile = fileCache[template.id];
      }
      
      // If file is not loaded yet and not in cache, fetch it from backend database
      if (!templateFile && template.loadFile) {
        console.log('📥 File not loaded, fetching from backend database...');
        try {
          templateFile = await template.loadFile();
          console.log('✅ File fetched from backend:', {
            fileName: templateFile?.name,
            fileSize: templateFile?.size,
            fileType: templateFile?.type
          });
          
          // Cache it for next time! ⚡
          if (templateFile) {
            setFileCache(prev => ({
              ...prev,
              [template.id]: templateFile
            }));
            console.log(`💾 Cached file for instant future access`);
          }
        } catch (error) {
          console.error('❌ Error loading file from backend:', error);
        }
      }
      
      // If still no file, try to find in templates array
      if (!templateFile) {
        console.log('⚠️ Template file still missing, looking for template in templates array...');
        const templateFromArray = templates.find(t => t.id === template.id);
        if (templateFromArray && templateFromArray.file) {
          templateFile = templateFromArray.file;
          console.log('✅ Found template with file in templates array');
        } else if (templateFromArray && templateFromArray.loadFile) {
          console.log('📥 Trying to load file from template in array...');
          try {
            templateFile = await templateFromArray.loadFile();
            console.log('✅ File loaded from array template');
          } catch (error) {
            console.error('❌ Error loading file from array template:', error);
          }
        }
      }
      
      // Final check
      if (!templateFile) {
        console.error('❌ Template file could not be loaded from backend');
        setIframeLoading(false);
        setIframeLoadError(true);
        alert('Template file is not available for preview. The file may not exist in the database.');
        return;
      }
      
      console.log('🔍 File type for preview:', templateFile.type);
      
      // Check if it's a Word document (.docx) - needs conversion to PDF for preview
      if (templateFile.type.includes('wordprocessingml') || templateFile.name.endsWith('.docx')) {
        console.log('🔄 Word document detected, checking cache...');
        
        // Check if we already have a converted PDF cached for this template
        let pdfFile = convertedPdfCache[template.id];
        
        if (pdfFile) {
          console.log('⚡ Using cached PDF - INSTANT preview!', pdfFile.size, 'bytes');
        } else {
          console.log('🔄 Not in cache, converting DOCX to PDF...');
          
          try {
            // Convert DOCX to PDF using backend service
            const pdfBlob = await templateService.convertDocxToPdf(templateFile);
            console.log('✅ DOCX converted to PDF:', pdfBlob.size, 'bytes');
            
            // Create PDF file from blob
            pdfFile = new File([pdfBlob], template.name + '.pdf', { type: 'application/pdf' });
            
            // Cache the converted PDF for instant future previews
            setConvertedPdfCache(prev => ({
              ...prev,
              [template.id]: pdfFile
            }));
            console.log('💾 PDF cached for template:', template.id);
            
          } catch (conversionError) {
            console.error('❌ Error converting DOCX to PDF:', conversionError);
            setIframeLoading(false);
            setIframeLoadError(true);
            alert('Failed to convert template to PDF for preview. Please try again.');
            return;
          }
        }
        
        // Create URL and show preview
        const pdfUrl = URL.createObjectURL(pdfFile);
        
        setPreviewData({
          template: { ...template, file: pdfFile },
          originalUrl: pdfUrl,
          processedUrl: pdfUrl,
          sampleQuote: null
        });
        
        console.log('✅ PDF preview ready from backend file');
        
      } else {
        // For PDF files, use directly
        console.log('📄 PDF file detected, using directly for preview');
        const originalUrl = URL.createObjectURL(templateFile);
        
        setPreviewData({
          template: { ...template, file: templateFile },
          originalUrl,
          processedUrl: originalUrl,
          sampleQuote: null
        });
      }
      
      console.log('✅ Original template preview from backend loaded successfully');
      
    } catch (error) {
      console.error('❌ Error in simple preview:', error);
      setIframeLoading(false);
      setIframeLoadError(true);
      alert('Failed to preview template from backend. Please try again.');
    }
  };


  const handleDownloadTemplate = (template: Template) => {
    try {
      console.log('🔍 Downloading template:', template.name);
      console.log('🔍 Template file details:', {
        hasFile: !!template.file,
        fileType: template.file?.type,
        fileName: template.file?.name
      });
      
      // Check if template has a valid file, if not try to find it in templates array
      let templateToUse = template;
      if (!template.file) {
        console.log('⚠️ Template file missing, looking for template in templates array...');
        const templateFromArray = templates.find(t => t.id === template.id);
        if (templateFromArray && templateFromArray.file) {
          templateToUse = templateFromArray;
          console.log('✅ Found template with file in templates array');
      } else {
          console.error('❌ Template does not have a valid file for download');
          alert('Template file is not available for download. Please re-upload the template.');
          return;
        }
      }
      
      if (!templateToUse.file) {
        console.error('❌ Template file is null');
        alert('Template file could not be loaded.');
        return;
      }
      
      const url = URL.createObjectURL(templateToUse.file);
    const a = document.createElement('a');
    a.href = url;
      a.download = templateToUse.name + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
      
      console.log('✅ Template downloaded successfully');
    } catch (error) {
      console.error('❌ Error downloading template:', error);
      alert('Failed to download template. Please try again.');
    }
  };

  const handleDownloadWordTemplate = (template: Template) => {
    console.log('🔍 Word download clicked for template:', template.name);
    console.log('🔍 Template object:', template);
    console.log('🔍 Word file exists?', !!template.wordFile);
    console.log('🔍 Word file details:', template.wordFile);
    
    if (template.wordFile) {
      console.log('📥 Downloading Word file:', template.wordFile.name);
      try {
        downloadWordFile(template.wordFile, template.name + '.docx');
        console.log('✅ Word download initiated successfully');
      } catch (error) {
        console.error('❌ Error downloading Word file:', error);
        alert('Error downloading Word file: ' + error.message);
      }
    } else {
      console.warn('⚠️ No Word file available for template:', template.name);
      alert('Word version not available for this template. Please re-upload the template to generate a Word version.');
    }
  };

  const handleConvertToWord = async (template: Template) => {
    console.log('🔄 Converting existing template to Word:', template.name);
    
    try {
      if (!template.file) {
        console.error('❌ Template file is null');
        alert('Template file could not be loaded.');
        return;
      }
      
      let wordFile: File;
      
      // Check file type and handle accordingly
      if (template.file.type.includes('wordprocessingml.document')) {
        // For DOCX files, use the file directly
        console.log('📄 DOCX file detected - using file directly');
        wordFile = template.file;
      } else if (isPdfFile(template.file)) {
        // For PDF files, convert to Word format
        console.log('🧪 Testing docx library before conversion...');
      const libraryWorks = await testDocxLibrary();
      if (!libraryWorks) {
        throw new Error('Docx library is not working properly');
      }
      
        console.log('🔄 Converting PDF to Word format...');
        wordFile = await convertPdfToWord(template.file);
      } else {
        throw new Error('Unsupported file type');
      }
      
      // Update the template with the Word file
      const updatedTemplates = templates.map(t => 
        t.id === template.id 
          ? { ...t, wordFile: wordFile }
          : t
      );
      
      setTemplates(updatedTemplates);
      
      // Save to localStorage
      const templatesForStorage = await Promise.all(updatedTemplates.map(async (t) => ({
        ...t,
        fileData: t.file ? await fileToDataURL(t.file) : null,
        fileName: t.file ? t.file.name : null,
        wordFileData: t.wordFile ? await fileToDataURL(t.wordFile) : null,
        wordFileName: t.wordFile ? t.wordFile.name : null,
        file: undefined,
        wordFile: undefined
      })));
      
      localStorage.setItem('cpq_templates', JSON.stringify(templatesForStorage));
      
      alert('Template converted to Word format successfully!');
      
    } catch (error) {
      console.error('❌ Error converting template to Word:', error);
      alert('Failed to convert template to Word format: ' + error.message);
    }
  };

  // Template verification function
  const handleVerifyTemplate = async (template: Template) => {
    try {
      console.log('🔍 Starting template verification process...');
      setIsVerifyingTemplate(true);
      
      // Validate signature fields
      if (!signatureForm.eSignature.trim() || !signatureForm.name.trim() || !signatureForm.title.trim() || !signatureForm.date) {
        alert('Please fill in all signature fields before verifying the template.');
        return;
      }
      
      // Create signature data object
      const signatureData = {
        eSignature: signatureForm.eSignature,
        fullName: signatureForm.name,
        title: signatureForm.title,
        date: signatureForm.date,
        selectedFontStyle: selectedFontStyle
      };
      
      console.log('📋 Signature data for verification:', signatureData);
      
      if (!currentQuoteData) {
        alert('No quote data available for template verification. Please ensure you have a complete quote configuration.');
        return;
      }
      
      // Create quote object with signature data
      const quote = {
        ...currentQuoteData,
        signatureData: signatureData
      };
      
      const quoteNumber = `CPQ-001`;
      
      // Process template with signature data for verification
      const { mergeQuoteWithPlaceholders } = await import('../utils/pdfMerger');
      const { quoteBlob } = await mergeQuoteWithPlaceholders(template.file, quote, quoteNumber);
      
      // Create a temporary URL for verification preview
      const verificationUrl = URL.createObjectURL(quoteBlob);
      
      // Open the verified template in a new tab for review
      window.open(verificationUrl, '_blank');
      
      console.log('✅ Template verification completed successfully');
      alert('✅ Template verification completed!\n\nThe template with your signature data has been opened in a new tab for your review.\n\nPlease verify that all signature fields are correctly placed on the third page before sending the email.');
      
    } catch (error) {
      console.error('❌ Error verifying template:', error);
      alert(`❌ Template verification failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or contact support if the issue persists.`);
    } finally {
      setIsVerifyingTemplate(false);
    }
  };

  // Email handling function for template sending
  const handleEmailSubmit = async (template: Template) => {
    setSendingEmail(template.id);
    
    try {
      // Validate signature fields
      if (!signatureForm.eSignature.trim()) {
        throw new Error('Please enter your E-Signature before sending.');
      }
      if (!signatureForm.name.trim()) {
        throw new Error('Please enter your Full Name before sending.');
      }
      if (!signatureForm.title.trim()) {
        throw new Error('Please enter your Title/Position before sending.');
      }
      if (!signatureForm.date) {
        throw new Error('Please select a Date before sending.');
      }

      // Upload user signature image if available
      let userSignatureImage = null;
      if (signatureForm.signatureImage) {
        try {
          const formData = new FormData();
          formData.append('signatureImage', signatureForm.signatureImage);
          formData.append('formId', template.id);
          formData.append('signatureType', 'user');
          
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
          const uploadResponse = await fetch(`${backendUrl}/api/signature/upload-image`, {
            method: 'POST',
            body: formData
          });
          
          const uploadResult = await uploadResponse.json();
          if (uploadResult.success) {
            userSignatureImage = signatureForm.signatureImage;
            console.log('✅ User signature image uploaded successfully');
          }
        } catch (uploadError) {
          console.warn('⚠️ Failed to upload user signature image:', uploadError);
        }
      }

      // Process template with signature data
      console.log('🔄 Processing template with signature data...');
      
      // Get current quote data from props
      if (!currentQuoteData) {
        throw new Error('No quote data available. Please generate a quote first.');
      }

      const quoteNumber = `CPQ-001`;
      
      // Create enhanced quote data with signature information
      const enhancedQuoteData = {
        ...currentQuoteData,
        signatureData: {
          eSignature: signatureForm.eSignature,
          fullName: signatureForm.name,
          title: signatureForm.title,
          date: signatureForm.date,
          selectedFontStyle: selectedFontStyle
        }
      };
      
      // Use the placeholder replacement function to create processed template with signature
      const { mergeQuoteWithPlaceholders } = await import('../utils/pdfMerger');
      const { quoteBlob, newTemplateBlob } = await mergeQuoteWithPlaceholders(template.file, enhancedQuoteData, quoteNumber);
      
      // Create processed template file with signature data
      const processedTemplate = new File([newTemplateBlob], `${template.name}-signed.pdf`, { type: 'application/pdf' });
      
      // Store the processed template
      setProcessedTemplates(prev => ({
        ...prev,
        [template.id]: processedTemplate
      }));

      // Step 1: Create Digital Signature Form
      console.log('📝 Creating digital signature form for template...');
      const templateId = template.id;
      
      // Use client name from form or extract from email
      let clientName = emailForm.clientName || emailForm.to.split('@')[0] || 'Client';
      
      // If no client name provided, format the email username
      if (!emailForm.clientName) {
        clientName = clientName
          .replace(/[._]/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
        
        // If the name is too short or generic, use a more descriptive name
        if (clientName.length < 2 || clientName.toLowerCase() === 'client') {
          clientName = 'Client User';
        }
      }
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const formResponse = await fetch(`${backendUrl}/api/signature/create-form`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: templateId, // Use template ID as quote ID for tracking
          clientEmail: emailForm.to,
          clientName: clientName, // Use actual client name
          quoteData: {
            totalCost: 'Template Cost',
            plan: template.name,
            clientName: clientName,
            company: 'Client Company',
            quoteNumber: `TEMPLATE-${templateId.slice(-6)}`
          }
        })
      });

      if (!formResponse.ok) {
        throw new Error('Failed to create signature form');
      }

      const formResult = await formResponse.json();
      const formId = formResult.formId;
      console.log('✅ Signature form created for template:', formId);

      // Step 2: Send email with processed template and signature form link
      console.log('📧 Sending template via email with signature form...');
      
      // Create FormData for email with processed template
      const formData = new FormData();
      formData.append('to', emailForm.to);
      formData.append('subject', emailForm.subject);
      
      // Enhanced email message with signature form link
      const signatureFormLink = `${window.location.origin}/client-signature-form.html?formId=${formId}`;
      const enhancedMessage = `${emailForm.message}

📝 DIGITAL SIGNATURE REQUIRED
To approve this template, please click the link below to access our secure digital signature form:
${signatureFormLink}

The signature form will allow you to:
• Review the complete template details
• Provide your digital signature
• Approve or reject the template
• Add any comments or feedback

This form will expire in 7 days for security purposes.

Best regards,
CloudFuze Team`;
      
      formData.append('message', enhancedMessage);
      
      // Add the processed template as attachment
      formData.append('attachment', processedTemplate);
      
      console.log('📧 Sending email with processed template and signature form link...');
      
      // Send email with processed template and signature form link
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
        setShowEmailModal(null);
        setEmailForm({ to: '', subject: '', message: '', clientName: '' });
        setSignatureForm({
          eSignature: '',
          name: '',
          title: '',
          date: new Date().toISOString().split('T')[0]
        });
        setSelectedFontStyle(0); // Reset to first font style
        
        // Show success message with signature form info
        alert(`✅ Template sent successfully with digital signature form!

📧 Message ID: ${result.messageId}
📄 Template: ${template.name}
📎 Attachment: ${processedTemplate.name}
✍️ Signed by: ${signatureForm.name} (${signatureForm.title})
📝 Signature Style: ${signatureFonts[selectedFontStyle].name}
📅 Signed on: ${signatureForm.date}
📝 Signature Form ID: ${formId}
🔗 Form Link: ${signatureFormLink}

The client will receive an email with the processed template and a link to complete the digital signature process.`);
        
      } else {
        throw new Error(result.message || 'Failed to send email');
      }
      
    } catch (error) {
      console.error('❌ Error sending template email:', error);
      
      if (error.message.includes('Failed to fetch')) {
        alert('❌ Cannot connect to email server. Please check if the backend is running.');
      } else if (error.message.includes('Server error:')) {
        alert(`❌ Server error: ${error.message}`);
      } else {
        alert(`❌ Error sending template email: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setSendingEmail(null);
    }
  };

  // Template selection handler
  const handleSelectTemplate = (template: Template) => {
    console.log('🎯 Template selected:', template.name);
    
    // Track template selection
    track('template.selected', {
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      planType: template.planType,
      combination: template.combination
    });
    
    if (onTemplateSelect) {
      onTemplateSelect(template);
      console.log('✅ Template selection callback called');
      
      // Show success message
      setSelectionSuccess(`Template "${template.name}" selected successfully! You can now generate agreements in the Quote session.`);
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSelectionSuccess(null);
      }, 5000);
    } else {
      console.warn('⚠️ No onTemplateSelect callback provided');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">Template Manager</h1>
        </div>
        <p className="text-gray-600">Here you can see and manage all your deal agreement templates</p>

        {/* Templates / Upload Tabs */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex bg-gray-100 rounded-full p-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('templates');
                setShowUploadModal(false);
              }}
              className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'templates'
                  ? 'bg-white shadow text-blue-700'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Templates
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                setShowUploadModal(true);
              }}
              className={`ml-1 px-5 py-2 text-sm font-medium rounded-full transition-colors ${
                activeTab === 'upload'
                  ? 'bg-white shadow text-blue-700'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Upload Templates
            </button>
          </div>
        </div>

        {/* Storage Management - Hidden */}
        {/* <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-800">Storage Management</h3>
              <p className="text-sm text-blue-700">
                Current storage usage: {Math.round(getStorageUsage() / 1024)} KB
              </p>
            </div>
            <button
              onClick={clearAllTemplates}
              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
            >
              Clear All Templates
            </button>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            If you're getting storage errors, try clearing templates or use smaller files.
          </p>
        </div> */}
      </div>

      {/* Global Selection Success Message */}
      {selectionSuccess && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-blue-800">Template Selected!</h3>
              <p className="text-sm text-blue-700">{selectionSuccess}</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Button - Hidden */}
      {/* <div className="mb-8">
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-300 font-semibold flex items-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Upload New Template
        </button>
      </div> */}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading templates...</p>
          </div>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className={`bg-white rounded-xl border-2 p-6 shadow-lg transition-all duration-300 hover:shadow-xl ${
                selectedTemplate?.id === template.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              {/* Template Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-800">{template.name}</h3>
                  {template.isDefault && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      Default
                    </span>
                  )}
                  {selectedTemplate?.id === template.id && (
                    <span className="px-2 py-1 bg-blue-500 text-white text-xs rounded-full font-medium">
                      Selected
                    </span>
                  )}
                </div>
              </div>

              {/* Template Description */}
              {template.description && (
                <p className="text-gray-600 text-sm mb-4">{template.description}</p>
              )}

              {/* Template Details */}
              <div className="space-y-2 text-sm text-gray-500 mb-4">
                <div className="flex justify-between">
                  <span>PDF Size:</span>
                  <span className="font-medium">{template.size}</span>
                </div>
                {template.wordFile && (
                  <div className="flex justify-between">
                    <span>Word Size:</span>
                    <span className="font-medium">{formatFileSize(template.wordFile.size)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Uploaded:</span>
                  <span className="font-medium">
                    {template.uploadDate.toLocaleDateString()}
                  </span>
                </div>
                                 <div className="flex justify-between">
                   <span>Formats:</span>
                   <span className="font-medium">
                     PDF{template.wordFile ? ' + RTF' : ''}
                   </span>
                 </div>
              </div>

              {/* Template Actions */}
              <div className="flex flex-wrap gap-2">
                {/* Select Template Button */}
                <button
                  onClick={() => handleSelectTemplate(template)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                      <CheckCircle className="w-4 h-4 inline mr-1" />
                  {selectedTemplate?.id === template.id ? 'Selected' : 'Select Template'}
                </button>
                
                <button
                  onClick={() => handleSimplePreview(template)}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors"
                >
                  <Eye className="w-4 h-4 inline mr-1" />
                  View Original
                </button>
                
                <button
                  onClick={() => handleDownloadTemplate(template)}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  <Download className="w-4 h-4 inline mr-1" />
                  PDF
                </button>

                {template.wordFile && (
                  <button
                    onClick={() => handleDownloadWordTemplate(template)}
                    className="px-3 py-2 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                  >
                    <WordIcon className="w-4 h-4 inline mr-1" />
                    RTF
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Empty State */}
      {!isLoading && templates.length === 0 && (
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">No Templates Yet</h3>
          <p className="text-gray-600 mb-6">
            Upload your first PDF template to get started with custom quote generation.
          </p>
          <button
            onClick={() => {
              setActiveTab('upload');
              setShowUploadModal(true);
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Upload Template
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Upload Template</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setActiveTab('templates');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Template Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => {
                    // Sanitize template name to remove numbers and invalid characters
                    const sanitized = sanitizeTemplateName(e.target.value);
                    setNewTemplate(prev => ({ ...prev, name: sanitized }));
                  }}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Enter template name"
                />
              </div>

              {/* Template Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Description
                </label>
                <textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="Enter template description (optional)"
                  rows={3}
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Template File * (PDF or DOCX)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="template-file"
                  />
                  <label htmlFor="template-file" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">
                      Click to upload template
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      PDF or DOCX • Max size: 10MB
                    </p>
                  </label>
                </div>
                {newTemplate.file && (
                  <div className="mt-2 space-y-2">
                    {/* PDF File Info */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-700">
                          PDF: {newTemplate.file.name} ({formatFileSize(newTemplate.file.size)})
                        </span>
                      </div>
                    </div>
                    
                                         {/* Word File Info */}
                     {newTemplate.wordFile && (
                       <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                         <div className="flex items-center gap-2">
                           <CheckCircle className="w-4 h-4 text-green-600" />
                           <span className="text-sm text-green-700">
                             RTF: {newTemplate.wordFile.name} ({formatFileSize(newTemplate.wordFile.size)})
                           </span>
                         </div>
                       </div>
                     )}
                  </div>
                )}
              </div>

              {/* Error Message */}
              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm text-red-700">{uploadError}</span>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {uploadSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">{uploadSuccess}</span>
                  </div>
                </div>
              )}

              {/* Selection Success Message */}
              {selectionSuccess && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">{selectionSuccess}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setActiveTab('templates');
                  }}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadTemplate}
                  disabled={isUploading || !newTemplate.name.trim() || !newTemplate.file}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isUploading ? 'Uploading...' : 'Upload Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {showPreviewModal && previewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full h-full max-w-[98vw] max-h-[98vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Template Preview</h2>
                <p className="text-gray-600">
                  {previewData.sampleQuote 
                    ? "See how your template looks with processed data" 
                    : "View the original template with placeholder tokens"}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData(null);
                  setIframeLoading(false);
                  setIframeLoadError(false);
                  // Clean up URLs
                  if (previewData) {
                    URL.revokeObjectURL(previewData.originalUrl);
                    URL.revokeObjectURL(previewData.processedUrl);
                  }
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>



            {/* Original Template Display - Show original template */}
            {!previewData.sampleQuote && (
              <div className="w-full flex-1 flex flex-col overflow-hidden">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <Eye className="w-4 h-4 text-blue-600" />
                </div>
                  Original Template
              </h3>
              <div className="border-2 border-blue-200 rounded-xl overflow-hidden flex-1 flex flex-col">
                  {iframeLoadError ? (
                    <div className="w-full h-full min-h-[700px] bg-gray-100 flex items-center justify-center">
                      <div className="text-center p-8">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Error</h3>
                        <p className="text-gray-600 mb-4">Unable to load the template preview.</p>
                        <button
                          onClick={() => {
                            setIframeLoadError(false);
                            // Try to reload the iframe
                            const iframe = document.querySelector('iframe[title="Original Template"]') as HTMLIFrameElement;
                            if (iframe) {
                              iframe.src = iframe.src;
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : (
                <div className="w-full flex-1 min-h-[700px] border-2 border-blue-200 rounded-xl overflow-hidden relative">
                  {iframeLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
                      <div className="text-center">
                        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-600 font-medium">Loading template preview...</p>
                </div>
                    </div>
                  )}
                <iframe
                  src={previewData.originalUrl}
                    className="w-full h-full"
                  title="Original Template"
                    style={{ border: 'none' }}
                      onError={(e) => {
                        console.error('❌ Iframe failed to load:', e);
                        setIframeLoadError(true);
                      setIframeLoading(false);
                      }}
                      onLoad={(e) => {
                        console.log('✅ Iframe loaded successfully');
                        setIframeLoadError(false);
                      setIframeLoading(false);
                    }}
                  />
                  {/* Fallback message for PDF files */}
                  <div className="absolute bottom-4 left-4 right-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800 text-center">
                      💡 <strong>Tip:</strong> If the PDF doesn't display, try the "Open in New Tab" button below.
                    </p>
                  </div>
                </div>
                  )}
              </div>
              <p className="text-sm text-gray-600 mt-2 text-center">
                  This is the original template with placeholder tokens that will be replaced with actual data.
              </p>
            </div>
            )}

            {/* Processed Template Display - Show only the processed template */}
            {previewData.sampleQuote && (
              <div className="w-full flex-1 flex flex-col overflow-hidden">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-bold text-sm">✓</span>
                  </div>
                  {processedTemplates[previewData.template.id] 
                    ? 'Template with Your Quote Data (After Processing)' 
                    : 'Template with Sample Data (After Processing)'}
                </h3>
                <div className="border-2 border-green-200 rounded-xl overflow-hidden flex-1 flex flex-col">
                  {iframeLoadError ? (
                    <div className="w-full h-full min-h-[700px] bg-gray-100 flex items-center justify-center">
                      <div className="text-center p-8">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="w-8 h-8 text-red-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Preview Error</h3>
                        <p className="text-gray-600 mb-4">Unable to load the template preview.</p>
                        <button
                          onClick={() => {
                            setIframeLoadError(false);
                            // Try to reload the iframe
                            const iframe = document.querySelector('iframe[title="Processed Template"]') as HTMLIFrameElement;
                            if (iframe) {
                              iframe.src = iframe.src;
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : (
                  <iframe
                    src={previewData.processedUrl}
                    className="w-full h-full flex-1 min-h-[700px]"
                    title="Processed Template"
                      onError={(e) => {
                        console.error('❌ Iframe failed to load:', e);
                        setIframeLoadError(true);
                      }}
                      onLoad={(e) => {
                        console.log('✅ Iframe loaded successfully');
                        setIframeLoadError(false);
                      }}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  This is how your template looks after placeholders are replaced with actual data.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setPreviewData(null);
                  setIframeLoading(false);
                  setIframeLoadError(false);
                  // Clean up URLs
                  if (previewData) {
                    URL.revokeObjectURL(previewData.originalUrl);
                    URL.revokeObjectURL(previewData.processedUrl);
                  }
                }}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
              >
                Close Preview
              </button>
              {/* Show different buttons based on whether it's original or processed template */}
              {!previewData.sampleQuote ? (
                // Original template buttons
                <>
                  <button
                    onClick={() => {
                      // Open template in new tab
                      window.open(previewData.originalUrl, '_blank');
                    }}
                    className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
                  >
                    Open in New Tab
                  </button>
                <button
                  onClick={() => {
                    // Download the original template
                    const a = document.createElement('a');
                    a.href = previewData.originalUrl;
                    a.download = `${previewData.template.name}-original.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold"
                >
                  Download Original Template
                </button>
                </>
              ) : (
                // Processed template buttons
                <>
              <button
                onClick={() => {
                  // Open email modal for sending template
                  if (processedTemplates[previewData.template.id]) {
                    // Pre-fill email form with template info
                    setEmailForm({
                      to: '',
                      subject: `CloudFuze Purchase Agreement - ${previewData.template.name}`,
                      message: `Dear Client,

Please find attached the CloudFuze Purchase Agreement template with your quote data.

This document contains all the details of your proposed solution including pricing, terms, and conditions.

Please review the attached template and use the digital signature form link below to approve or reject this agreement.

If you have any questions or need any modifications, please don't hesitate to contact us.

Best regards,
CloudFuze Team`,
                          clientName: ''
                    });
                    setShowEmailModal(previewData.template.id);
                  } else {
                    alert('Please process the template with your quote data first before sending.');
                  }
                }}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
              >
                Send Mail
              </button>
              <button
                onClick={() => {
                  // Download the processed template
                  const a = document.createElement('a');
                  a.href = previewData.processedUrl;
                      a.download = `${previewData.template.name}-processed.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold"
              >
                Download Processed Template
              </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Send Template via Email</h2>
                <p className="text-gray-600">Send the processed template to your client</p>
              </div>
              <button
                onClick={() => setShowEmailModal(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Email Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    To Email *
                  </label>
                  <input
                    type="email"
                    value={emailForm.to}
                    onChange={(e) => {
                      const sanitized = sanitizeEmailInput(e.target.value);
                      setEmailForm({ ...emailForm, to: sanitized });
                    }}
                    placeholder="client@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={emailForm.clientName || ''}
                    onChange={(e) => {
                      const sanitized = sanitizeNameInput(e.target.value);
                      const processed = limitConsecutiveSpaces(sanitized);
                      setEmailForm({ ...emailForm, clientName: processed });
                    }}
                    placeholder="Client's full name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="CloudFuze Purchase Agreement"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Message *
                </label>
                <textarea
                  value={emailForm.message}
                  onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                  placeholder="Enter your message here..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  required
                />
              </div>

              {/* Template Info */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Template Attachment</span>
                </div>
                <p className="text-sm text-blue-700">
                  The processed template with your quote data will be attached to this email.
                </p>
              </div>

              {/* Signature Fields */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-sm">✍</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-800">Your Signature Required</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* E-Signature */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      E-Signature *
                    </label>
                    <input
                      type="text"
                      value={signatureForm.eSignature}
                      onChange={(e) => setSignatureForm({ ...signatureForm, eSignature: e.target.value })}
                      placeholder="Type your full name as signature"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      style={{
                        fontFamily: signatureFonts[selectedFontStyle].fontFamily,
                        fontSize: signatureFonts[selectedFontStyle].fontSize,
                        fontStyle: signatureFonts[selectedFontStyle].fontStyle,
                        fontWeight: signatureFonts[selectedFontStyle].fontWeight,
                        color: '#000000'
                      }}
                      required
                    />
                    
                    {/* Signature Font Preview */}
                    {signatureForm.eSignature && (
                      <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-600 mb-2">Choose your signature style:</p>
                        <div className="space-y-2">
                          {signatureFonts.map((font, index) => (
                            <div 
                              key={index}
                              onClick={() => setSelectedFontStyle(index)}
                              className={`p-2 border rounded cursor-pointer transition-colors ${
                                selectedFontStyle === index 
                                  ? 'border-blue-500 bg-blue-50' 
                                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                              }`}
                              style={{ minHeight: '30px', display: 'flex', alignItems: 'center' }}
                            >
                              <span 
                                className="text-gray-600 text-xs mr-2 min-w-[60px]"
                                style={{ fontFamily: 'Arial, sans-serif' }}
                              >
                                {font.name}:
                              </span>
                              <span 
                                style={{ 
                                  fontFamily: font.fontFamily,
                                  fontSize: font.fontSize,
                                  fontStyle: font.fontStyle,
                                  fontWeight: font.fontWeight,
                                  color: '#000000'
                                }}
                              >
                                {signatureForm.eSignature}
                              </span>
                              {selectedFontStyle === index && (
                                <div className="ml-auto">
                                  <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                    <span className="text-white text-xs">✓</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={signatureForm.name}
                      onChange={(e) => setSignatureForm({ ...signatureForm, name: e.target.value })}
                      placeholder="Enter your full name"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      Title/Position *
                    </label>
                    <input
                      type="text"
                      value={signatureForm.title}
                      onChange={(e) => setSignatureForm({ ...signatureForm, title: e.target.value })}
                      placeholder="e.g., Sales Manager, Director"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={signatureForm.date}
                      onChange={(e) => setSignatureForm({ ...signatureForm, date: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mt-3">
                  Please fill in all signature fields before sending the template to your client.
                </p>
              </div>

              {/* Verify Template Button */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    const template = templates.find(t => t.id === showEmailModal);
                    if (template) {
                      handleVerifyTemplate(template);
                    }
                  }}
                  disabled={
                    isVerifyingTemplate ||
                    !signatureForm.eSignature.trim() ||
                    !signatureForm.name.trim() ||
                    !signatureForm.title.trim() ||
                    !signatureForm.date
                  }
                  className="w-full px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  {isVerifyingTemplate ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Verifying Template...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Verify Template
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Click to preview the template with your signature data on the third page
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowEmailModal(null)}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const template = templates.find(t => t.id === showEmailModal);
                    if (template) {
                      handleEmailSubmit(template);
                    }
                  }}
                  disabled={
                    sendingEmail === showEmailModal ||
                    !signatureForm.eSignature.trim() ||
                    !signatureForm.name.trim() ||
                    !signatureForm.title.trim() ||
                    !signatureForm.date
                  }
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  {sendingEmail === showEmailModal ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending Email...
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
        </div>
      )}
    </div>
  );
};

export default TemplateManager;
