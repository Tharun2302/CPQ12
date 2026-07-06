
import React, { useState, useCallback } from 'react';
import { Upload, Download, CheckCircle, Loader2, FileText } from 'lucide-react';
import { DocxProcessingResult } from '../types';
import { DocxValidator } from '../utils/helpers';
import { docxTemplateProcessor, DocxTemplateData } from '../utils/docxTemplateProcessor';

interface DocxTemplatesProps {
  quoteData: any;
  onError: (error: string) => void;
  onSuccess: (message: string) => void;
}

export const DocxTemplates: React.FC<DocxTemplatesProps> = ({
  quoteData,
  onError,
  onSuccess
}) => {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<DocxProcessingResult | null>(null);
  const [extractedTokens, setExtractedTokens] = useState<string[]>([]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validation = DocxValidator.validateDocx(file);
      if (validation.isValid) {
        setTemplateFile(file);
        setProcessingResult(null);
        extractTokens(file);
      } else {
        onError(`Invalid file: ${validation.errors.join(', ')}`);
      }
    }
  }, [onError]);

  const extractTokens = async (file: File) => {
    try {
      const result = await docxTemplateProcessor.extractTokensFromTemplate(file);
      if (result.success) {
        setExtractedTokens(result.tokens);
      }
    } catch (error) {
      console.warn('Failed to extract tokens:', error);
    }
  };

  const handleProcessTemplate = async () => {
    if (!templateFile || !quoteData) return;

    try {
      setIsProcessing(true);
      
      // Convert quote data to DOCX template format
      const templateData: DocxTemplateData = {
        company: quoteData.client?.companyName || 'N/A',
        clientName: quoteData.client?.clientName || 'N/A',
        email: quoteData.client?.clientEmail || 'N/A',
        users: quoteData.configuration?.numberOfUsers || 0,
        price_migration: `$${quoteData.costs?.migrationCost || 0}`,
        price_data: `$${quoteData.costs?.dataCost || 0}`,
        total: `$${quoteData.costs?.totalCost || 0}`,
        date: new Date().toLocaleDateString(),
        instanceType: quoteData.configuration?.instanceType || 'Standard',
        duration: quoteData.configuration?.duration || 1,
        dataSize: quoteData.configuration?.dataSizeGB || 0,
        quoteId: quoteData.quoteId || 'N/A',
        planName: quoteData.selectedPlan?.name || 'Basic'
      };

      const result = await docxTemplateProcessor.processDocxTemplate(templateFile, templateData);
      
      if (result.success) {
        setProcessingResult(result);
        onSuccess('DOCX template processed successfully');
      } else {
        onError(result.error || 'Failed to process DOCX template');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (processingResult?.processedDocx && templateFile) {
      const filename = `Processed_${templateFile.name}`;
      const url = URL.createObjectURL(processingResult.processedDocx);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onSuccess('DOCX document downloaded successfully');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <FileText className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold text-gray-900">DOCX Templates</h2>
      </div>
      
      {/* File Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload DOCX Template
        </label>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <input
            type="file"
            accept=".docx"
            onChange={handleFileUpload}
            className="hidden"
            id="docx-upload"
          />
          <label
            htmlFor="docx-upload"
            className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Choose DOCX File
          </label>
          {templateFile && (
            <p className="mt-2 text-sm text-gray-600">{templateFile.name}</p>
          )}
        </div>
      </div>

      {/* Extracted Tokens */}
      {extractedTokens.length > 0 && (
        <div className="mb-6 bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Found Tokens</h3>
          <div className="flex flex-wrap gap-2">
            {extractedTokens.map((token, index) => (
              <span
                key={index}
                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
              >
                {`{{${token}}}`}
              </span>
            ))}
          </div>
        </div>
      )}

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
          {isProcessing ? 'Processing...' : 'Process DOCX Template'}
        </button>

        {processingResult?.processedDocx && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Download className="h-5 w-5" />
            Download DOCX
          </button>
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
            <p>Original size: {(processingResult.originalSize / 1024).toFixed(2)} KB</p>
            <p>Final size: {(processingResult.finalSize / 1024).toFixed(2)} KB</p>
          </div>
        </div>
      )}

      {/* Supported Tokens Info */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Supported Tokens</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          {[
            '{{company}}', '{{clientName}}', '{{email}}', '{{users}}',
            '{{price_migration}}', '{{price_data}}', '{{total}}', '{{date}}',
            '{{instanceType}}', '{{duration}}', '{{dataSize}}', '{{quoteId}}',
            '{{planName}}'
          ].map((token, index) => (
            <span key={index} className="bg-gray-200 text-gray-700 px-2 py-1 rounded">
              {token}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
