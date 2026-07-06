import {
  fillPDFForm,
  getFormFieldInfo,
  downloadFilledPDF,
  validatePDFForFormFilling,
  createSampleFormData,
  formatFormFieldsForDisplay,
  getFormFieldStatistics,
  FormFillingData,
  FormFillingResult,
  FormFieldInfo
} from './pdfFormFiller';

/**
 * Integration helper for using PDF form filler in React components
 */
export class PDFFormFillerIntegration {
  private static instance: PDFFormFillerIntegration;
  
  public static getInstance(): PDFFormFillerIntegration {
    if (!PDFFormFillerIntegration.instance) {
      PDFFormFillerIntegration.instance = new PDFFormFillerIntegration();
    }
    return PDFFormFillerIntegration.instance;
  }
  
  /**
   * Fill PDF form from file upload
   */
  async fillPDFFormFromFile(
    file: File,
    data: FormFillingData
  ): Promise<FormFillingResult> {
    try {
      console.log('🔄 PDFFormFillerIntegration: Processing PDF file...');
      console.log('📄 File:', file.name, 'Size:', file.size, 'bytes');
      
      // Validate file
      const validation = validatePDFForFormFilling(file);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid PDF file');
      }
      
      // Convert to ArrayBuffer
      const pdfBytes = await file.arrayBuffer();
      
      // Fill the form
      const result = await fillPDFForm(pdfBytes, data);
      
      if (result.success) {
        console.log('✅ PDFFormFillerIntegration: Form filled successfully');
        console.log(`📊 Filled ${result.filledCount}/${result.totalFields} fields`);
      } else {
        console.error('❌ PDFFormFillerIntegration: Form filling failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFFormFillerIntegration: Error processing PDF:', error);
      return {
        success: false,
        filledFields: [],
        totalFields: 0,
        filledCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: 0
      };
    }
  }
  
  /**
   * Get form field information from file
   */
  async getFormFieldsFromFile(file: File): Promise<{
    success: boolean;
    fields: FormFieldInfo[];
    totalFields: number;
    error?: string;
  }> {
    try {
      console.log('🔍 PDFFormFillerIntegration: Getting form field information...');
      
      // Validate file
      const validation = validatePDFForFormFilling(file);
      if (!validation.isValid) {
        throw new Error(validation.error || 'Invalid PDF file');
      }
      
      // Convert to ArrayBuffer
      const pdfBytes = await file.arrayBuffer();
      
      // Get form field info
      const result = await getFormFieldInfo(pdfBytes);
      
      if (result.success) {
        console.log(`✅ PDFFormFillerIntegration: Found ${result.totalFields} form fields`);
      } else {
        console.error('❌ PDFFormFillerIntegration: Failed to get form fields:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ PDFFormFillerIntegration: Error getting form fields:', error);
      return {
        success: false,
        fields: [],
        totalFields: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Download filled PDF with automatic filename generation
   */
  downloadFilledPDFWithName(
    pdfBlob: Blob,
    originalFilename: string,
    data: FormFillingData
  ): void {
    try {
      // Generate filename based on data
      const timestamp = new Date().toISOString().slice(0, 10);
      const companyName = data.company?.replace(/[^a-zA-Z0-9]/g, '_') || 'Company';
      const filename = `${companyName}_Filled_${timestamp}.pdf`;
      
      downloadFilledPDF(pdfBlob, filename);
      
      console.log(`✅ PDFFormFillerIntegration: Downloaded filled PDF as "${filename}"`);
      
    } catch (error) {
      console.error('❌ PDFFormFillerIntegration: Error downloading PDF:', error);
      throw new Error('Failed to download filled PDF');
    }
  }
  
  /**
   * Create form filling data from quote data
   */
  createFormDataFromQuote(quoteData: any): FormFillingData {
    try {
      console.log('🔄 PDFFormFillerIntegration: Creating form data from quote...');
      
      const formData: FormFillingData = {};
      
      // Map quote data to form fields
      if (quoteData.clientName) {
        formData.clientName = quoteData.clientName;
      }
      
      if (quoteData.clientEmail) {
        formData.email = quoteData.clientEmail;
      }
      
      if (quoteData.company) {
        formData.company = quoteData.company;
      }
      
      if (quoteData.configuration?.numberOfUsers) {
        formData.users = quoteData.configuration.numberOfUsers;
      }
      
      if (quoteData.calculation?.totalCost) {
        formData.totalPrice = quoteData.calculation.totalCost;
      }
      
      if (quoteData.createdAt) {
        formData.date = quoteData.createdAt instanceof Date 
          ? quoteData.createdAt 
          : new Date(quoteData.createdAt);
      }
      
      // Add custom fields
      formData.customFields = {
        'quote_id': quoteData.id || 'N/A',
        'migration_type': quoteData.configuration?.migrationType || 'N/A',
        'instance_type': quoteData.configuration?.instanceType || 'N/A',
        'duration': quoteData.configuration?.duration?.toString() || 'N/A',
        'data_size': quoteData.configuration?.dataSizeGB?.toString() || 'N/A',
        'plan_name': quoteData.calculation?.tier?.name || 'N/A'
      };
      
      console.log('✅ PDFFormFillerIntegration: Form data created successfully');
      console.log('📊 Form data:', formData);
      
      return formData;
      
    } catch (error) {
      console.error('❌ PDFFormFillerIntegration: Error creating form data:', error);
      return createSampleFormData();
    }
  }
  
  /**
   * Get form field summary for UI display
   */
  getFormFieldSummary(fields: FormFieldInfo[]): {
    hasFields: boolean;
    totalFields: number;
    fieldsByCategory: { [key: string]: number };
    fieldsByType: { [key: string]: number };
    fillableFields: number;
    readOnlyFields: number;
    requiredFields: number;
  } {
    if (fields.length === 0) {
      return {
        hasFields: false,
        totalFields: 0,
        fieldsByCategory: {},
        fieldsByType: {},
        fillableFields: 0,
        readOnlyFields: 0,
        requiredFields: 0
      };
    }
    
    const stats = getFormFieldStatistics(fields);
    
    return {
      hasFields: true,
      totalFields: stats.totalFields,
      fieldsByCategory: stats.fieldsByCategory,
      fieldsByType: stats.fieldsByType,
      fillableFields: stats.totalFields - stats.readOnlyFields,
      readOnlyFields: stats.readOnlyFields,
      requiredFields: stats.requiredFields
    };
  }
  
  /**
   * Format form fields for table display
   */
  formatFormFieldsForTable(fields: FormFieldInfo[]): Array<{
    id: string;
    name: string;
    type: string;
    category: string;
    confidence: string;
    isReadOnly: boolean;
    isRequired: boolean;
    status: string;
  }> {
    return fields.map((field, index) => ({
      id: `field-${index}`,
      name: field.name,
      type: field.type,
      category: field.category,
      confidence: `${(field.confidence * 100).toFixed(1)}%`,
      isReadOnly: field.isReadOnly,
      isRequired: field.isRequired,
      status: field.isReadOnly ? 'Read Only' : field.isRequired ? 'Required' : 'Optional'
    }));
  }
  
  /**
   * Validate form filling data
   */
  validateFormData(data: FormFillingData): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check required fields
    if (!data.company && !data.clientName && !data.email) {
      warnings.push('No company, client name, or email provided');
    }
    
    // Validate email format if provided
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('Invalid email format');
    }
    
    // Validate numeric fields
    if (data.users !== undefined && (data.users < 0 || !Number.isInteger(data.users))) {
      errors.push('Users count must be a positive integer');
    }
    
    if (data.totalPrice !== undefined && (data.totalPrice < 0 || typeof data.totalPrice !== 'number')) {
      errors.push('Total price must be a positive number');
    }
    
    // Validate date
    if (data.date) {
      const date = data.date instanceof Date ? data.date : new Date(data.date);
      if (isNaN(date.getTime())) {
        errors.push('Invalid date format');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Preview form filling results
   */
  previewFormFillingResults(result: FormFillingResult): {
    success: boolean;
    summary: string;
    details: string[];
    statistics: {
      totalFields: number;
      filledFields: number;
      fillRate: string;
      processingTime: string;
    };
  } {
    if (!result.success) {
      return {
        success: false,
        summary: 'Form filling failed',
        details: [result.error || 'Unknown error'],
        statistics: {
          totalFields: 0,
          filledFields: 0,
          fillRate: '0%',
          processingTime: '0ms'
        }
      };
    }
    
    const fillRate = result.totalFields > 0 
      ? ((result.filledCount / result.totalFields) * 100).toFixed(1)
      : '0';
    
    const details = [
      `Total form fields: ${result.totalFields}`,
      `Fields filled: ${result.filledCount}`,
      `Fill rate: ${fillRate}%`,
      `Processing time: ${result.processingTime}ms`
    ];
    
    if (result.filledFields.length > 0) {
      details.push('Filled fields:');
      result.filledFields.forEach(field => {
        details.push(`  • ${field.name} (${field.category})`);
      });
    }
    
    return {
      success: true,
      summary: `Successfully filled ${result.filledCount} of ${result.totalFields} form fields`,
      details,
      statistics: {
        totalFields: result.totalFields,
        filledFields: result.filledCount,
        fillRate: `${fillRate}%`,
        processingTime: `${result.processingTime}ms`
      }
    };
  }
  
  /**
   * Export form field information to CSV
   */
  exportFormFieldsToCSV(fields: FormFieldInfo[]): string {
    const headers = [
      'Field Name',
      'Type',
      'Category',
      'Confidence',
      'Read Only',
      'Required'
    ];
    
    const rows = fields.map(field => [
      field.name,
      field.type,
      field.category,
      `${(field.confidence * 100).toFixed(1)}%`,
      field.isReadOnly ? 'Yes' : 'No',
      field.isRequired ? 'Yes' : 'No'
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csvContent;
  }
  
  /**
   * Download form field information as CSV
   */
  downloadFormFieldsAsCSV(fields: FormFieldInfo[], filename: string = 'form_fields.csv'): void {
    try {
      const csvContent = this.exportFormFieldsToCSV(fields);
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      console.log(`✅ Form fields exported to CSV: ${filename}`);
      
    } catch (error) {
      console.error('❌ Error exporting form fields to CSV:', error);
      throw new Error('Failed to export form fields to CSV');
    }
  }
}

// Export singleton instance
export const pdfFormFiller = PDFFormFillerIntegration.getInstance();

// Export utility functions for direct use
export {
  fillPDFForm,
  getFormFieldInfo,
  downloadFilledPDF,
  validatePDFForFormFilling,
  createSampleFormData,
  formatFormFieldsForDisplay,
  getFormFieldStatistics,
  type FormFillingData,
  type FormFillingResult,
  type FormFieldInfo
};
