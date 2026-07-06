// Core Quote Data Interface
export interface QuoteData {
  id: string;
  client: {
    companyName: string;
    clientName: string;
    clientEmail: string;
  };
  configuration: {
    numberOfUsers: number;
    instanceType: string;
    numberOfInstances: number;
    duration: number;
    migrationType: string;
    dataSizeGB: number;
  };
  costs: {
    userCost: number;
    dataCost: number;
    migrationCost: number;
    instanceCost: number;
    totalCost: number;
  };
  selectedPlan: {
    name: string;
    price: number;
    features: string[];
  };
  quoteId: string;
  generatedDate: Date;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  templateUsed?: {
    id: string;
    name: string;
    type: 'pdf' | 'docx';
    isDefault: boolean;
  };
}

// Token Box Interface for PDF/DOCX token positions
export interface TokenBox {
  token: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  boundingBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

// Configuration Inputs Interface
export interface ConfigurationInputs {
  numberOfUsers: number;
  instanceType: 'Basic' | 'Standard' | 'Premium' | 'Enterprise';
  numberOfInstances: number;
  duration: number;
  migrationType: 'Messaging';
  dataSizeGB: number;
}

// Client Details Interface
export interface ClientDetails {
  companyName: string;
  clientName: string;
  clientEmail: string;
  phone?: string;
  address?: string;
  website?: string;
}

// PDF Processing Interfaces
export interface PDFProcessingResult {
  success: boolean;
  processedPDF?: Blob;
  originalPDF?: Blob;
  error?: string;
  processingTime: number;
  tokensReplaced: number;
  formFieldsFilled: number;
  overlayRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex: number;
  };
}

export interface PDFRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
  confidence: number;
  detectionMethod: 'text_analysis' | 'fallback' | 'manual';
}

// DOCX Processing Interfaces
export interface DocxProcessingResult {
  success: boolean;
  processedDocx?: Blob;
  error?: string;
  processingTime: number;
  tokensReplaced: number;
  originalSize: number;
  finalSize: number;
}

// File Upload Interfaces
export interface FileUploadResult {
  success: boolean;
  file?: File;
  error?: string;
  fileSize: number;
  fileType: string;
  fileName: string;
}

export interface FileValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  maxSize: number;
  allowedTypes: string[];
}

// Processing Status Interfaces
export interface ProcessingStatus {
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  totalSteps: number;
  error?: string;
  warnings: string[];
}

export interface ProcessingStep {
  step: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

// UI State Interfaces
export interface UIState {
  activeTab: 'configure' | 'quote' | 'template' | 'templates';
  isLoading: boolean;
  error: string | null;
  success: string | null;
  processingStatus: ProcessingStatus;
}

// Template Management Interfaces
export interface Template {
  id: string;
  name: string;
  type: 'pdf' | 'docx';
  file: File;
  isDefault: boolean;
  createdAt: Date;
  lastUsed?: Date;
  tokens: string[];
}

export interface TemplateManager {
  templates: Template[];
  activeTemplate: Template | null;
  isUploading: boolean;
  uploadProgress: number;
}

// Quote Generation Interfaces
export interface QuoteGenerationOptions {
  includeTerms: boolean;
  includeSignature: boolean;
  theme: 'blue' | 'green' | 'purple' | 'gray';
  companyInfo: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo?: string;
  };
}

export interface QuoteGenerationResult {
  success: boolean;
  quotePDF?: Blob;
  quoteId: string;
  processingTime: number;
  error?: string;
}

// Error Handling Interfaces
export interface AppError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  component?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorInfo?: any;
}

// Local Storage Interfaces
export interface LocalStorageData {
  quoteData: QuoteData | null;
  clientDetails: ClientDetails | null;
  configuration: ConfigurationInputs | null;
  templates: Template[];
  settings: {
    theme: string;
    autoSave: boolean;
    defaultTemplate: string | null;
  };
}

// API Response Interfaces
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

// Form Validation Interfaces
export interface FormValidation {
  isValid: boolean;
  errors: { [key: string]: string };
  warnings: { [key: string]: string };
}

export interface FormField {
  name: string;
  value: any;
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    custom?: (value: any) => string | null;
  };
}

// Performance Monitoring Interfaces
export interface PerformanceMetrics {
  processingTime: number;
  memoryUsage: number;
  fileSize: number;
  tokensProcessed: number;
  stepsCompleted: number;
  errors: number;
  warnings: number;
}

// Browser Compatibility Interfaces
export interface BrowserCapabilities {
  supportsFileAPI: boolean;
  supportsBlob: boolean;
  supportsArrayBuffer: boolean;
  supportsWebWorkers: boolean;
  supportsPDFJS: boolean;
  maxFileSize: number;
  supportedFileTypes: string[];
}

// Security Interfaces
export interface SecurityConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
  scanForMalware: boolean;
  validateFileHeaders: boolean;
  sanitizeInputs: boolean;
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

// Export all interfaces
export type {
  QuoteData,
  TokenBox,
  ConfigurationInputs,
  ClientDetails,
  PDFProcessingResult,
  PDFRegion,
  DocxProcessingResult,
  FileUploadResult,
  FileValidation,
  ProcessingStatus,
  ProcessingStep,
  UIState,
  Template,
  TemplateManager,
  QuoteGenerationOptions,
  QuoteGenerationResult,
  AppError,
  ErrorBoundaryState,
  LocalStorageData,
  APIResponse,
  FormValidation,
  FormField,
  PerformanceMetrics,
  BrowserCapabilities,
  SecurityConfig
};
