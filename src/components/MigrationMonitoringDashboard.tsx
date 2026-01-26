import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, BarChart3, CheckCircle, AlertCircle, Eye, FileText, Server, Users, TrendingUp, Calendar as CalendarIcon, Plus, X, Edit2, Save, FolderPlus, Trash2, Upload, Download, ArrowLeft } from 'lucide-react';
import { useApprovalWorkflows } from '../hooks/useApprovalWorkflows';
import { BACKEND_URL } from '../config/api';
import { useLocation, useNavigate } from 'react-router-dom';
import Navigation from './Navigation';

interface Batch {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  serverId?: string; // Linked server ID
  status?: 'not-started' | 'processing' | 'completed'; // Batch status
}

interface Server {
  id: string;
  name: string;
  batchIds: string[]; // Linked batch IDs
}

interface UploadedDocument {
  id: string;
  name: string;
  file: File | null;
  uploadedAt: string;
  type: string;
  fileData?: string; // Base64 data for localStorage persistence
  mongoId?: string; // MongoDB document ID
  projectId?: string; // Project ID for reference
}

interface Project {
  id: string;
  projectName: string;
  migrationType: string;
  combinationName: string;
  managerName: string;
  clientName: string;
  companyName: string;
  numberOfAdminAccounts: number;
  startDate: string;
  endDate: string;
  batches: Batch[];
  servers: Server[];
  documents: UploadedDocument[];
  timelineTransition?: string;
  createdAt: string;
}

interface MigrationMonitoringDashboardProps {
}

const MigrationMonitoringDashboard: React.FC<MigrationMonitoringDashboardProps> = () => {
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMode, setCalendarMode] = useState<'start' | 'end' | 'batch-start' | 'batch-end'>('start');
  const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectDashboard, setShowProjectDashboard] = useState(false);
  
  // Project form fields
  const [projectName, setProjectName] = useState('');
  const [migrationType, setMigrationType] = useState('');
  const [combinationName, setCombinationName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [numberOfAdminAccounts, setNumberOfAdminAccounts] = useState<number>(1);
  
  // Edit admin accounts state
  const [editingAdminAccounts, setEditingAdminAccounts] = useState<string | null>(null);
  const [tempAdminAccounts, setTempAdminAccounts] = useState<number>(1);
  
  // Batch form fields
  const [batchName, setBatchName] = useState('');
  const [batchStartDate, setBatchStartDate] = useState<Date | null>(null);
  const [batchEndDate, setBatchEndDate] = useState<Date | null>(null);
  const [showBatchCalendar, setShowBatchCalendar] = useState(false);
  
  // Server form fields
  const [serverName, setServerName] = useState('');
  const [showServerModal, setShowServerModal] = useState(false);
  const [showBatchServerLinkModal, setShowBatchServerLinkModal] = useState(false);
  const [selectedServerForLinking, setSelectedServerForLinking] = useState<Server | null>(null);
  
  // File upload and view
  const [showDocumentTimeline, setShowDocumentTimeline] = useState(false);
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<UploadedDocument | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  
  const { workflows } = useApprovalWorkflows();
  
  const location = useLocation();
  const navigate = useNavigate();
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.includes('migration-monitoring')) return 'migration-monitoring';
    return 'migration-monitoring';
  };

  const handleBack = () => {
    navigate('/migration-manager'); // Navigate to Migration Manager Dashboard
  };

  // Load projects from localStorage on mount
  useEffect(() => {
    const savedProjects = localStorage.getItem('migration_projects');
    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects);
        // Ensure all projects have batches and servers arrays
        const normalizedProjects = parsed.map((p: Project) => ({
          ...p,
          batches: (p.batches || []).map((b: Batch) => ({
            ...b,
            status: b.status || 'not-started'
          })),
          servers: p.servers || [],
          documents: (p.documents || []).map((doc: UploadedDocument) => ({
            ...doc,
            file: null // File objects can't be serialized, set to null
          })),
          numberOfAdminAccounts: p.numberOfAdminAccounts || 1
        }));
        setProjects(normalizedProjects);
      } catch (e) {
        console.error('Error loading projects:', e);
      }
    }
  }, []);

  // Save projects to localStorage whenever they change
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem('migration_projects', JSON.stringify(projects));
    }
  }, [projects]);

  // Get calendar days for current month
  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const handleDateClick = (date: Date) => {
    if (calendarMode === 'start') {
      setSelectedStartDate(date);
      setCalendarMode('end');
    } else if (calendarMode === 'end') {
      if (selectedStartDate && date < selectedStartDate) {
        alert('End date must be after start date');
        return;
      }
      setSelectedEndDate(date);
      setShowCalendarModal(false);
      setShowAddProjectModal(true);
    } else if (calendarMode === 'batch-start') {
      setBatchStartDate(date);
      setCalendarMode('batch-end');
    } else if (calendarMode === 'batch-end') {
      if (batchStartDate && date < batchStartDate) {
        alert('End date must be after start date');
        return;
      }
      setBatchEndDate(date);
      // Keep calendar open so user can see both dates and enter batch name
    }
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setShowProjectDashboard(true);
  };

  const handleAddBatch = () => {
    if (!batchName.trim()) {
      alert('Please enter batch name');
      return;
    }
    if (!batchStartDate || !batchEndDate) {
      alert('Please select both start and end dates');
      return;
    }

    if (!selectedProject) return;

    const newBatch: Batch = {
      id: `batch-${Date.now()}`,
      name: batchName.trim(),
      startDate: batchStartDate.toISOString().split('T')[0],
      endDate: batchEndDate.toISOString().split('T')[0],
      status: 'not-started'
    };

    setProjects(prev => {
      const updated = prev.map(p => 
        p.id === selectedProject.id 
          ? { ...p, batches: [...(p.batches || []), newBatch] }
          : p
      );
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });

    setBatchName('');
    setBatchStartDate(null);
    setBatchEndDate(null);
    setCalendarMode('batch-start');
    setShowBatchCalendar(false);
  };

  const handleAddServer = () => {
    if (!serverName.trim()) {
      alert('Please enter server name');
      return;
    }

    if (!selectedProject) return;

    const newServer: Server = {
      id: `server-${Date.now()}`,
      name: serverName.trim(),
      batchIds: []
    };

    setProjects(prev => prev.map(p => 
      p.id === selectedProject.id 
        ? { ...p, servers: [...p.servers, newServer] }
        : p
    ));

    setServerName('');
    setShowServerModal(false);
    
    // Update selected project
    setSelectedProject(prev => prev ? { ...prev, servers: [...prev.servers, newServer] } : null);

    // If there are batches, show linking modal
    if (selectedProject.batches && selectedProject.batches.length > 0) {
      setSelectedServerForLinking(newServer);
      setShowBatchServerLinkModal(true);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !selectedProject) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc
      'text/csv',
      'application/vnd.ms-excel' // .xls
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.csv', '.xls', '.xlsx'];

    const filesToUpload: File[] = [];
    Array.from(files).forEach((file) => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension)) {
        filesToUpload.push(file);
      } else {
        alert(`File "${file.name}" is not a valid format. Please upload Word (.docx), PDF (.pdf), or CSV (.csv) files.`);
      }
    });

    if (filesToUpload.length === 0) return;

    // Upload files to MongoDB
    const validFiles: UploadedDocument[] = [];
    
    for (const file of filesToUpload) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('clientName', selectedProject.clientName);
        formData.append('company', selectedProject.companyName);
        formData.append('projectId', selectedProject.id);

        const response = await fetch(`${BACKEND_URL}/api/documents/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        const result = await response.json();
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        
        const document: UploadedDocument = {
          id: `doc-${Date.now()}-${Math.random()}`,
          name: file.name,
          file: file, // Keep file for current session
          uploadedAt: new Date().toISOString(),
          type: fileExtension,
          mongoId: result.document?.id || result.documentId,
          projectId: selectedProject.id
        };
        
        validFiles.push(document);
        console.log(`✅ File "${file.name}" saved to MongoDB with ID: ${document.mongoId}`);
      } catch (error) {
        console.error(`❌ Error uploading ${file.name}:`, error);
        alert(`Failed to upload ${file.name}. Please try again.`);
      }
    }

    if (validFiles.length > 0) {
      setProjects(prev => prev.map(p => 
        p.id === selectedProject.id 
          ? { ...p, documents: [...(p.documents || []), ...validFiles] }
          : p
      ));
      
      setSelectedProject(prev => prev ? { 
        ...prev, 
        documents: [...(prev.documents || []), ...validFiles] 
      } : null);
      
      alert(`Successfully uploaded ${validFiles.length} file(s) to MongoDB`);
    }

    // Reset input
    event.target.value = '';
  };

  const handleLinkBatchToServer = (batchId: string, serverId: string) => {
    if (!selectedProject) return;

    setProjects(prev => prev.map(p => {
      if (p.id === selectedProject.id) {
        const updatedBatches = p.batches.map(b => 
          b.id === batchId ? { ...b, serverId } : b
        );
        const updatedServers = p.servers.map(s => 
          s.id === serverId 
            ? { ...s, batchIds: [...s.batchIds.filter(id => id !== batchId), batchId] }
            : { ...s, batchIds: s.batchIds.filter(id => id !== batchId) }
        );
        return { ...p, batches: updatedBatches, servers: updatedServers };
      }
      return p;
    }));

    // Update selected project
    setSelectedProject(prev => {
      if (!prev) return null;
      const updatedBatches = prev.batches.map(b => 
        b.id === batchId ? { ...b, serverId } : b
      );
      const updatedServers = prev.servers.map(s => 
        s.id === serverId 
          ? { ...s, batchIds: [...s.batchIds.filter(id => id !== batchId), batchId] }
          : { ...s, batchIds: s.batchIds.filter(id => id !== batchId) }
      );
      return { ...prev, batches: updatedBatches, servers: updatedServers };
    });
  };

  const handleDeleteServer = (serverId: string) => {
    if (!selectedProject) return;
    
    if (!window.confirm('Are you sure you want to delete this server? This will unlink all associated batches.')) {
      return;
    }

    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === selectedProject.id) {
          // Remove server and unlink batches from this server
          const updatedServers = p.servers.filter(s => s.id !== serverId);
          const updatedBatches = p.batches.map(b => 
            b.serverId === serverId ? { ...b, serverId: undefined } : b
          );
          return { ...p, servers: updatedServers, batches: updatedBatches };
        }
        return p;
      });
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });
  };

  const handleDeleteBatch = (batchId: string) => {
    if (!selectedProject) return;
    
    if (!window.confirm('Are you sure you want to delete this batch?')) {
      return;
    }

    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === selectedProject.id) {
          // Remove batch and unlink from servers
          const updatedBatches = p.batches.filter(b => b.id !== batchId);
          const updatedServers = p.servers.map(s => ({
            ...s,
            batchIds: s.batchIds.filter(id => id !== batchId)
          }));
          return { ...p, batches: updatedBatches, servers: updatedServers };
        }
        return p;
      });
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });
  };

  const handleStartBatch = (batchId: string) => {
    if (!selectedProject) return;
    
    // Find the batch and its server
    const batch = selectedProject.batches.find(b => b.id === batchId);
    if (!batch || !batch.serverId) return;
    
    // Check if any other batch in the same server is processing
    const server = selectedProject.servers.find(s => s.id === batch.serverId);
    if (server) {
      const otherBatchesInServer = selectedProject.batches.filter(
        b => b.serverId === batch.serverId && b.id !== batchId
      );
      const hasProcessingBatch = otherBatchesInServer.some(b => b.status === 'processing');
      
      if (hasProcessingBatch) {
        alert('Cannot start this batch. Another batch in the same server is still processing. Please complete it first.');
        return;
      }
    }
    
    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === selectedProject.id) {
          const updatedBatches = p.batches.map(b => 
            b.id === batchId ? { ...b, status: 'processing' as const } : b
          );
          return { ...p, batches: updatedBatches };
        }
        return p;
      });
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });
  };

  const handleCompleteBatch = (batchId: string) => {
    if (!selectedProject) return;
    
    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === selectedProject.id) {
          const updatedBatches = p.batches.map(b => 
            b.id === batchId ? { ...b, status: 'completed' as const } : b
          );
          return { ...p, batches: updatedBatches };
        }
        return p;
      });
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });
  };

  const handleDownloadTimeline = async () => {
    if (!selectedProject || !selectedProject.documents || selectedProject.documents.length === 0) {
      alert('No documents to download');
      return;
    }

    try {
      // Download each document
      for (const doc of selectedProject.documents) {
        if (doc.mongoId) {
          // Download from MongoDB
          const response = await fetch(`${BACKEND_URL}/api/documents/${doc.mongoId}/file`);
          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }
        } else if (doc.file) {
          // Download from in-memory file
          const url = URL.createObjectURL(doc.file);
          const a = document.createElement('a');
          a.href = url;
          a.download = doc.name;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }
        // Small delay between downloads to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      alert(`Successfully downloaded ${selectedProject.documents.length} document(s)`);
    } catch (error) {
      console.error('Error downloading timeline:', error);
      alert('Error downloading timeline documents. Please try again.');
    }
  };

  const handleDeleteDocument = async (docId: string, mongoId?: string) => {
    if (!selectedProject) return;
    
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    // Delete from MongoDB if mongoId exists
    if (mongoId) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/documents/${mongoId}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          console.log(`✅ Document deleted from MongoDB: ${mongoId}`);
        } else {
          console.error(`❌ Failed to delete document from MongoDB: ${mongoId}`);
        }
      } catch (error) {
        console.error('❌ Error deleting document from MongoDB:', error);
      }
    }

    // Remove from project's documents array
    setProjects(prev => {
      const updated = prev.map(p => {
        if (p.id === selectedProject.id) {
          const updatedDocuments = p.documents.filter(d => d.id !== docId);
          return { ...p, documents: updatedDocuments };
        }
        return p;
      });
      // Update selected project from updated projects array
      const updatedProject = updated.find(p => p.id === selectedProject.id);
      if (updatedProject) {
        setSelectedProject(updatedProject);
      }
      return updated;
    });
  };

  const calculateDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    return diffDays;
  };

  const getDayNumbers = (startDate: string, endDate: string): number[] => {
    const days = calculateDays(startDate, endDate);
    return Array.from({ length: days }, (_, i) => i + 1);
  };

  const handleViewDocument = async (doc: UploadedDocument) => {
    console.log('🔍 View document clicked:', doc);
    
    try {
      setPreviewDocument(doc);
      const fileExtension = doc.type.toLowerCase();
      
      // If file is available in memory, use it directly
      if (doc.file) {
        console.log('📄 Using in-memory file for preview');
        if (fileExtension === '.pdf') {
          const url = URL.createObjectURL(doc.file);
          setPreviewContent(url);
          setShowDocumentPreview(true);
        } else if (fileExtension === '.csv') {
          const text = await doc.file.text();
          setPreviewContent(text);
          setShowDocumentPreview(true);
        } else if (fileExtension === '.docx' || fileExtension === '.doc' || 
                   fileExtension === '.xls' || fileExtension === '.xlsx') {
          const url = URL.createObjectURL(doc.file);
          setPreviewContent(url);
          setShowDocumentPreview(true);
        } else {
          const url = URL.createObjectURL(doc.file);
          window.open(url, '_blank');
        }
        return;
      }
      
      // If file not in memory but we have MongoDB ID, fetch from server
      if (doc.mongoId) {
        console.log('📥 Fetching document from MongoDB:', doc.mongoId);
        try {
          const response = await fetch(`${BACKEND_URL}/api/documents/${doc.mongoId}/file`);
          if (response.ok) {
            const blob = await response.blob();
            console.log('✅ Document fetched successfully, size:', blob.size);
            
            if (fileExtension === '.pdf') {
              const url = URL.createObjectURL(blob);
              setPreviewContent(url);
              setShowDocumentPreview(true);
            } else if (fileExtension === '.csv') {
              const text = await blob.text();
              setPreviewContent(text);
              setShowDocumentPreview(true);
            } else if (fileExtension === '.docx' || fileExtension === '.doc' || 
                       fileExtension === '.xls' || fileExtension === '.xlsx') {
              // For Word/Excel, try using Office Online Viewer with MongoDB URL
              const fileUrl = `${BACKEND_URL}/api/documents/${doc.mongoId}/file`;
              // Office Online Viewer requires a publicly accessible URL
              const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
              setPreviewContent(viewerUrl);
              setShowDocumentPreview(true);
            } else {
              // For other file types, create blob URL
              const url = URL.createObjectURL(blob);
              setPreviewContent(url);
              setShowDocumentPreview(true);
            }
          } else {
            const errorText = await response.text();
            console.error('❌ Failed to fetch document:', response.status, errorText);
            alert(`Failed to load document from server (${response.status}). Please try again.`);
          }
        } catch (error) {
          console.error('❌ Error fetching document:', error);
          alert('Failed to load document. Please try again.');
        }
      } else {
        console.warn('⚠️ No file or mongoId available for document:', doc.id);
        alert('File not available. Please re-upload the document.');
      }
    } catch (error) {
      console.error('❌ Error in handleViewDocument:', error);
      alert('An error occurred while trying to view the document. Please try again.');
    }
  };

  const handleAddProject = () => {
    if (!projectName.trim() || !migrationType.trim() || !combinationName.trim() || 
        !managerName.trim() || !clientName.trim() || !companyName.trim()) {
      alert('Please fill in all fields');
      return;
    }

    if (!selectedStartDate || !selectedEndDate) {
      alert('Please select both start and end dates');
      return;
    }

    const newProject: Project = {
      id: `project-${Date.now()}`,
      projectName: projectName.trim(),
      migrationType: migrationType.trim(),
      combinationName: combinationName.trim(),
      managerName: managerName.trim(),
      clientName: clientName.trim(),
      companyName: companyName.trim(),
      numberOfAdminAccounts: numberOfAdminAccounts || 1,
      startDate: selectedStartDate.toISOString().split('T')[0],
      endDate: selectedEndDate.toISOString().split('T')[0],
      batches: [],
      servers: [],
      documents: [],
      createdAt: new Date().toISOString()
    };

    setProjects(prev => [...prev, newProject]);
    
    // Reset form
    setProjectName('');
    setMigrationType('');
    setCombinationName('');
    setManagerName('');
    setClientName('');
    setCompanyName('');
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setShowAddProjectModal(false);
    
    alert('Project created successfully!');
  };

  const handleStartAddProject = () => {
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setCalendarMode('start');
    setCurrentMonth(new Date());
    setShowCalendarModal(true);
  };

  const calendarDays = getCalendarDays();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentTab={getCurrentTab()} />
      
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200 ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors font-semibold"
              title="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-indigo-600" />
              </div>
              <h1 className="text-4xl font-bold text-gray-900">Migration Monitoring Dashboard</h1>
            </div>
            <p className="text-xl text-gray-600">Track migration progress and completion percentages</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 ml-64">
        <div className="space-y-6">
          {/* Add Project Button */}
          <div className="flex justify-start">
            <button
              onClick={handleStartAddProject}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-semibold"
            >
              <FolderPlus className="w-5 h-5" />
              Add Project
            </button>
          </div>

          {/* Projects List */}
          {projects.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map((project) => (
                <div 
                  key={project.id} 
                  onClick={() => handleProjectClick(project)}
                  className="bg-white rounded-lg shadow-md border border-gray-200 p-6 cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{project.projectName}</h3>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p><span className="font-semibold">Migration Type:</span> {project.migrationType}</p>
                        <p><span className="font-semibold">Combination:</span> {project.combinationName}</p>
                        <p><span className="font-semibold">Manager:</span> {project.managerName}</p>
                        <p><span className="font-semibold">Client:</span> {project.clientName}</p>
                        <p><span className="font-semibold">Company:</span> {project.companyName}</p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        <span className="font-semibold">Start:</span> {new Date(project.startDate).toLocaleDateString()}
                      </span>
                      <span className="text-gray-600">
                        <span className="font-semibold">End:</span> {new Date(project.endDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {projects.length === 0 && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
              <FolderPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No projects created yet. Click "Add Project" to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* Calendar Modal */}
      {showCalendarModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                Select {calendarMode === 'start' ? 'Start' : 'End'} Date
              </h2>
              <button
                onClick={() => {
                  setShowCalendarModal(false);
                  setSelectedStartDate(null);
                  setSelectedEndDate(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-indigo-600" />
                    {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigateMonth('prev')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <span className="text-gray-600 text-xs">←</span>
                    </button>
                    <button
                      onClick={() => setCurrentMonth(new Date())}
                      className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => navigateMonth('next')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <span className="text-gray-600 text-xs">→</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center font-medium text-gray-600 text-[10px] py-1">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="aspect-square"></div>;
                    }

                    const isToday = date.toDateString() === new Date().toDateString();
                    const isStartDate = selectedStartDate && date.toDateString() === selectedStartDate.toDateString();
                    const isEndDate = selectedEndDate && date.toDateString() === selectedEndDate.toDateString();
                    const isInRange = selectedStartDate && selectedEndDate && 
                      date >= selectedStartDate && date <= selectedEndDate;
                    const isBeforeStart = selectedStartDate && date < selectedStartDate;

                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => handleDateClick(date)}
                        disabled={calendarMode === 'end' && isBeforeStart}
                        className={`aspect-square p-1 rounded border transition-all ${
                          isStartDate || isEndDate
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                            : isInRange
                            ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                            : isToday
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        } ${isBeforeStart && calendarMode === 'end' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="text-xs font-medium">{date.getDate()}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedStartDate && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Start Date:</span> {selectedStartDate.toLocaleDateString()}
                  </p>
                  {selectedEndDate && (
                    <p className="text-sm text-gray-700 mt-1">
                      <span className="font-semibold">End Date:</span> {selectedEndDate.toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Project Form Modal */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-gray-900">Create New Project</h2>
              <button
                onClick={() => {
                  setShowAddProjectModal(false);
                  setProjectName('');
                  setMigrationType('');
                  setCombinationName('');
                  setManagerName('');
                  setClientName('');
                  setCompanyName('');
                  setSelectedStartDate(null);
                  setSelectedEndDate(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Date Summary */}
              {selectedStartDate && selectedEndDate && (
                <div className="bg-indigo-50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-gray-700">Start Date:</span>
                      <p className="text-gray-900">{selectedStartDate.toLocaleDateString()}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">End Date:</span>
                      <p className="text-gray-900">{selectedEndDate.toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Project Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Migration Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Migration Type <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={migrationType}
                  onChange={(e) => setMigrationType(e.target.value)}
                  placeholder="Enter migration type"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Combination Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Combination Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={combinationName}
                  onChange={(e) => setCombinationName(e.target.value)}
                  placeholder="Enter combination name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Manager Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manager Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Enter manager name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Client Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter company name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0">
              <button
                onClick={() => {
                  setShowAddProjectModal(false);
                  setProjectName('');
                  setMigrationType('');
                  setCombinationName('');
                  setManagerName('');
                  setClientName('');
                  setCompanyName('');
                  setNumberOfAdminAccounts(1);
                  setSelectedStartDate(null);
                  setSelectedEndDate(null);
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddProject}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Dashboard Modal */}
      {showProjectDashboard && selectedProject && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <div className="w-full h-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setShowProjectDashboard(false);
                    setSelectedProject(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors font-semibold"
                  title="Go back to Migration Monitoring Dashboard"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back
                </button>
                <h2 className="text-2xl font-bold text-gray-900">{selectedProject.projectName} - Dashboard</h2>
              </div>
              <button
                onClick={() => {
                  setShowProjectDashboard(false);
                  setSelectedProject(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Project Info */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Migration Type</span>
                      <p className="text-base font-semibold text-gray-900 mt-1">{selectedProject.migrationType}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Client</span>
                      <p className="text-base font-semibold text-gray-900 mt-1">{selectedProject.clientName}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Number of Admin Account</span>
                      {editingAdminAccounts === selectedProject.id ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="number"
                            value={tempAdminAccounts}
                            onChange={(e) => setTempAdminAccounts(parseInt(e.target.value) || 1)}
                            min="1"
                            className="w-20 px-3 py-1.5 border-2 border-indigo-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              setProjects(prev => prev.map(p => 
                                p.id === selectedProject.id 
                                  ? { ...p, numberOfAdminAccounts: tempAdminAccounts }
                                  : p
                              ));
                              setSelectedProject(prev => prev ? { ...prev, numberOfAdminAccounts: tempAdminAccounts } : null);
                              setEditingAdminAccounts(null);
                            }}
                            className="p-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                            title="Save"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingAdminAccounts(null);
                              setTempAdminAccounts(selectedProject.numberOfAdminAccounts || 1);
                            }}
                            className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            title="Cancel"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-base font-semibold text-gray-900">{selectedProject.numberOfAdminAccounts || 1}</p>
                          <button
                            onClick={() => {
                              setEditingAdminAccounts(selectedProject.id);
                              setTempAdminAccounts(selectedProject.numberOfAdminAccounts || 1);
                            }}
                            className="p-1 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Manager</span>
                      <p className="text-base font-semibold text-gray-900 mt-1">{selectedProject.managerName}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Combination</span>
                      <p className="text-base font-semibold text-gray-900 mt-1">{selectedProject.combinationName}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Company</span>
                      <p className="text-base font-semibold text-gray-900 mt-1">{selectedProject.companyName}</p>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="mt-6 flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold cursor-pointer shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                    <Upload className="w-4 h-4" />
                    Upload Document
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.csv,.xls,.xlsx"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => {
                      setServerName('');
                      setShowServerModal(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Server
                  </button>
                  <button
                    onClick={() => {
                      setBatchName('');
                      setBatchStartDate(null);
                      setBatchEndDate(null);
                      setCalendarMode('batch-start');
                      setCurrentMonth(new Date());
                      setShowBatchCalendar(true);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Batch
                  </button>
                  {selectedProject.documents && selectedProject.documents.length > 0 && (
                    <button
                      onClick={handleDownloadTimeline}
                      className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all font-semibold shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                      title={`Download ${selectedProject.documents.length} document(s)`}
                    >
                      <Download className="w-4 h-4" />
                      Download ({selectedProject.documents.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Servers and Batches Sections */}
              {selectedProject.servers && selectedProject.servers.length > 0 ? (
                <div className="space-y-6">
                  {selectedProject.servers.map((server) => {
                    const linkedBatches = selectedProject.batches?.filter(b => server.batchIds?.includes(b.id)) || [];
                    return (
                      <div key={server.id} className="space-y-4">
                        {/* Server Section */}
                        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                          <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-3">
                            <div className="flex items-center justify-between">
                              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Server className="w-5 h-5" />
                                Server {server.name}
                              </h3>
                              <button
                                onClick={() => handleDeleteServer(server.id)}
                                className="p-1.5 text-white hover:bg-white/20 rounded-lg transition-colors"
                                title="Delete server"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <div className="p-5">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="text-lg font-semibold text-gray-900 mb-2">{server.name}</h4>
                                {linkedBatches.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-xs font-medium text-gray-500">Linked to:</span>
                                    {linkedBatches.map(b => (
                                      <span key={b.id} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-md text-xs font-semibold">
                                        {b.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p 
                                    onClick={() => {
                                      if (selectedProject.batches && selectedProject.batches.length > 0) {
                                        setSelectedServerForLinking(server);
                                        setShowBatchServerLinkModal(true);
                                      }
                                    }}
                                    className="text-sm text-orange-600 mt-2 cursor-pointer hover:text-orange-700 font-medium inline-flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Click to link with batches
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Batches for this Server */}
                        {linkedBatches.length > 0 && (
                          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-3">
                              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <FolderPlus className="w-5 h-5" />
                                server {server.name} batch
                              </h3>
                            </div>
                            <div className="p-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {linkedBatches.map((batch) => {
                                  // Check if any other batch in the same server is processing
                                  const otherBatchesInServer = linkedBatches.filter(b => b.id !== batch.id);
                                  const hasProcessingBatch = otherBatchesInServer.some(b => b.status === 'processing');
                                  const canStart = !hasProcessingBatch && batch.status !== 'processing' && batch.status !== 'completed';
                                  
                                  return (
                                    <div key={batch.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900 text-base">{batch.name}</h4>
                                          {batch.startDate && batch.endDate && batch.startDate !== '' && batch.endDate !== '' && (
                                            <div className="flex items-center gap-2 mt-2">
                                              <CalendarIcon className="w-4 h-4 text-gray-500" />
                                              <p className="text-sm text-gray-600">
                                                {new Date(batch.startDate).toLocaleDateString()} - {new Date(batch.endDate).toLocaleDateString()}
                                              </p>
                                              <div className="flex flex-wrap gap-1">
                                                {getDayNumbers(batch.startDate, batch.endDate).map((day) => (
                                                  <span 
                                                    key={day} 
                                                    className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                                      batch.status === 'processing' 
                                                        ? 'bg-green-200 text-green-800' 
                                                        : batch.status === 'completed'
                                                        ? 'bg-gray-200 text-gray-700'
                                                        : 'bg-indigo-100 text-indigo-700'
                                                    }`}
                                                  >
                                                    {day}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          {canStart && (
                                            <button
                                              onClick={() => handleStartBatch(batch.id)}
                                              className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-semibold"
                                            >
                                              Start
                                            </button>
                                          )}
                                          {batch.status === 'processing' && (
                                            <div className="mt-2 flex items-center gap-2">
                                              <span className="inline-block px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                                                Processing
                                              </span>
                                              <button
                                                onClick={() => handleCompleteBatch(batch.id)}
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold"
                                              >
                                                Done
                                              </button>
                                            </div>
                                          )}
                                          {batch.status === 'completed' && (
                                            <span className="mt-2 inline-block px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold">
                                              Completed
                                            </span>
                                          )}
                                          <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs font-medium text-gray-500">Linked to:</span>
                                            <span className="text-xs text-indigo-600 font-semibold">{server.name}</span>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => handleDeleteBatch(batch.id)}
                                          className="ml-4 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Delete batch"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No servers created yet</p>
                </div>
              )}

              {/* Unlinked Batches */}
              {selectedProject.batches && selectedProject.batches.length > 0 && (
                (() => {
                  const linkedBatchIds = new Set(
                    selectedProject.servers?.flatMap(s => s.batchIds || []) || []
                  );
                  const unlinkedBatches = selectedProject.batches.filter(b => !linkedBatchIds.has(b.id));
                  
                  if (unlinkedBatches.length > 0) {
                    return (
                      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3">
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            Unlinked Batches
                          </h3>
                        </div>
                        <div className="p-5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {unlinkedBatches.map((batch) => (
                              <div key={batch.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-gray-900 text-base">{batch.name}</h4>
                                    {batch.startDate && batch.endDate && batch.startDate !== '' && batch.endDate !== '' && (
                                      <div className="flex items-center gap-2 mt-2">
                                        <CalendarIcon className="w-4 h-4 text-gray-500" />
                                        <p className="text-sm text-gray-600">
                                          {new Date(batch.startDate).toLocaleDateString()} - {new Date(batch.endDate).toLocaleDateString()}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {getDayNumbers(batch.startDate, batch.endDate).map((day) => (
                                            <span 
                                              key={day} 
                                              className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                                batch.status === 'processing' 
                                                  ? 'bg-green-200 text-green-800' 
                                                  : batch.status === 'completed'
                                                  ? 'bg-gray-200 text-gray-700'
                                                  : 'bg-orange-100 text-orange-700'
                                              }`}
                                            >
                                              {day}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {batch.status !== 'processing' && batch.status !== 'completed' && (
                                      <button
                                        onClick={() => handleStartBatch(batch.id)}
                                        className="mt-2 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold"
                                      >
                                        Start
                                      </button>
                                    )}
                                    {batch.status === 'processing' && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="inline-block px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                                          Processing
                                        </span>
                                        <button
                                          onClick={() => handleCompleteBatch(batch.id)}
                                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold"
                                        >
                                          Done
                                        </button>
                                      </div>
                                    )}
                                    {batch.status === 'completed' && (
                                      <span className="mt-2 inline-block px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold">
                                        Completed
                                      </span>
                                    )}
                                    <p className="text-xs text-orange-600 mt-2 font-medium">
                                      Not linked to any server
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteBatch(batch.id)}
                                    className="ml-4 p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete batch"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Calendar Modal */}
      {showBatchCalendar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                Select {calendarMode === 'batch-start' ? 'Start' : 'End'} Date for Batch
              </h2>
              <button
                onClick={() => {
                  setShowBatchCalendar(false);
                  setBatchStartDate(null);
                  setBatchEndDate(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-indigo-600" />
                    {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigateMonth('prev')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <span className="text-gray-600 text-xs">←</span>
                    </button>
                    <button
                      onClick={() => setCurrentMonth(new Date())}
                      className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-colors"
                    >
                      Today
                    </button>
                    <button
                      onClick={() => navigateMonth('next')}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      <span className="text-gray-600 text-xs">→</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center font-medium text-gray-600 text-[10px] py-1">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="aspect-square"></div>;
                    }

                    const isToday = date.toDateString() === new Date().toDateString();
                    const isStartDate = batchStartDate && date.toDateString() === batchStartDate.toDateString();
                    const isEndDate = batchEndDate && date.toDateString() === batchEndDate.toDateString();
                    const isBeforeStart = batchStartDate && date < batchStartDate && calendarMode === 'batch-end';

                    return (
                      <button
                        key={date.toISOString()}
                        onClick={() => handleDateClick(date)}
                        disabled={isBeforeStart}
                        className={`aspect-square p-1 rounded border transition-all ${
                          isStartDate || isEndDate
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-md'
                            : isToday
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        } ${isBeforeStart ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="text-xs font-medium">{date.getDate()}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {batchStartDate && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Start Date:</span> {batchStartDate.toLocaleDateString()}
                  </p>
                  {batchEndDate && (
                    <p className="text-sm text-gray-700 mt-1">
                      <span className="font-semibold">End Date:</span> {batchEndDate.toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {batchStartDate && batchEndDate && (
                <div className="mt-4">
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="Enter batch name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-3"
                  />
                  <button
                    onClick={handleAddBatch}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                  >
                    Add Batch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showServerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add Server</h2>
              <button
                onClick={() => {
                  setShowServerModal(false);
                  setServerName('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Server Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Enter server name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddServer();
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowServerModal(false);
                  setServerName('');
                }}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddServer}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch-Server Linking Modal */}
      {showBatchServerLinkModal && selectedServerForLinking && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                Link Batches to Server: {selectedServerForLinking.name}
              </h2>
              <button
                onClick={() => {
                  setShowBatchServerLinkModal(false);
                  setSelectedServerForLinking(null);
                }}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                Select which batches should be linked to this server:
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {(selectedProject.batches || []).map((batch) => {
                  const isLinked = selectedServerForLinking.batchIds?.includes(batch.id) || false;
                  // Check if any other batch linked to this server is processing
                  const otherBatchesInServer = (selectedProject.batches || []).filter(
                    b => (selectedServerForLinking.batchIds?.includes(b.id) || false) && b.id !== batch.id
                  );
                  const hasProcessingBatch = otherBatchesInServer.some(b => b.status === 'processing');
                  const canStart = !hasProcessingBatch && batch.status !== 'processing' && batch.status !== 'completed';
                  
                  return (
                    <div
                      key={batch.id}
                      onClick={() => handleLinkBatchToServer(batch.id, selectedServerForLinking.id)}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        isLinked
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">{batch.name}</h4>
                          {batch.startDate && batch.endDate && batch.startDate !== '' && batch.endDate !== '' && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-sm text-gray-600">
                                {new Date(batch.startDate).toLocaleDateString()} - {new Date(batch.endDate).toLocaleDateString()}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {getDayNumbers(batch.startDate, batch.endDate).map((day) => (
                                  <span 
                                    key={day} 
                                    className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                      batch.status === 'processing' 
                                        ? 'bg-green-200 text-green-800' 
                                        : batch.status === 'completed'
                                        ? 'bg-gray-200 text-gray-700'
                                        : 'bg-indigo-100 text-indigo-700'
                                    }`}
                                  >
                                    {day}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {canStart && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartBatch(batch.id);
                              }}
                              className="mt-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-semibold"
                            >
                              Start
                            </button>
                          )}
                          {batch.status === 'processing' && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="inline-block px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold">
                                Processing
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCompleteBatch(batch.id);
                                }}
                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold"
                              >
                                Done
                              </button>
                            </div>
                          )}
                          {batch.status === 'completed' && (
                            <span className="mt-2 inline-block px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold">
                              Completed
                            </span>
                          )}
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isLinked
                            ? 'border-indigo-500 bg-indigo-500'
                            : 'border-gray-300'
                        }`}>
                          {isLinked && <CheckCircle className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowBatchServerLinkModal(false);
                  setSelectedServerForLinking(null);
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Timeline Modal */}
      {showDocumentTimeline && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-900">Document Timeline</h2>
              <button
                onClick={() => setShowDocumentTimeline(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {selectedProject.documents && selectedProject.documents.length > 0 ? (
                <div className="space-y-4">
                  {selectedProject.documents
                    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                    .map((doc, index) => (
                      <div key={doc.id} className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{doc.name}</h4>
                              <p className="text-sm text-gray-600 mt-1">
                                Uploaded: {new Date(doc.uploadedAt).toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Type: {doc.type.toUpperCase()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {doc.file ? (
                                <>
                                  <a
                                    href={URL.createObjectURL(doc.file)}
                                    download={doc.name}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                                  >
                                    Download
                                  </a>
                                  <button
                                    onClick={() => handleViewDocument(doc)}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-semibold"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDocument(doc.id, doc.mongoId)}
                                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete document"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : doc.mongoId ? (
                                <>
                                  <a
                                    href={`${BACKEND_URL}/api/documents/${doc.mongoId}/file`}
                                    download={doc.name}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                                  >
                                    Download
                                  </a>
                                  <button
                                    onClick={() => handleViewDocument(doc)}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-semibold"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDocument(doc.id, doc.mongoId)}
                                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete document"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm text-gray-500">File not available</p>
                                  <button
                                    onClick={() => handleDeleteDocument(doc.id)}
                                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete document"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No documents uploaded yet</p>
                  <p className="text-gray-400 text-sm mt-2">Upload documents using the "Upload Document" button</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showDocumentPreview && previewDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{previewDocument.name}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Uploaded: {new Date(previewDocument.uploadedAt).toLocaleString()} | Type: {previewDocument.type.toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {previewDocument.file ? (
                  <a
                    href={URL.createObjectURL(previewDocument.file)}
                    download={previewDocument.name}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                  >
                    Download
                  </a>
                ) : previewDocument.mongoId ? (
                  <a
                    href={`${BACKEND_URL}/api/documents/${previewDocument.mongoId}/file`}
                    download={previewDocument.name}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold"
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-sm text-gray-500">File not available</span>
                )}
                <button
                  onClick={() => {
                    setShowDocumentPreview(false);
                    setPreviewDocument(null);
                    setPreviewContent('');
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {!previewContent ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Loading preview...</p>
                  </div>
                </div>
              ) : previewDocument.type.toLowerCase() === '.pdf' ? (
                <iframe
                  src={previewContent}
                  className="w-full h-full min-h-[600px] border border-gray-200 rounded-lg"
                  title="PDF Preview"
                />
              ) : previewDocument.type.toLowerCase() === '.csv' ? (
                <div className="overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                    <thead className="bg-gray-50">
                      {previewContent.split('\n')[0] && (
                        <tr>
                          {previewContent.split('\n')[0].split(',').map((header, idx) => (
                            <th key={idx} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-300">
                              {header.trim()}
                            </th>
                          ))}
                        </tr>
                      )}
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {previewContent.split('\n').slice(1).map((row, rowIdx) => {
                        if (!row.trim()) return null;
                        return (
                          <tr key={rowIdx} className="hover:bg-gray-50">
                            {row.split(',').map((cell, cellIdx) => (
                              <td key={cellIdx} className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                                {cell.trim()}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : previewDocument.type.toLowerCase() === '.docx' || previewDocument.type.toLowerCase() === '.doc' || 
                  previewDocument.type.toLowerCase() === '.xls' || previewDocument.type.toLowerCase() === '.xlsx' ? (
                <div className="w-full h-full min-h-[600px]">
                  {previewContent && previewContent.includes('officeapps.live.com') ? (
                    <iframe
                      src={previewContent}
                      className="w-full h-full min-h-[600px] border border-gray-200 rounded-lg"
                      title="Document Preview"
                      allow="fullscreen"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full bg-gray-50 rounded-lg p-8">
                      <FileText className="w-16 h-16 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Preview Not Available</h3>
                      <p className="text-gray-600 text-center mb-6 max-w-md">
                        Preview for {previewDocument.type.toUpperCase()} files requires the file to be accessible via a public URL.
                        Please download the file to view it.
                      </p>
                      {previewDocument.file ? (
                        <a
                          href={previewContent}
                          download={previewDocument.name}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                        >
                          Download File
                        </a>
                      ) : previewDocument.mongoId ? (
                        <a
                          href={`${BACKEND_URL}/api/documents/${previewDocument.mongoId}/file`}
                          download={previewDocument.name}
                          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                        >
                          Download File
                        </a>
                      ) : (
                        <span className="text-sm text-gray-500">File not available</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">Preview not available for this file type</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MigrationMonitoringDashboard;
