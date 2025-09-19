import React, { useState, useCallback } from 'react';
import { Upload, Eye, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { PDFProcessingResult } from '../types';
import { PDFValidator } from '../utils/helpers';
import { pdfOrchestrator } from '../utils/pdfOrchestratorIntegration';

interface TemplateProcessorProps {
  quoteData: any;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

export const TemplateProcessor: React.FC<TemplateProcessorProps> = ({
  quoteData,
  onError,
  onSuccess
}) => {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<PDFProcessingResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validation = PDFValidator.validatePDF(file);
      if (validation.isValid) {
        setTemplateFile(file);
        setProcessingResult(null);
        setPreviewUrl(null);
      } else {
        onError(`Invalid file: ${validation.errors.join(', ')}`);
      }
    }
  }, [onError]);

  const handleProcessTemplate = async () => {
    if (!templateFile || !quoteData) return;

    try {
      setIsProcessing(true);
      const result = await pdfOrchestrator.buildMergedPDFFromFile(templateFile, quoteData);
      
      if (result.success) {
        setProcessingResult(result);
        onSuccess('Template processed successfully');
      } else {
        onError(result.error || 'Failed to process template');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = () => {
    if (processingResult?.processedPDF) {
      const url = URL.createObjectURL(processingResult.processedPDF);
      setPreviewUrl(url);
      window.open(url, '_blank');
    }
  };

  const handleDownload = () => {
    if (processingResult?.processedPDF && templateFile) {
      const filename = `Processed_${templateFile.name}`;
      const url = URL.createObjectURL(processingResult.processedPDF);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onSuccess('Document downloaded successfully');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Template Processor</h2>
      
      {/* File Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload PDF Template
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="template-upload"
          />
          <label
            htmlFor="template-upload"
            className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Choose File
          </label>
          {templateFile && (
            <p className="mt-2 text-sm text-gray-600">{templateFile.name}</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleProcessTemplate}
          disabled={!templateFile || isProcessing}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle className="h-5 w-5" />
          )}
          {isProcessing ? 'Processing...' : 'Process Template'}
        </button>

        {processingResult?.processedPDF && (
          <>
            <button
              onClick={handlePreview}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Eye className="h-5 w-5" />
              Preview
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Download className="h-5 w-5" />
              Download
            </button>
          </>
        )}
      </div>

      {/* Processing Status */}
      {processingResult && (
        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <h3 className="text-lg font-semibold text-green-800">Processing Complete</h3>
          </div>
          <div className="text-sm text-green-700">
            <p>Processing time: {processingResult.processingTime}ms</p>
            <p>Tokens replaced: {processingResult.tokensReplaced}</p>
            <p>Form fields filled: {processingResult.formFieldsFilled}</p>
          </div>
        </div>
      )}
    </div>
  );
};
