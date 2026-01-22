import React, { useState, useEffect, useMemo } from 'react';
import { 
  Upload, 
  FileText, 
  Edit, 
  Trash2, 
  X, 
  CheckCircle,
  AlertCircle,
  Search,
  Plus,
  Loader2,
  Eye,
  Info
} from 'lucide-react';
import { BACKEND_URL } from '../config/api';
import { detectFromFilename, getCombinationsForCategory, DetectedMetadata } from '../utils/exhibitAutoDetect';
import '../assets/docx-preview.css';

// Helper function to generate name from combination
function generateNameFromCombination(combination: string): string {
  if (!combination || combination.trim() === '' || combination === 'all') {
    return 'New Exhibit';
  }
  
  // Convert combination like "slack-to-teams" to "Slack to Teams"
  // Also handles single words like "testing" -> "Testing"
  const parts = combination.split('-');
  const formatted = parts
    .filter(part => part.trim() !== '' && part !== 'to')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  
  // If formatted is empty (e.g., only "to" was in the combination), use the original
  return formatted || combination.charAt(0).toUpperCase() + combination.slice(1).toLowerCase();
}

interface Exhibit {
  _id: string;
  id?: string;
  name: string;
  description: string;
  fileName: string;
  fileSize: number;
  category: 'messaging' | 'content' | 'email';
  combinations: string[];
  displayOrder: number;
  keywords: string[];
  isRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

const ExhibitManager: React.FC = () => {
  const [exhibits, setExhibits] = useState<Exhibit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingExhibit, setViewingExhibit] = useState<Exhibit | null>(null);
  const [isLoadingView, setIsLoadingView] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [editingExhibit, setEditingExhibit] = useState<Exhibit | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [detectedMetadata, setDetectedMetadata] = useState<DetectedMetadata | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'content' as 'messaging' | 'content' | 'email',
    combination: '',
    plan: '' as 'basic' | 'standard' | 'advanced' | '',
    includeType: '' as 'included' | 'notincluded' | '', // Include/Not Include selection
    displayOrder: 999,
    keywords: [] as string[],
    isRequired: false,
  });
  const [useCustomCombination, setUseCustomCombination] = useState(false);
  const [customCombination, setCustomCombination] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [createNewFolder, setCreateNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  // Load guide preference from localStorage (default: true for new users)
  const [showUploadGuide, setShowUploadGuide] = useState(() => {
    const saved = localStorage.getItem('exhibitUploadGuideHidden');
    return saved !== 'true'; // Show guide if not hidden
  });

  // Save guide preference when hidden
  const handleHideGuide = () => {
    setShowUploadGuide(false);
    localStorage.setItem('exhibitUploadGuideHidden', 'true');
  };

  // Show guide and clear preference
  const handleShowGuide = () => {
    setShowUploadGuide(true);
    localStorage.removeItem('exhibitUploadGuideHidden');
  };

  // Load exhibits
  useEffect(() => {
    loadExhibits();
  }, []);

  // Cleanup viewer when modal closes
  useEffect(() => {
    if (!showViewModal) {
      const container = document.getElementById('docx-viewer-container');
      if (container) {
        container.innerHTML = '';
      }
    }
  }, [showViewModal]);

  const loadExhibits = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/exhibits`);
      const data = await response.json();
      
      if (data.success) {
        // Auto-fix exhibits with "New Exhibit" name by generating from combination
        const fixedExhibits = (data.exhibits || []).map((exhibit: any) => {
          if (exhibit.name === 'New Exhibit' && exhibit.combinations && exhibit.combinations.length > 0 && exhibit.combinations[0] !== 'all') {
            const combination = exhibit.combinations[0];
            const parts = combination.split('-');
            const formatted = parts
              .filter((part: string) => part.trim() !== '' && part !== 'to')
              .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
              .join(' ');
            const newName = formatted || (combination.charAt(0).toUpperCase() + combination.slice(1).toLowerCase());
            
            // Auto-update the exhibit name in the database
            if (newName && newName !== 'New Exhibit') {
              const updateFormData = new FormData();
              updateFormData.append('name', newName);
              fetch(`${BACKEND_URL}/api/exhibits/${exhibit._id}`, {
                method: 'PUT',
                body: updateFormData
              }).catch(err => console.error('Error auto-updating exhibit name:', err));
              
              return { ...exhibit, name: newName };
            }
          }
          return exhibit;
        });
        
        setExhibits(fixedExhibits);
      }
    } catch (error) {
      console.error('Error loading exhibits:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file upload
  const handleFileSelect = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setUploadError('Please upload a DOCX file');
      return;
    }

    setUploadFile(file);
    setUploadError(null);

    // Auto-detect metadata from filename
    const detected = detectFromFilename(file.name);
    setDetectedMetadata(detected);

    // Check if detected combination is in predefined list
    const availableCombos = getCombinationsForCategory(detected.category);
    const isPredefined = detected.combination && availableCombos.some(c => c.value === detected.combination);
    
    // If combination is detected but not predefined, enable custom combination mode
    if (detected.combination && !isPredefined) {
      setUseCustomCombination(true);
      setCustomCombination(detected.combination);
    } else {
      setUseCustomCombination(false);
      setCustomCombination('');
    }

    // Populate form with detected values
    setFormData({
      name: detected.name,
      description: '',
      category: detected.category,
      combination: isPredefined ? detected.combination : '',
      plan: detected.plan as 'basic' | 'standard' | 'advanced' | '',
      includeType: detected.type as 'included' | 'notincluded' | '', // Auto-populate from detection
      displayOrder: detected.displayOrder,
      keywords: detected.keywords,
      isRequired: false,
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadFile) {
      setUploadError('Please select a file');
      return;
    }
    
    // Validate include/not include selection
    if (!formData.includeType) {
      setUploadError('Please select whether this exhibit is for included or not included features.');
      return;
    }

    if (!formData.category) {
      setUploadError('Category is required');
      return;
    }

    // Validate plan type (required)
    if (!formData.plan) {
      setUploadError('Plan Type is required. Please select Basic, Standard, or Advanced.');
      return;
    }

    // Validate folder selection
    if (!createNewFolder && !selectedFolder) {
      setUploadError('Please select a folder or create a new one');
      return;
    }
    
    if (createNewFolder && !newFolderName.trim()) {
      setUploadError('Please enter a folder name');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      // Get clean folder name first (before building combination)
      let cleanFolderName = '';
      if (createNewFolder && newFolderName.trim()) {
        cleanFolderName = newFolderName.trim();
      } else if (selectedFolder) {
        cleanFolderName = selectedFolder;
      }
      
      // Auto-generate name from combination if not provided
      // Use custom combination if checked, otherwise use formData.combination or detected metadata
      let finalCombination = '';
      
      // If creating new folder, use the new folder name
      if (createNewFolder && newFolderName.trim()) {
        finalCombination = newFolderName.toLowerCase().replace(/\s+/g, '-');
        setUseCustomCombination(true);
        setCustomCombination(newFolderName);
        
        // Append include/notinclude and plan type to the new combination
        const detectedType = formData.includeType || '';
        if (!detectedType) {
          setUploadError('Please select whether this exhibit is for included or not included features.');
          setIsUploading(false);
          return;
        }
        const planType = formData.plan || '';
        
        // Append include/notinclude and plan type if not already in the combination
        if (detectedType && !finalCombination.includes(detectedType) && !finalCombination.includes('include')) {
          finalCombination += `-${detectedType}`;
        }
        if (planType && !finalCombination.includes(planType)) {
          finalCombination += `-${planType}`;
        }
      } else if (selectedFolder) {
        finalCombination = selectedFolder.toLowerCase().replace(/\s+/g, '-');
      } else if (useCustomCombination && customCombination) {
        finalCombination = customCombination.toLowerCase().replace(/\s+/g, '-');
        
        // Extract plan type from custom combination if not already set in form
        let extractedPlan = formData.plan || detectedMetadata?.plan || '';
        if (!extractedPlan) {
          const comboLower = customCombination.toLowerCase();
          if (comboLower.includes('basic') && !comboLower.includes('standard') && !comboLower.includes('advanced')) {
            extractedPlan = 'basic';
          } else if (comboLower.includes('standard') && !comboLower.includes('advanced')) {
            extractedPlan = 'standard';
          } else if (comboLower.includes('advanced')) {
            extractedPlan = 'advanced';
          }
        }
        
        // Extract include/notinclude from custom combination if not already detected
        let extractedType = detectedMetadata?.type || '';
        if (!extractedType) {
          const comboLower = customCombination.toLowerCase();
          if (comboLower.includes('include') && !comboLower.includes('not')) {
            extractedType = 'included';
          } else if (comboLower.includes('notinclude') || comboLower.includes('not-include') || comboLower.includes('not include') || comboLower.includes('excluded')) {
            extractedType = 'notincluded';
          }
        }
        
        // For custom combinations, append include/notinclude and plan type if detected
        // This allows: testing-to-production + include + basic → testing-to-production-include-basic
        const detectedType = extractedType || detectedMetadata?.type || '';
        const planType = extractedPlan || formData.plan || detectedMetadata?.plan || '';
        
        // Only append if not already in the custom combination string
        if (detectedType && !finalCombination.includes(detectedType) && !finalCombination.includes('include')) {
          finalCombination += `-${detectedType}`;
        }
        if (planType && !finalCombination.includes(planType)) {
          finalCombination += `-${planType}`;
        }
      } else {
        // Use the clean combination from dropdown (formData.combination) instead of auto-detected
        finalCombination = formData.combination || '';
        
        // For predefined combinations, use form selection (required field)
        const detectedType = formData.includeType || '';
        if (!detectedType) {
          setUploadError('Please select whether this exhibit is for included or not included features.');
          setIsUploading(false);
          return;
        }
        
        const planType = formData.plan || detectedMetadata?.plan || '';
        
        // Only append if not already in the combination string
        if (detectedType && !finalCombination.includes(detectedType) && !finalCombination.includes('include')) {
          finalCombination += `-${detectedType}`;
        }
        if (planType && !finalCombination.includes(planType)) {
          finalCombination += `-${planType}`;
        }
      }
      
      // Generate name from clean folder name, plan type, and type
      // Use clean folder name and form values instead of auto-detected metadata with typos
      let finalName = formData.name;
      if (!finalName) {
        // Use the clean folder name we got earlier
        let folderName = cleanFolderName;
        
        // If no clean folder name, try to extract from combination
        if (!folderName) {
          // Extract base combination (remove include/notinclude and plan type suffixes)
          let baseCombination = finalCombination
            .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, '')
            .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, '');
          
          if (baseCombination && baseCombination !== finalCombination) {
            folderName = generateNameFromCombination(baseCombination);
          } else if (formData.combination) {
            folderName = generateNameFromCombination(formData.combination);
          } else {
            folderName = 'New Exhibit';
          }
        }
        
        // Try to get clean name from predefined combinations if folder name matches
        const availableCombos = getCombinationsForCategory(formData.category);
        const folderCombinationValue = folderName.toLowerCase().replace(/\s+/g, '-');
        const matchingCombo = availableCombos.find(c => c.value === folderCombinationValue);
        if (matchingCombo) {
          folderName = matchingCombo.label; // Use clean label from predefined list
        }
        
        // Use plan type from form (manually selected, clean - no typos)
        const planType = formData.plan || '';
        
        // Use includeType from form (required field, user must select)
        const type = formData.includeType || '';
        if (!type) {
          setUploadError('Please select whether this exhibit is for included or not included features.');
          setIsUploading(false);
          return;
        }
        
        // Format the name properly: "Folder Name Plan Plan - Plan Type"
        const planLabel = planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : '';
        const typeLabel = type === 'included' ? 'Include' : type === 'notincluded' ? 'Not Include' : '';
        
        if (planType && type) {
          finalName = `${folderName} ${planLabel} Plan - ${planLabel} ${typeLabel}`;
        } else if (planType) {
          finalName = `${folderName} ${planLabel} Plan`;
        } else if (type) {
          finalName = `${folderName} - ${typeLabel}`;
        } else {
          finalName = folderName || 'New Exhibit';
        }
      }
      
      const finalPlanType = formData.plan || detectedMetadata?.plan || '';
      
      const formDataToSend = new FormData();
      formDataToSend.append('file', uploadFile);
      formDataToSend.append('name', finalName);
      formDataToSend.append('description', ''); // Empty description
      formDataToSend.append('category', formData.category);
      formDataToSend.append('combinations', JSON.stringify([finalCombination || 'all']));
      formDataToSend.append('planType', finalPlanType); // Send plan type separately
      formDataToSend.append('displayOrder', formData.displayOrder.toString());
      formDataToSend.append('keywords', JSON.stringify(formData.keywords));
      formDataToSend.append('isRequired', formData.isRequired.toString());

      const response = await fetch(`${BACKEND_URL}/api/exhibits`, {
        method: 'POST',
        body: formDataToSend,
      });

      const data = await response.json();

      if (data.success) {
        setUploadSuccess('Exhibit uploaded successfully!');
        setShowUploadModal(false);
        resetForm();
        loadExhibits();
        
        // Clear success message after 3 seconds
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        setUploadError(data.error || 'Failed to upload exhibit');
      }
    } catch (error) {
      console.error('Error uploading exhibit:', error);
      setUploadError('Failed to upload exhibit. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle edit
  const handleEdit = (exhibit: Exhibit) => {
    setEditingExhibit(exhibit);
    const exhibitCombination = exhibit.combinations[0] || '';
    
    // Check if combination exists in predefined list
    const availableCombos = getCombinationsForCategory(exhibit.category);
    const isPredefined = availableCombos.some(c => c.value === exhibitCombination);
    
    // Extract plan from exhibit name or use planType field if available
    const exhibitName = exhibit.name.toLowerCase();
    let detectedPlan = '';
    if (exhibitName.includes('basic') && !exhibitName.includes('standard') && !exhibitName.includes('advanced')) {
      detectedPlan = 'basic';
    } else if (exhibitName.includes('standard') && !exhibitName.includes('advanced')) {
      detectedPlan = 'standard';
    } else if (exhibitName.includes('advanced')) {
      detectedPlan = 'advanced';
    }
    
    // Extract include/notinclude type from combination or name
    const combinationLower = exhibitCombination.toLowerCase();
    const nameLower = exhibitName;
    let detectedIncludeType: 'included' | 'notincluded' | '' = '';
    if (combinationLower.includes('not included') || 
        combinationLower.includes('not include') ||
        combinationLower.includes('notincluded') ||
        combinationLower.includes('notinclude') ||
        combinationLower.includes('not-include') ||
        combinationLower.includes('not-included') ||
        nameLower.includes('not included') ||
        nameLower.includes('not include') ||
        nameLower.includes('notincluded') ||
        nameLower.includes('notinclude') ||
        nameLower.includes('not-include') ||
        nameLower.includes('not-included') ||
        nameLower.includes('not - include') ||
        nameLower.includes('not - included')) {
      detectedIncludeType = 'notincluded';
    } else if (combinationLower.includes('included') || 
               combinationLower.includes('include') ||
               nameLower.includes('included') ||
               nameLower.includes('include')) {
      detectedIncludeType = 'included';
    }
    
    setFormData({
      name: exhibit.name,
      description: exhibit.description,
      category: exhibit.category,
      combination: isPredefined ? exhibitCombination : '',
      plan: (exhibit as any).planType || detectedPlan || '',
      includeType: detectedIncludeType, // Populate from exhibit
      displayOrder: exhibit.displayOrder,
      keywords: exhibit.keywords,
      isRequired: exhibit.isRequired,
    });
    setUseCustomCombination(!isPredefined);
    setCustomCombination(!isPredefined ? exhibitCombination : '');
    
    // Pre-select folder if exhibit belongs to one
    const baseCombination = extractBaseCombination(exhibitCombination);
    if (baseCombination && baseCombination !== 'all') {
      const folderName = baseCombination
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      setSelectedFolder(folderName);
    } else {
      setSelectedFolder('');
    }
    
    setUploadFile(null);
    setDetectedMetadata(null);
    setShowEditModal(true);
  };

  // Helper function to extract base combination (same as in ExhibitSelector)
  const extractBaseCombination = (combination: string): string => {
    if (!combination || combination === 'all') return '';
    
    let base = combination.toLowerCase();
    
    // Remove plan type suffixes
    base = base.replace(/-(basic|standard|advanced|premium|enterprise)$/, '');
    
    // Remove include/notinclude suffixes
    base = base.replace(/-(included|include|notincluded|not-include|notinclude|excluded)$/, '');
    
    // Clean up any trailing dashes
    base = base.replace(/-+$/, '').trim();
    
    return base;
  };

  // Handle update
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingExhibit) return;

    // Validate folder selection
    if (!createNewFolder && !selectedFolder) {
      setUploadError('Please select a folder or create a new one');
      return;
    }
    
    if (createNewFolder && !newFolderName.trim()) {
      setUploadError('Please enter a folder name');
      return;
    }
    
    // Validate include/not include selection
    if (!formData.includeType) {
      setUploadError('Please select whether this exhibit is for included or not included features.');
      return;
    }

    // Validate plan type (required)
    if (!formData.plan) {
      setUploadError('Plan Type is required. Please select Basic, Standard, or Advanced.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const formDataToSend = new FormData();
      if (uploadFile) {
        formDataToSend.append('file', uploadFile);
      }
      
      // Build final combination with include/notinclude and plan type
      let finalCombination = '';
      let cleanFolderName = '';
      
      // If creating new folder, use the new folder name
      if (createNewFolder && newFolderName.trim()) {
        cleanFolderName = newFolderName.trim();
        finalCombination = cleanFolderName.toLowerCase().replace(/\s+/g, '-');
        setUseCustomCombination(true);
        setCustomCombination(cleanFolderName);
      } else if (selectedFolder) {
        cleanFolderName = selectedFolder;
        finalCombination = cleanFolderName.toLowerCase().replace(/\s+/g, '-');
      } else if (useCustomCombination && customCombination) {
        cleanFolderName = customCombination;
        finalCombination = customCombination.toLowerCase().replace(/\s+/g, '-');
      } else {
        finalCombination = formData.combination || '';
        if (finalCombination) {
          cleanFolderName = generateNameFromCombination(finalCombination);
        }
      }
      
      // Use includeType from form (required field, user must select)
      const detectedType = formData.includeType || '';
      if (!detectedType) {
        setUploadError('Please select whether this exhibit is for included or not included features.');
        setIsUploading(false);
        return;
      }
      
      const planType = formData.plan || '';
      
      // Append include/notinclude and plan type to combination if creating new folder or using selected folder
      if ((createNewFolder && newFolderName.trim()) || selectedFolder) {
        if (detectedType && !finalCombination.includes(detectedType) && !finalCombination.includes('include')) {
          finalCombination += `-${detectedType}`;
        }
        if (planType && !finalCombination.includes(planType)) {
          finalCombination += `-${planType}`;
        }
      }
      
      // Only append if not already in the combination string
      if (detectedType && !finalCombination.includes(detectedType) && !finalCombination.includes('include')) {
        finalCombination += `-${detectedType}`;
      }
      if (planType && !finalCombination.includes(planType)) {
        finalCombination += `-${planType}`;
      }
      
      // Generate name from clean folder name, plan type, and type
      let finalName = formData.name;
      if (!finalName) {
        const planLabel = planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : '';
        const typeLabel = detectedType === 'included' ? 'Include' : detectedType === 'notincluded' ? 'Not Include' : '';
        
        if (planType && detectedType) {
          finalName = `${cleanFolderName} ${planLabel} Plan - ${planLabel} ${typeLabel}`;
        } else if (planType) {
          finalName = `${cleanFolderName} ${planLabel} Plan`;
        } else if (detectedType) {
          finalName = `${cleanFolderName} - ${typeLabel}`;
        } else {
          finalName = cleanFolderName || 'New Exhibit';
        }
      }
      
      const finalPlanType = formData.plan || '';
      
      formDataToSend.append('name', finalName);
      formDataToSend.append('description', ''); // Empty description
      formDataToSend.append('category', formData.category);
      formDataToSend.append('combinations', JSON.stringify([finalCombination || 'all']));
      formDataToSend.append('planType', finalPlanType);
      formDataToSend.append('displayOrder', formData.displayOrder.toString());
      formDataToSend.append('keywords', JSON.stringify(formData.keywords));
      formDataToSend.append('isRequired', formData.isRequired.toString());

      const exhibitId = editingExhibit._id || editingExhibit.id;
      const response = await fetch(`${BACKEND_URL}/api/exhibits/${exhibitId}`, {
        method: 'PUT',
        body: formDataToSend,
      });

      const data = await response.json();

      if (data.success) {
        setUploadSuccess('Exhibit updated successfully!');
        setShowEditModal(false);
        resetForm();
        loadExhibits();
        
        setTimeout(() => setUploadSuccess(null), 3000);
      } else {
        setUploadError(data.error || 'Failed to update exhibit');
      }
    } catch (error) {
      console.error('Error updating exhibit:', error);
      setUploadError('Failed to update exhibit. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to check if exhibit is older than 3 days
  const isExhibitOlderThan3Days = (exhibit: Exhibit): boolean => {
    if (!exhibit.createdAt) return false;
    
    const createdAt = new Date(exhibit.createdAt);
    const now = new Date();
    const diffTime = now.getTime() - createdAt.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24); // Convert to days
    
    return diffDays > 3;
  };

  // Handle view document (show in modal)
  const handleView = async (exhibit: Exhibit) => {
    try {
      setViewingExhibit(exhibit);
      setShowViewModal(true);
      setIsLoadingView(true);
      setViewError(null);

      const exhibitId = exhibit._id || exhibit.id;
      if (!exhibitId) {
        throw new Error('Exhibit ID is missing');
      }

      console.log('Fetching exhibit file:', exhibitId);
      const response = await fetch(`${BACKEND_URL}/api/exhibits/${exhibitId}/file`);
      
      if (!response.ok) {
        // Try to get error message from JSON response
        let errorMessage = `Failed to fetch exhibit file (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If not JSON, try text
          try {
            const errorText = await response.text();
            if (errorText) errorMessage = errorText;
          } catch {
            // Use default message
          }
        }
        console.error('Failed to fetch exhibit:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      // Check if response is actually a blob
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);

      // Check if response is JSON (error) instead of blob
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Server returned error');
      }

      const blob = await response.blob();
      console.log('Blob received, size:', blob.size);

      if (blob.size === 0) {
        throw new Error('Received empty file');
      }

      // Verify it's actually a DOCX file
      if (blob.type && !blob.type.includes('wordprocessingml') && !blob.type.includes('msword') && !blob.type.includes('octet-stream')) {
        console.warn('Unexpected file type:', blob.type);
      }

      const arrayBuffer = await blob.arrayBuffer();
      console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);

      // Wait for modal to render and ensure container exists
      let container = document.getElementById('docx-viewer-container');
      let retries = 0;
      while (!container && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        container = document.getElementById('docx-viewer-container');
        retries++;
      }

      if (!container) {
        throw new Error('Viewer container not found after waiting');
      }

      // Clear previous content
      container.innerHTML = '';

      console.log('Rendering DOCX with docx-preview...');
      // Import and render docx-preview
      const { renderAsync } = await import('docx-preview');
      await renderAsync(arrayBuffer, container as HTMLElement, undefined, {
        className: 'docx-wrapper',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        experimental: false,
        trimXmlDeclaration: true,
        useBase64URL: false,
        useMathMLPolyfill: true,
        showChanges: false,
        showInsertions: false,
        showDeletions: false,
      } as any);

      console.log('DOCX rendered successfully');
      setIsLoadingView(false);
    } catch (error: any) {
      console.error('Error viewing exhibit:', error);
      const errorMessage = error?.message || 'Failed to load document. Please try again.';
      setViewError(errorMessage);
      setIsLoadingView(false);
    }
  };

  // Handle delete
  const handleDelete = async (exhibit: Exhibit) => {
    if (!confirm(`Are you sure you want to delete "${exhibit.name}"?`)) {
      return;
    }

    try {
      const exhibitId = exhibit._id || exhibit.id;
      const response = await fetch(`${BACKEND_URL}/api/exhibits/${exhibitId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        loadExhibits();
      } else {
        alert(data.error || 'Failed to delete exhibit');
      }
    } catch (error) {
      console.error('Error deleting exhibit:', error);
      alert('Failed to delete exhibit. Please try again.');
    }
  };

  // Reset form
  const resetForm = () => {
    setUploadFile(null);
    setDetectedMetadata(null);
    setFormData({
      name: '',
      description: '',
      category: 'content',
      combination: '',
      plan: '',
      includeType: '', // Reset include/not include selection
      displayOrder: 999,
      keywords: [],
      isRequired: false,
    });
    setUseCustomCombination(false);
    setCustomCombination('');
    setSelectedFolder('');
    setCreateNewFolder(false);
    setNewFolderName('');
    setUploadError(null);
    // Don't reset guide preference - keep user's choice
  };

  // Filter and sort exhibits (newest first)
  const filteredExhibits = exhibits
    .filter(exhibit => {
      const matchesSearch = exhibit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           exhibit.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           exhibit.fileName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !filterCategory || exhibit.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      // Sort by createdAt in descending order (newest first)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Descending order (newest first)
    });

  // Extract unique folders from existing exhibits
  const availableFolders = useMemo(() => {
    const folderSet = new Set<string>();
    const folderMap = new Map<string, string>(); // Maps combination value to clean folder name
    
    exhibits.forEach(exhibit => {
      if (exhibit.combinations && exhibit.combinations.length > 0) {
        const primaryCombination = exhibit.combinations[0];
        if (primaryCombination && primaryCombination !== 'all') {
          // Extract base combination (remove include/notinclude and plan type)
          const base = primaryCombination
            .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, '')
            .replace(/-(included|include|notincluded|notinclude|not-include|basic|standard|advanced)$/i, '');
          
          if (base && base.length >= 3) {
            // Try to match with predefined combinations to get clean name
            const allCombos = getCombinationsForCategory(exhibit.category || 'content');
            const matchingCombo = allCombos.find(c => c.value === base);
            
            let folderName: string;
            if (matchingCombo) {
              // Use clean label from predefined list
              folderName = matchingCombo.label;
            } else {
              // Format for display (might have typos if not predefined)
              folderName = base
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            }
            
            // Store mapping and add to set
            folderMap.set(base, folderName);
            folderSet.add(folderName);
          }
        }
      }
    });
    return Array.from(folderSet).sort();
  }, [exhibits]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Exhibit Manager</h2>
          <p className="text-gray-600 mt-1">Manage migration exhibits</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowUploadModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Upload Exhibit
        </button>
      </div>

      {/* Success/Error Messages */}
      {uploadSuccess && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800">{uploadSuccess}</span>
        </div>
      )}

      {/* Search and Filter */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search exhibits..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Categories</option>
          <option value="messaging">Messaging</option>
          <option value="content">Content</option>
          <option value="email">Email</option>
        </select>
      </div>

      {/* Exhibits List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredExhibits.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No exhibits found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredExhibits.map((exhibit) => (
            <div
              key={exhibit._id || exhibit.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-gray-900">{exhibit.name}</h3>
                <span className={`px-2 py-1 text-xs rounded ${
                  exhibit.category === 'messaging' ? 'bg-blue-100 text-blue-800' :
                  exhibit.category === 'content' ? 'bg-green-100 text-green-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {exhibit.category}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">{exhibit.description}</p>
              <div className="text-xs text-gray-500 mb-3">
                <div>File: {exhibit.fileName}</div>
                <div>Size: {(exhibit.fileSize / 1024).toFixed(2)} KB</div>
                <div>Combinations: {exhibit.combinations.join(', ')}</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleView(exhibit)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors text-sm"
                  title="View/Download document"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                <button
                  onClick={() => handleEdit(exhibit)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors text-sm"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </button>
                {!isExhibitOlderThan3Days(exhibit) && (
                  <button
                    onClick={() => handleDelete(exhibit)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Upload New Exhibit</h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* How to Use Guide */}
              {showUploadGuide && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Info className="w-5 h-5 text-blue-600" />
                      <h4 className="text-sm font-semibold text-blue-900">How to Upload an Exhibit</h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleHideGuide}
                      className="text-blue-600 hover:text-blue-800 text-xs"
                    >
                      Hide
                    </button>
                  </div>
                  <ol className="text-xs text-blue-800 space-y-2 ml-7 list-decimal">
                    <li><strong>Select File:</strong> Click "Click to upload" and choose a DOCX file (Word document)</li>
                    <li><strong>Choose Category:</strong> Select Messaging, Content, or Email based on your document type</li>
                    <li><strong>Select Combinations Folder:</strong> Choose an existing folder from the dropdown, or check "Create new combination folder" to create a new one</li>
                    <li><strong>Plan Type:</strong> Select Basic, Standard, or Advanced (required)</li>
                    <li><strong>Include/Not Include:</strong> Select whether this exhibit is for included features or not included features</li>
                    <li><strong>Upload:</strong> Click "Upload Exhibit" button to complete</li>
                  </ol>
                </div>
              )}

              {!showUploadGuide && (
                <button
                  type="button"
                  onClick={handleShowGuide}
                  className="mb-4 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  <Info className="w-4 h-4" />
                  Show upload guide
                </button>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    File (DOCX) *
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    {uploadFile ? (
                      <div className="space-y-2">
                        <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                        <p className="text-sm font-medium">{uploadFile.name}</p>
                        <p className="text-xs text-gray-500">
                          {(uploadFile.size / 1024).toFixed(2)} KB
                        </p>
                        <button
                          type="button"
                          onClick={() => setUploadFile(null)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                        <label className="cursor-pointer">
                          <span className="text-blue-600 hover:text-blue-700">Click to upload</span>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            className="hidden"
                          />
                        </label>
                        <p className="text-xs text-gray-500 mt-2">DOCX files only</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({ ...formData, category: e.target.value as any, combination: '' });
                      setSelectedFolder(''); // Clear folder when category changes
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="messaging">Messaging</option>
                    <option value="content">Content</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                {/* Folder Selection - Required */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Folder *
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createNewFolder}
                        onChange={(e) => {
                          setCreateNewFolder(e.target.checked);
                          if (e.target.checked) {
                            setSelectedFolder('');
                            setNewFolderName('');
                          } else {
                            setNewFolderName('');
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span>Create new combination folder</span>
                    </label>
                  </div>
                  
                  {createNewFolder ? (
                    <div>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => {
                          const folderName = e.target.value;
                          setNewFolderName(folderName);
                          
                          if (folderName.trim()) {
                            // Convert folder name to combination format
                            const combinationValue = folderName
                              .toLowerCase()
                              .replace(/\s+/g, '-');
                            
                            // Check if it's a predefined combination
                            const availableCombos = getCombinationsForCategory(formData.category);
                            const isPredefined = availableCombos.some(c => c.value === combinationValue);
                            
                            if (isPredefined) {
                              setUseCustomCombination(false);
                              setCustomCombination('');
                              setFormData({ ...formData, combination: combinationValue });
                            } else {
                              setUseCustomCombination(true);
                              setCustomCombination(folderName);
                              setFormData({ ...formData, combination: combinationValue });
                            }
                          }
                        }}
                        placeholder="Enter combination folder name (e.g., Testing to Production)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Enter a name for the new combination folder. This will be used to group related exhibits together.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={selectedFolder}
                        onChange={(e) => {
                          const folderName = e.target.value;
                          setSelectedFolder(folderName);
                          
                          if (folderName) {
                            // Convert folder name back to combination format
                            const combinationValue = folderName
                              .toLowerCase()
                              .replace(/\s+/g, '-');
                            
                            // Check if it's a predefined combination
                            const availableCombos = getCombinationsForCategory(formData.category);
                            const isPredefined = availableCombos.some(c => c.value === combinationValue);
                            
                            if (isPredefined) {
                              setUseCustomCombination(false);
                              setCustomCombination('');
                              setFormData({ ...formData, combination: combinationValue });
                            } else {
                              setUseCustomCombination(true);
                              setCustomCombination(folderName);
                              setFormData({ ...formData, combination: combinationValue });
                            }
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select existing combination</option>
                        {availableFolders.length > 0 ? (
                          availableFolders.map((folder) => (
                            <option key={folder} value={folder}>
                              {folder}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No existing combinations. Check "Create new combination folder" to add one.</option>
                        )}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Select an existing combination folder to group this exhibit with others.
                      </p>
                    </div>
                  )}
                </div>

                {/* Combination field is hidden - automatically set from folder selection */}

                {/* Plan Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plan Type *
                  </label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a plan</option>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select the plan this exhibit applies to (Basic, Standard, or Advanced).
                  </p>
                </div>

                {/* Include/Not Include Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Include / Not Include *
                  </label>
                  <select
                    value={formData.includeType}
                    onChange={(e) => setFormData({ ...formData, includeType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select an option</option>
                    <option value="included">Include</option>
                    <option value="notincluded">Not Include</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select whether this exhibit is for included or not included features.
                  </p>
                </div>

                {/* Error Message */}
                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm text-red-800">{uploadError}</span>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Exhibit'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal - Similar to Upload Modal but with update handler */}
      {showEditModal && editingExhibit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Edit Exhibit</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                    setEditingExhibit(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-4">
                {/* File Upload (Optional for edit) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Update File (Optional)
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    {uploadFile ? (
                      <div className="space-y-2">
                        <FileText className="w-12 h-12 text-blue-600 mx-auto" />
                        <p className="text-sm font-medium">{uploadFile.name}</p>
                        <button
                          type="button"
                          onClick={() => setUploadFile(null)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">Current: {editingExhibit.fileName}</p>
                        <label className="cursor-pointer">
                          <span className="text-blue-600 hover:text-blue-700">Upload new file</span>
                          <input
                            type="file"
                            accept=".docx"
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            className="hidden"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Same form fields as upload modal */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({ ...formData, category: e.target.value as any, combination: '' });
                      setSelectedFolder(''); // Clear folder when category changes
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="messaging">Messaging</option>
                    <option value="content">Content</option>
                    <option value="email">Email</option>
                  </select>
                </div>

                {/* Folder Selection - Required */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Folder *
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createNewFolder}
                        onChange={(e) => {
                          setCreateNewFolder(e.target.checked);
                          if (e.target.checked) {
                            setSelectedFolder('');
                            setNewFolderName('');
                          } else {
                            setNewFolderName('');
                          }
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span>Create new combination folder</span>
                    </label>
                  </div>
                  
                  {createNewFolder ? (
                    <div>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => {
                          const folderName = e.target.value;
                          setNewFolderName(folderName);
                          
                          if (folderName.trim()) {
                            // Convert folder name to combination format
                            const combinationValue = folderName
                              .toLowerCase()
                              .replace(/\s+/g, '-');
                            
                            // Check if it's a predefined combination
                            const availableCombos = getCombinationsForCategory(formData.category);
                            const isPredefined = availableCombos.some(c => c.value === combinationValue);
                            
                            if (isPredefined) {
                              setUseCustomCombination(false);
                              setCustomCombination('');
                              setFormData({ ...formData, combination: combinationValue });
                            } else {
                              setUseCustomCombination(true);
                              setCustomCombination(folderName);
                              setFormData({ ...formData, combination: combinationValue });
                            }
                          }
                        }}
                        placeholder="Enter combination folder name (e.g., Testing to Production)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Enter a name for the new combination folder. This will be used to group related exhibits together.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <select
                        value={selectedFolder}
                        onChange={(e) => {
                          const folderName = e.target.value;
                          setSelectedFolder(folderName);
                          
                          if (folderName) {
                            // Convert folder name back to combination format
                            const combinationValue = folderName
                              .toLowerCase()
                              .replace(/\s+/g, '-');
                            
                            // Check if it's a predefined combination
                            const availableCombos = getCombinationsForCategory(formData.category);
                            const isPredefined = availableCombos.some(c => c.value === combinationValue);
                            
                            if (isPredefined) {
                              setUseCustomCombination(false);
                              setCustomCombination('');
                              setFormData({ ...formData, combination: combinationValue });
                            } else {
                              setUseCustomCombination(true);
                              setCustomCombination(folderName);
                              setFormData({ ...formData, combination: combinationValue });
                            }
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      >
                        <option value="">Select existing combination</option>
                        {availableFolders.length > 0 ? (
                          availableFolders.map((folder) => (
                            <option key={folder} value={folder}>
                              {folder}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No existing combinations. Check "Create new combination folder" to add one.</option>
                        )}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">
                        Select an existing combination folder to group this exhibit with others.
                      </p>
                    </div>
                  )}
                </div>

                {/* Combination field is hidden - automatically set from folder selection */}

                {/* Plan Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plan Type *
                  </label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select a plan</option>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select the plan this exhibit applies to (Basic, Standard, or Advanced).
                  </p>
                </div>

                {/* Include/Not Include Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Include / Not Include *
                  </label>
                  <select
                    value={formData.includeType}
                    onChange={(e) => setFormData({ ...formData, includeType: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select an option</option>
                    <option value="included">Include</option>
                    <option value="notincluded">Not Include</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Select whether this exhibit is for included or not included features.
                  </p>
                </div>

                {uploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm text-red-800">{uploadError}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false);
                      resetForm();
                      setEditingExhibit(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUploading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Exhibit'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* View Document Modal */}
      {showViewModal && viewingExhibit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-gray-900">View Document</h3>
                <p className="text-sm text-gray-600 mt-1">{viewingExhibit.name}</p>
              </div>
              <button
                onClick={() => {
                  // Clean up viewer container
                  const container = document.getElementById('docx-viewer-container');
                  if (container) {
                    container.innerHTML = '';
                  }
                  setShowViewModal(false);
                  setViewingExhibit(null);
                  setViewError(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50 relative">
              {isLoadingView && (
                <div className="flex flex-col items-center justify-center py-12 absolute inset-0 bg-gray-50 z-10">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                  <p className="text-gray-600">Loading document...</p>
                </div>
              )}
              {viewError && !isLoadingView && (
                <div className="flex flex-col items-center justify-center py-12 absolute inset-0 bg-gray-50 z-10">
                  <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                  <p className="text-red-600 text-center mb-2 max-w-md">{viewError}</p>
                  <button
                    onClick={() => handleView(viewingExhibit)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}
              {/* Always render container for docx-preview */}
              <div className="bg-white shadow-sm rounded-lg min-h-full overflow-auto">
                <div 
                  id="docx-viewer-container" 
                  className="docx-viewer"
                  style={{ 
                    minHeight: '100%',
                    padding: '20px',
                    display: isLoadingView || viewError ? 'none' : 'block'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExhibitManager;
